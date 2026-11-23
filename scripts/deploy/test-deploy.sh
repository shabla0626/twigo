#!/usr/bin/env bash
# Test suite for deploy-twigo.sh. ISOLATED: runs in a throw-away folder (/tmp/twigo-deploytest) with its
# own Docker Compose project name (twigodeploytest), its own volumes and generated test secrets. Never
# run it on the production VPS. Needs Docker, port 1010 free, and the release archive.
#
#   bash scripts/deploy/test-deploy.sh <release archive .tar.gz>      (inside WSL/Linux)
#
# Scenarios: syntax; missing archive; wrong checksum; unsafe archive; secrets in archive; missing
# settings; second deployment while one is running (lock); fresh install (owner created, legal
# publication skipped); repeated deployment with legal publication (owner kept, data kept, database
# backup made); repeated again (idempotent); Docker only through sudo; failed Docker build (previous
# version restored and running); failed health check (previous version restored and running); SSH
# connection lost during the build (previous version restored and running); no secret value in any log.
# Every failure must end with its step's exit code (10 + step number) so callers can tell the stage.
set -uo pipefail
SRC_ARCHIVE="$(readlink -f "${1:?usage: test-deploy.sh <release archive>}")"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT=/tmp/twigo-deploytest
SERVER="$ROOT/Server"
PROJ=twigodeploytest
export TWIGO_COMPOSE_PROJECT=$PROJ TWIGO_ASSUME_NO=1
PASS=0; FAIL=0; RESULTS=()

result() { if [[ "$1" == pass ]]; then PASS=$((PASS + 1)); else FAIL=$((FAIL + 1)); fi; RESULTS+=("$1  $2"); echo "== $1: $2"; }
deploy() { bash "$SERVER/deploy-twigo.sh" > "$ROOT/last-run.txt" 2>&1 < /dev/null; }
ran_ok() { grep -q "DEPLOYMENT RESULT: SUCCESS" "$ROOT/last-run.txt"; }
said() { grep -q -- "$1" "$ROOT/last-run.txt"; }
dc() { docker compose -p $PROJ --project-directory "$SERVER/twigo" -f "$SERVER/twigo/docker-compose.yml" --env-file "$SERVER/twigo/.env.production" "$@"; }
sql() { dc exec -T db psql -U twigo -d twigo -At -c "$1"; }
pack() { # pack <dir> <archive name>: archive + checksum into $SERVER
  rm -f "$SERVER"/twigo-*.tar.gz "$SERVER"/twigo-*.tar.gz.sha256
  tar -czf "$SERVER/$2" -C "$1" .
  (cd "$SERVER" && sha256sum "$2" > "$2.sha256")
}
release_marker() { head -n 1 "$SERVER/twigo/.twigo-release" 2>/dev/null | awk '{print $1}'; }
healthy_on_1010() { curl -fsS --max-time 10 http://127.0.0.1:1010/api/health | grep -q '"status":"ok"'; }

cleanup_all() {
  # Containers of the test project, whatever state the previous run left the folder in.
  docker ps -aq --filter "label=com.docker.compose.project=$PROJ" | xargs -r docker rm -f >/dev/null 2>&1 || true
  docker network rm ${PROJ}_default >/dev/null 2>&1 || true
  docker volume rm ${PROJ}_twigo-postgres ${PROJ}_twigo-data >/dev/null 2>&1 || true
  rm -rf "$ROOT"
}

# ---------------------------------------------------------------- set-up
cleanup_all
mkdir -p "$SERVER/twigo" "$ROOT/base"
cp "$HERE/deploy-twigo.sh" "$SERVER/deploy-twigo.sh"
tar -xzf "$SRC_ARCHIVE" -C "$ROOT/base"
h() { openssl rand -hex "$1"; }
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
ORG_TAGLINE=Together We Innovate, Grow & Opportunity
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
chmod 644 "$SERVER/twigo/.env.production"   # the script must tighten this
ENV_SHA="$(sha256sum < "$SERVER/twigo/.env.production")"
export ADMIN_PASSWORD="Owner-$(h 12)-pass1"
SECRETS=("$ADMIN_PASSWORD")
while IFS='=' read -r k v; do case "$k" in POSTGRES_PASSWORD|AUTH_SECRET|ENCRYPTION_KEY|BACKUP_ENCRYPTION_KEY|SMTP_PASSWORD) SECRETS+=("$v");; esac; done < "$SERVER/twigo/.env.production"

