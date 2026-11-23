#!/usr/bin/env bash
# LOCAL VERIFICATION of the Docker production build (development computer, Docker in WSL).
# Never run on the VPS: it resets a demo database inside the local Docker trial.
#
#   bash scripts/audit/docker-verify.sh <screenshot folder>      (from Git Bash on Windows)
#
# 1. builds the production image (docker-compose.yml) with .env.docker-local;
# 2. seeds the throw-away database twigo_walk_demo inside the db container;
# 3. starts the app (port 1010) and a test mail catcher sharing its network (docker-compose.verify.yml);
# 4. checks: Next.js listens on 1010 in the container, 127.0.0.1:1010 on the host, health;
# 5. runs the 61-step role walkthrough against http://127.0.0.1:1010 (scripts/audit/walkthrough.ts);
# 6. restores the backup the owner made during the walkthrough into a second database and compares.
set -u
cd "$(dirname "$0")/../.." || exit 1
OUT="${1:-docs/twigo-docker-screenshots}"
WIN_DIR="$(pwd)"
WSL_DIR="/mnt/$(echo "${WIN_DIR:1:1}" | tr 'A-Z' 'a-z')${WIN_DIR:2}"
DC="cd '$WSL_DIR' && export TWIGO_ENV_FILE=.env.docker-local && docker compose -f docker-compose.yml -f docker-compose.verify.yml --env-file .env.docker-local"
run() { wsl -e bash -c "$DC $*"; }

[ -f .env.docker-local ] || { echo "missing .env.docker-local (see docs/DEPLOYMENT.md, section 5)"; exit 1; }
# Docker runs inside WSL here. Windows stops an idle WSL VM (and Docker with it) when no WSL command is
# running, which would stop the containers in the middle of the browser walkthrough. Keep one running.
wsl -e sh -c "sleep 7200" &
KEEPALIVE=$!
trap 'kill $KEEPALIVE 2>/dev/null' EXIT
rm -rf .verify-mail && mkdir -p .verify-mail && chmod 777 .verify-mail 2>/dev/null

echo "== build"
run build app > .verify-build.log 2>&1 || { tail -20 .verify-build.log; exit 1; }
echo "== database and demo data"
run up -d db | tail -1
for i in $(seq 1 40); do [ "$(wsl -e docker inspect -f '{{.State.Health.Status}}' twigo-db-1 2>/dev/null)" = healthy ] && break; sleep 2; done
run "run --rm --no-deps app sh -c 'DEMO_DATABASE_URL=\$DATABASE_URL node_modules/.bin/tsx scripts/seed-demo.ts'" 2>&1 | tail -1
echo "== app and mail catcher"
run up -d --force-recreate app mail 2>&1 | tail -2
for i in $(seq 1 60); do curl -s -o /dev/null http://127.0.0.1:1010/api/health && break; sleep 2; done
echo "== port checks"
wsl -e docker exec twigo-app-1 sh -c "cat /proc/net/tcp /proc/net/tcp6 | awk '\$4==\"0A\"{print \$2}' | grep -c ':03F2'" | sed 's/^/listening sockets on 1010 inside the container: /'
wsl -e docker port twigo-app-1
curl -s -w "  health HTTP %{http_code}\n" http://127.0.0.1:1010/api/health

echo "== walkthrough (61 steps) against the Docker build"
MSYS_NO_PATHCONV=1 AUDIT_URL=http://127.0.0.1:1010 WALK_MAIL_DIR=.verify-mail npx tsx scripts/audit/walkthrough.ts "$OUT"

echo "== backup restore check"
latest=$(wsl -e docker exec twigo-app-1 sh -c 'ls -t /data/backups/*.cwbak* 2>/dev/null | head -1')
if [ -n "$latest" ]; then
  echo "restoring $latest into twigo_restorecheck"
  wsl -e docker exec twigo-app-1 sh -c "node_modules/.bin/tsx scripts/backup.ts restore '$latest' --into twigo_restorecheck --replace" 2>&1 | tail -4
else
  echo "RESTORE: no backup file found in /data/backups"
fi

echo "== graceful stop (docker stop sends SIGTERM)"
run stop -t 30 app 2>&1 | tail -1
wsl -e docker inspect -f 'app exit code: {{.State.ExitCode}} (0 = clean shutdown)' twigo-app-1
wsl -e sh -c "docker logs twigo-app-1 2>&1 | grep -c '\"msg\":\"server.shutdown\"'" | sed 's/^/shutdown log lines: /'
run up -d app mail 2>&1 | tail -1
