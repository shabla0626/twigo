#!/usr/bin/env bash
# Server side of scripts/deploy/test-launcher.ps1; runs inside WSL. ISOLATED: a throw-away SSH server
# container (twigo-launchtest-sshd on 127.0.0.1:2222, and :2223 without SFTP) whose user "shabla" lives in
# /tmp/twigo-launchtest/home; deployments there use the Compose project "twigolaunchtest" and test secrets
# generated here. Never run against the VPS.
#   bash test-launcher-server.sh <up KEYDIR | env-good | env-bad | lock-hold | lock-release | fake-code N |
#                                 marker NAME SHA | unmarker | state | health | leaks FILE... | free-port | down>
set -euo pipefail
ROOT=/tmp/twigo-launchtest
HOME_DIR=$ROOT/home
SERVER=$HOME_DIR/Server
KEYS=$ROOT/keys
PROJ=twigolaunchtest
NAME=twigo-launchtest-sshd
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

h() { openssl rand -hex "$1"; }
write_env() {
  mkdir -p "$SERVER/twigo"
  cat > "$SERVER/twigo/.env.production" <<EOF
SITE_URL=https://twigo.space
PORT=1010
HOST=0.0.0.0
TRUSTED_PROXY_HOPS=2
POSTGRES_PASSWORD=$(h 24)
AUTH_SECRET=$(h 32)
ENCRYPTION_KEY=$(h 32)
BACKUP_ENCRYPTION_KEY=$(h 32)
ORG_NAME=Twigo
ORG_LEGAL_NAME=Twigo
ORG_JURISDICTION=Test Jurisdiction
ORG_CONTACT_EMAIL=contact@twigo.space
SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=resend
SMTP_PASSWORD=re_$(h 16)
EMAIL_FROM="Twigo <noreply@twigo.space>"
ADMIN_REQUIRE_2FA=true
JOBS_ENABLED=false
EOF
  chmod 600 "$SERVER/twigo/.env.production"
  { cat "$KEYS/admin_password"; echo
    grep -E '^(POSTGRES_PASSWORD|AUTH_SECRET|ENCRYPTION_KEY|BACKUP_ENCRYPTION_KEY|SMTP_PASSWORD)=' "$SERVER/twigo/.env.production" | cut -d= -f2-
  } > "$KEYS/secrets"
}
remove_project() {
  docker ps -aq --filter "label=com.docker.compose.project=$PROJ" | xargs -r docker rm -f > /dev/null 2>&1 || true
  docker network rm "${PROJ}_default" > /dev/null 2>&1 || true
  docker volume rm "${PROJ}_twigo-postgres" "${PROJ}_twigo-data" > /dev/null 2>&1 || true
}
down_all() {
  docker rm -f "$NAME" > /dev/null 2>&1 || true
  remove_project
  [[ -f "$ROOT/lock.pid" ]] && kill "$(cat "$ROOT/lock.pid")" 2> /dev/null || true
  rm -rf "$ROOT" 2> /dev/null || docker run --rm -v /tmp:/t ubuntu:24.04 rm -rf /t/twigo-launchtest
}