# ---------------------------------------------------------------- 1. syntax
bash -n "$SERVER/deploy-twigo.sh" && result pass "shell syntax" || result fail "shell syntax"

# ---------------------------------------------------------------- 2. missing archive
deploy; [[ $? -eq 12 ]] && said "No release archive found" && result pass "missing archive stops safely (exit 12 = step 2)" || result fail "missing archive"

# ---------------------------------------------------------------- 3. wrong checksum
pack "$ROOT/base" twigo-test-1.tar.gz
echo "0000000000000000000000000000000000000000000000000000000000000000  twigo-test-1.tar.gz" > "$SERVER/twigo-test-1.tar.gz.sha256"
deploy; [[ $? -eq 12 ]] && said "does not match its checksum" && result pass "wrong checksum stops safely (exit 12)" || result fail "wrong checksum"

# ---------------------------------------------------------------- 4. unsafe archive
mkdir -p "$ROOT/evil/inner"; cp -a "$ROOT/base/." "$ROOT/evil/inner/"
rm -f "$SERVER"/twigo-*; tar -czf "$SERVER/twigo-test-evil.tar.gz" -C "$ROOT/evil/inner" . --transform 's,^\./Dockerfile$,../Dockerfile,'
(cd "$SERVER" && sha256sum twigo-test-evil.tar.gz > twigo-test-evil.tar.gz.sha256)
deploy; [[ $? -eq 12 ]] && said "unsafe paths" && [[ ! -e "$SERVER/Dockerfile" ]] && result pass "unsafe archive refused, nothing extracted (exit 12)" || result fail "unsafe archive"

# ---------------------------------------------------------------- 5. secrets inside the archive
mkdir -p "$ROOT/secret"; cp -a "$ROOT/base/." "$ROOT/secret/"; echo "AUTH_SECRET=leaked" > "$ROOT/secret/.env.production"
pack "$ROOT/secret" twigo-test-secret.tar.gz
deploy; [[ $? -eq 12 ]] && said "settings file with secrets" && result pass "archive containing .env.production refused (exit 12)" || result fail "secrets in archive"

# ---------------------------------------------------------------- 6. missing required setting
pack "$ROOT/base" twigo-test-1.tar.gz
cp -p "$SERVER/twigo/.env.production" "$ROOT/env.keep"
sed -i 's/^ORG_JURISDICTION=.*/ORG_JURISDICTION=/' "$SERVER/twigo/.env.production"
deploy; rc=$?
cp -p "$ROOT/env.keep" "$SERVER/twigo/.env.production"
[[ $rc -eq 13 ]] && said "Required settings are empty" && said "ORG_JURISDICTION" && [[ ! -f "$SERVER/twigo/docker-compose.yml" ]] && result pass "missing ORG_JURISDICTION stops before any change (exit 13 = step 3)" || result fail "missing setting (exit $rc)"

# ---------------------------------------------------------------- 6b. a deployment is already running
flock -o "$SERVER/.twigo-deploy.lock" sleep 60 & HOLDER=$!   # -o: only flock holds the lock, so killing it releases the lock
sleep 0.5
deploy; rc=$?
kill $HOLDER 2>/dev/null; wait $HOLDER 2>/dev/null
[[ $rc -eq 30 ]] && said "another deployment is already running" && [[ ! -d "$SERVER/backups" && ! -f "$SERVER/twigo/docker-compose.yml" ]]   && result pass "second deployment while one runs: refused (exit 30), nothing changed" || result fail "lock (exit $rc)"

# ---------------------------------------------------------------- 7. fresh installation
export TWIGO_OWNER_EMAIL=founder@deploytest.dev TWIGO_OWNER_NAME="Test Founder"
deploy; rc=$?
if [[ $rc -eq 0 ]] && ran_ok && healthy_on_1010 && [[ "$(sql "SELECT count(*) FROM \"User\" WHERE role='OWNER'")" == 1 ]] \
   && said "SKIPPED: legal publication" && [[ "$(stat -c %a "$SERVER/twigo/.env.production")" == 600 ]] \
   && [[ "$(sha256sum < "$SERVER/twigo/.env.production")" == "$ENV_SHA" ]]; then
  result pass "fresh install: migrated, owner created, legal publication skipped without confirmation, settings unchanged (600)"
else result fail "fresh install (exit $rc)"; tail -30 "$ROOT/last-run.txt"; fi
unset TWIGO_OWNER_EMAIL TWIGO_OWNER_NAME
FIRST_RELEASE="$(release_marker)"
# Data written by "users" must survive later deployments.
sql "INSERT INTO \"OrgSetting\" (key, value, \"updatedAt\") VALUES ('deploytest.marker', '\"keep me\"', now()) ON CONFLICT (key) DO NOTHING" > /dev/null

# ---------------------------------------------------------------- 8. repeated deployment + legal publication
pack "$ROOT/base" twigo-test-2.tar.gz
export TWIGO_LEGAL_PUBLISH=yes TWIGO_LEGAL_REVIEWED_BY="Test Law Firm" TWIGO_LEGAL_REVIEWED_ON=2026-11-20
deploy; rc=$?
BKDIR="$(ls -1d "$SERVER/backups/twigo"/*/ | tail -n 1)"
if [[ $rc -eq 0 ]] && ran_ok && healthy_on_1010 && [[ "$(sql "SELECT count(*) FROM \"User\" WHERE role='OWNER'")" == 1 ]] \
   && [[ "$(sql "SELECT count(DISTINCT \"documentId\") FROM \"LegalDocumentVersion\" WHERE status='PUBLISHED'")" == 8 ]] \
   && [[ "$(sql "SELECT value::text FROM \"OrgSetting\" WHERE key='deploytest.marker'")" == '"keep me"' ]] \
   && ls "$BKDIR" | grep -q '\.cwbak\.gz\.enc$' && [[ -d "$BKDIR/app-previous" ]] && [[ -f "$BKDIR/.env.production" ]]; then
  result pass "upgrade: owner kept (1), data kept, 8 documents published, encrypted database backup + previous code + settings in $BKDIR"
else result fail "repeated deployment (exit $rc)"; tail -30 "$ROOT/last-run.txt"; fi
unset TWIGO_LEGAL_PUBLISH TWIGO_LEGAL_REVIEWED_BY TWIGO_LEGAL_REVIEWED_ON

# ---------------------------------------------------------------- 9. idempotent third run
deploy; rc=$?
if [[ $rc -eq 0 ]] && ran_ok && said "already published" && said "owner account exists" \
   && [[ "$(sql "SELECT count(*) FROM \"LegalDocumentVersion\"")" == 8 ]] && [[ "$(sql "SELECT count(*) FROM \"User\"")" == 1 ]]; then
  result pass "repeated again: no duplicate owner, no duplicate legal versions"
else result fail "idempotent run (exit $rc)"; tail -30 "$ROOT/last-run.txt"; fi
GOOD_RELEASE="$(release_marker)"

# ---------------------------------------------------------------- 9b. Docker usable only through sudo
# The user's Docker client points at a missing socket (like a user not yet in the docker group); a stand-in
# "sudo" runs commands with the normal socket, as the real sudo would. Every Docker call must go through it.
mkdir -p "$ROOT/fakesudo"
cat > "$ROOT/fakesudo/sudo" <<'SH'
#!/bin/sh
case "$1" in -v|-n) exit 0;; usermod|systemctl|apt-get) exit 0;; esac
exec env -u DOCKER_HOST "$@"
SH
chmod +x "$ROOT/fakesudo/sudo"
DOCKER_HOST=unix:///tmp/twigo-no-such.sock PATH="$ROOT/fakesudo:$PATH" bash "$SERVER/deploy-twigo.sh" > "$ROOT/last-run.txt" 2>&1 < /dev/null; rc=$?
if [[ $rc -eq 0 ]] && ran_ok && said "using sudo for this run" && healthy_on_1010; then
  result pass "Docker usable only with sudo: the script switches to sudo by itself and deploys"
else result fail "sudo path (exit $rc)"; tail -30 "$ROOT/last-run.txt"; fi

# ---------------------------------------------------------------- 10. failed Docker build
mkdir -p "$ROOT/badbuild"; cp -a "$ROOT/base/." "$ROOT/badbuild/"
sed -i 's/^RUN --mount=type=secret,id=envfile.*/RUN false \&\& \\/' "$ROOT/badbuild/Dockerfile"
pack "$ROOT/badbuild" twigo-test-badbuild.tar.gz
deploy; rc=$?
if [[ $rc -eq 16 ]] && said "could not be built" && [[ "$(release_marker)" == "$GOOD_RELEASE" ]] && healthy_on_1010; then
  result pass "failed build: stopped (exit 16 = step 6), previous code restored, previous version still serving on 1010"
else result fail "failed build (exit $rc)"; tail -30 "$ROOT/last-run.txt"; fi

# ---------------------------------------------------------------- 11. failed health check
mkdir -p "$ROOT/badstart"; cp -a "$ROOT/base/." "$ROOT/badstart/"
sed -i '1i if (process.argv.includes("--production")) { console.error("deploy test: simulated start failure"); process.exit(1); }' "$ROOT/badstart/server.ts"
pack "$ROOT/badstart" twigo-test-badstart.tar.gz
deploy; rc=$?
if [[ $rc -eq 20 ]] && said "did not become healthy" && [[ "$(release_marker)" == "$GOOD_RELEASE" ]] && healthy_on_1010; then
  result pass "failed start: stopped (exit 20 = step 10), previous code and image restored, previous version healthy on 1010"
else result fail "failed health check (exit $rc)"; tail -30 "$ROOT/last-run.txt"; fi

# ---------------------------------------------------------------- 11b. SSH connection lost during the deployment
# A closed SSH session sends SIGHUP to the whole session; here: to the script's own process group, once the
# build has started (after the swap). The run must stop, put the previous version back and keep it serving.
pack "$ROOT/base" twigo-test-hup.tar.gz
setsid bash "$SERVER/deploy-twigo.sh" > "$ROOT/last-run.txt" 2>&1 < /dev/null & DPID=$!
for _ in $(seq 1 1500); do said "[6/10]" && break; sleep 0.2; done
PGID="$(ps -o pgid= -p "$DPID" | tr -d ' ')"
[[ -n "$PGID" ]] && kill -HUP -- "-$PGID"
wait "$DPID"; rc=$?
HUPLOG="$(ls -1t "$SERVER"/logs/twigo-deploy-*.log | head -n 1)"
if [[ $rc -eq 129 ]] && grep -q "interrupted (the connection or terminal was closed)" "$HUPLOG"    && grep -q "previous version is running again" "$HUPLOG" && [[ "$(release_marker)" == "$GOOD_RELEASE" ]] && healthy_on_1010; then
  result pass "connection lost during the deployment (HUP): stopped (exit 129), previous version restored and healthy on 1010"
else result fail "connection lost (exit $rc)"; tail -30 "$HUPLOG"; fi

# ---------------------------------------------------------------- 12. no secret in any log or output
LEAK=0
for s in "${SECRETS[@]}"; do
  if grep -rqF -- "$s" "$SERVER/logs" "$ROOT/last-run.txt" 2>/dev/null; then LEAK=1; fi
done
[[ $LEAK -eq 0 ]] && result pass "no secret value in any deployment log" || result fail "a secret appeared in a log"

# ---------------------------------------------------------------- volumes never removed
docker volume inspect ${PROJ}_twigo-postgres ${PROJ}_twigo-data > /dev/null 2>&1 && result pass "data volumes still exist after all runs" || result fail "volumes"

echo
echo "RESULT: $PASS passed, $FAIL failed"
printf '%s\n' "${RESULTS[@]}"
echo "(test containers and volumes are left for inspection; remove with: bash $HERE/test-deploy.sh --cleanup is not provided; use: docker compose -p $PROJ down && docker volume rm ${PROJ}_twigo-postgres ${PROJ}_twigo-data)"
[[ $FAIL -eq 0 ]]