cmd="${1:?command}"; shift
case "$cmd" in
  up)        # up <folder with authorized_keys and ssh_host_ed25519_key>
    down_all
    mkdir -p "$KEYS" "$SERVER"
    chmod 700 "$KEYS"
    cp "$1/authorized_keys" "$1/ssh_host_ed25519_key" "$KEYS/"
    printf 'Owner-%s-pass1' "$(h 12)" > "$KEYS/admin_password"
    write_env
    docker build -q -t twigo-launchtest-sshd "$HERE/test-sshd" > /dev/null
    docker run -d --name "$NAME" --network host --restart no \
      -v /var/run/docker.sock:/var/run/docker.sock \
      -v /usr/bin/docker:/usr/bin/docker:ro \
      -v /usr/libexec/docker/cli-plugins:/usr/libexec/docker/cli-plugins:ro \
      -v "$ROOT:$ROOT" \
      -e TEST_UID="$(id -u)" -e DOCKER_GID="$(stat -c %g /var/run/docker.sock)" -e TEST_HOME="$HOME_DIR" -e KEYS="$KEYS" \
      twigo-launchtest-sshd > /dev/null
    for _ in $(seq 1 100); do
      if ss -ltnH 'sport = :2222' | grep -q . && ss -ltnH 'sport = :2223' | grep -q .; then echo "UP"; exit 0; fi
      sleep 0.2
    done
    docker logs "$NAME" | tail -n 20; echo "SSH test server did not start"; exit 1 ;;
  env-good)  write_env ;;
  env-bad)   sed -i 's/^ORG_JURISDICTION=.*/ORG_JURISDICTION=/' "$SERVER/twigo/.env.production" ;;
  lock-hold)
    mkdir -p "$SERVER"
    nohup flock -o "$SERVER/.twigo-deploy.lock" sleep 600 > /dev/null 2>&1 &
    echo $! > "$ROOT/lock.pid"; sleep 0.5 ;;
  lock-release) p="$(cat "$ROOT/lock.pid")"; pkill -P "$p" 2> /dev/null || true; kill "$p" 2> /dev/null || true; rm -f "$ROOT/lock.pid"; sleep 0.3 ;;
  fake-code) echo "$1" > "$SERVER/fake-exit-code" ;;
  marker)    mkdir -p "$SERVER/twigo"; printf '%s %s\n%s\n' "$1" "$2" "deployed (test marker)" > "$SERVER/twigo/.twigo-release" ;;
  unmarker)  rm -f "$SERVER/twigo/.twigo-release" ;;
  state)     # what is on the "server": top-level names, upload folder, hashes, settings hash
    echo "TOP=$(cd "$SERVER" && ls -A | tr '\n' ' ')"
    echo "UPLOAD=$(ls -A "$SERVER/.twigo-upload" 2> /dev/null | tr '\n' ' ')"
    for f in deploy-twigo.sh "$SERVER"/twigo-*.tar.gz "$SERVER"/twigo-*.tar.gz.sha256; do
      [[ -f "$SERVER/$(basename "$f")" ]] && echo "SHA $(basename "$f") $(sha256sum < "$SERVER/$(basename "$f")" | cut -c1-64)"
    done
    [[ -f "$SERVER/twigo/.env.production" ]] && echo "ENVSHA $(sha256sum < "$SERVER/twigo/.env.production" | cut -c1-64)"
    echo "ENVFILES=$(find "$SERVER" -name '.env*' -not -path "$SERVER/twigo/*" -not -path "$SERVER/backups/*" | tr '\n' ' ')"
    echo "STRAY=$(find "$SERVER" -maxdepth 1 \( -name '.vps.local' -o -name '.deploy-once.env' -o -name 'KEEP-SECRET*' -o -name 'run-remote.sh' \) | tr '\n' ' ')"
    echo "MARKER=$(head -n 1 "$SERVER/twigo/.twigo-release" 2> /dev/null)" ;;
  health)    curl -fsS --max-time 10 http://127.0.0.1:1010/api/health ;;
  leaks)     # leaks <files...>: prints LEAK if any test secret appears in the given files or the server logs
    found=0
    while IFS= read -r s; do
      [[ -n "$s" ]] || continue
      if grep -rqF -- "$s" "$@" "$SERVER/logs" 2> /dev/null; then found=1; fi
    done < "$KEYS/secrets"
    [[ $found == 0 ]] && echo "NO-LEAK" || echo "LEAK" ;;
  free-port) # the deployment test's containers use port 1010 too
    docker ps -aq --filter "label=com.docker.compose.project=twigodeploytest" | xargs -r docker rm -f > /dev/null 2>&1 || true
    remove_project ;;
  down)      down_all; echo "DOWN" ;;
  *) echo "unknown command $cmd"; exit 2 ;;
esac
