#!/usr/bin/env bash
# Upgrade test for a release, in Docker. ISOLATED: its own folder (/tmp/twigo-upgradetest), its own
# Docker Compose project (twigoupgrade) with its own volumes and generated test secrets. Never run it
# on the production VPS. Needs Docker, port 1010 free, the new release archive and the previous
# release's archive (its image is built from it).
#
#   bash scripts/deploy/test-upgrade.sh <new release .tar.gz> <previous release .tar.gz>
#
# 1. The previous release runs on a database with a member, accepted policies and an uploaded file.
# 2. The new image is built from the archive; migrations are applied to that populated database
#    (`prisma migrate deploy` through scripts/migrate.ts), nothing is reset.
# 3. The new version starts: health, Next.js on 0.0.0.0:1010 inside the container, 127.0.0.1:1010 on
#    the host only, WebSocket upgrade (101) on /socket.io, Privacy Policy version 2 published by the
#    release approval, data kept.
# 4. An erasure is recorded in the ledger (created on the old volume, where /data/ledger did not exist);
#    an encrypted database backup is made; the backup restored into a new database replays the erasure;
#    a ledger that does not verify makes the restore fail.
# 5. Clean shutdown: SIGTERM is handled (server.shutdown logged, exit code 0), volumes kept.
set -u
ARCHIVE="${1:?release archive}"
OLD_ARCHIVE="${2:?previous release archive}"
PROJ=twigoupgrade
ROOT=/tmp/twigo-upgradetest
APP="$ROOT/app"
OLD="$ROOT/old"
PASS=0; FAIL=0
result() { if [[ "$1" == pass ]]; then PASS=$((PASS + 1)); echo "PASS  $2"; else FAIL=$((FAIL + 1)); echo "FAIL  $2"; fi; }
dc() { docker compose -p "$PROJ" --project-directory "$APP" --env-file "$APP/.env.production" -f "$APP/docker-compose.yml" -f "$ROOT/new.yml" "$@"; }
# The previous release: its own compose file and code, the same project, volumes and settings.
dco() { docker compose -p "$PROJ" --project-directory "$OLD" --env-file "$APP/.env.production" -f "$OLD/docker-compose.yml" -f "$ROOT/old.yml" "$@"; }
sql() { dc exec -T db psql -U twigo -d "${2:-twigo}" -tAc "$1"; }
healthy() { for _ in $(seq 1 90); do curl -fsS http://127.0.0.1:1010/api/health > /dev/null 2>&1 && return 0; sleep 2; done; return 1; }
cleanup() {
  docker compose -p "$PROJ" --project-directory "$APP" -f "$APP/docker-compose.yml" down --remove-orphans > /dev/null 2>&1 || true
  docker ps -aq --filter "label=com.docker.compose.project=$PROJ" | xargs -r docker rm -f > /dev/null 2>&1 || true
  docker volume rm ${PROJ}_twigo-postgres ${PROJ}_twigo-data > /dev/null 2>&1 || true
}

# ---------------------------------------------------------------- set-up
cleanup; rm -rf "$ROOT"; mkdir -p "$APP" "$OLD"
tar -xzf "$ARCHIVE" -C "$APP"
tar -xzf "$OLD_ARCHIVE" -C "$OLD"
h() { openssl rand -hex "$1"; }
cat > "$APP/.env.production" <<EOF
SITE_URL=https://twigo.space
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
SMTP_HOST=127.0.0.1
SMTP_PORT=2525
SMTP_SECURE=false
EMAIL_FROM="Twigo <noreply@twigo.space>"
ADMIN_REQUIRE_2FA=true
JOBS_ENABLED=false
EOF
chmod 600 "$APP/.env.production"
cp "$APP/.env.production" "$OLD/.env.production"
# Separate image names, so no other Twigo image on this computer is retagged.
cat > "$ROOT/old.yml" <<EOF
services:
  app:
    image: twigo-app:upgradetest-previous
EOF
cat > "$ROOT/new.yml" <<EOF
services:
  app:
    image: twigo-app:upgradetest-new
EOF
if dco build app > "$ROOT/old-build.txt" 2>&1; then result pass "previous release image built from $(basename "$OLD_ARCHIVE")"; else result fail "previous release build"; tail -30 "$ROOT/old-build.txt"; exit 1; fi

# ---------------------------------------------------------------- 1. previous release with data
# As deploy-twigo.sh does: database first, migrations, then the app.
dco up -d --wait db > "$ROOT/old-up.txt" 2>&1
dco run --rm --no-deps -T app npm run -s db:deploy >> "$ROOT/old-up.txt" 2>&1 || { result fail "previous release migrations"; tail -20 "$ROOT/old-up.txt"; exit 1; }
export ADMIN_PASSWORD="Owner-$(h 12)-pass1"
dco run --rm --no-deps -T -e ADMIN_PASSWORD app npm run -s admin:create -- --email founder@upgradetest.dev --name "Upgrade Owner" --role OWNER >> "$ROOT/old-up.txt" 2>&1 || { result fail "owner account"; tail -20 "$ROOT/old-up.txt"; exit 1; }
dco up -d --no-build app >> "$ROOT/old-up.txt" 2>&1
if healthy; then result pass "previous release running and healthy"; else result fail "previous release did not start"; dco logs app | tail -30; exit 1; fi
BEFORE_MIGRATIONS="$(sql "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL")"
# The previous release creates its legal documents on the first page that shows them.
curl -fsS -o /dev/null http://127.0.0.1:1010/legal/privacy || true
sql "INSERT INTO \"User\" (id, email, name, role, status, \"membershipStatus\", \"emailVerifiedAt\", \"updatedAt\") VALUES ('upgrade_member_1', 'member@upgrade.test', 'Uma Upgrade', 'MEMBER', 'ACTIVE', 'ACTIVE', now(), now())" > /dev/null
sql "INSERT INTO \"MemberProfile\" (id, \"userId\", \"displayName\", \"updatedAt\") VALUES ('upgrade_profile_1', 'upgrade_member_1', 'Uma Upgrade', now())" > /dev/null
sql "INSERT INTO \"LegalAcceptance\" (id, \"userId\", \"versionId\", \"documentKey\", version, \"contentHash\", kind, method) SELECT 'upgrade_acc_' || d.key, 'upgrade_member_1', v.id, d.key, 1, v.\"contentHash\", 'ACKNOWLEDGED', 'registration' FROM \"LegalDocumentVersion\" v JOIN \"LegalDocument\" d ON d.id = v.\"documentId\" WHERE v.version = 1" > /dev/null
dco exec -T app sh -c 'mkdir -p /data/storage/upgrade && echo "uploaded before the upgrade" > /data/storage/upgrade/file.txt'
LEDGER_BEFORE="$(dco exec -T app sh -c 'test -d /data/ledger && echo yes || echo no')"
ACC_BEFORE="$(sql "SELECT count(*) FROM \"LegalAcceptance\"")"
[[ "$ACC_BEFORE" -ge 1 ]] && result pass "previous release: member, $ACC_BEFORE policy records and an uploaded file in place (ledger folder on the volume: $LEDGER_BEFORE)" || result fail "test data"

# ---------------------------------------------------------------- 2. new image, migrations on the populated database
if dc build app > "$ROOT/build.txt" 2>&1; then result pass "new image built from the release archive"; else result fail "build"; tail -30 "$ROOT/build.txt"; exit 1; fi
dc stop app > /dev/null 2>&1
if dc run --rm --no-deps -T app npm run -s db:deploy > "$ROOT/migrate.txt" 2>&1; then
  AFTER_MIGRATIONS="$(sql "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL")"
  result pass "migrations applied on the populated database ($BEFORE_MIGRATIONS -> $AFTER_MIGRATIONS; $(grep -c '^applied' "$ROOT/migrate.txt") new)"
else result fail "migrations"; cat "$ROOT/migrate.txt"; fi
[[ "$(sql "SELECT count(*) FROM information_schema.columns WHERE table_name = 'PrivacyRequest' AND column_name IN ('removeIdeas','removeComments','removeChat','legalHold','legalHoldReason')")" == 5 ]] \
  && result pass "new columns present (deletion choices, legal hold)" || result fail "new columns"

# ---------------------------------------------------------------- 3. new version running
dc up -d --no-build app > "$ROOT/new-up.txt" 2>&1
if healthy; then result pass "new version healthy on http://127.0.0.1:1010/api/health"; else result fail "new version health"; dc logs app | tail -40; fi
LISTEN="$(dc exec -T app sh -c "awk 'NR>1 && \$4==\"0A\" {print \$2}' /proc/net/tcp" | tr -d '\r')"
grep -q '^00000000:03F2$' <<< "$LISTEN" && result pass "inside the container Next.js listens on 0.0.0.0:1010" || result fail "container listen address ($LISTEN)"
HOSTPORT="$(docker port "$(dc ps -q app)" 1010/tcp | tr '\n' ' ')"
[[ "$HOSTPORT" == "127.0.0.1:1010 " ]] && result pass "host publishes 127.0.0.1:1010 only ($HOSTPORT)" || result fail "host port ($HOSTPORT)"
WS="$(curl -s -o /dev/null -m 5 -w '%{http_code}' -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' 'http://127.0.0.1:1010/socket.io/?EIO=4&transport=websocket')"
[[ "$WS" == 101 ]] && result pass "WebSocket upgrade on /socket.io answers 101" || result fail "WebSocket ($WS)"
[[ "$(sql "SELECT v.status FROM \"LegalDocumentVersion\" v JOIN \"LegalDocument\" d ON d.id = v.\"documentId\" WHERE d.key = 'privacy' AND v.version = 2")" == PUBLISHED ]] \
  && [[ "$(sql "SELECT v.status FROM \"LegalDocumentVersion\" v JOIN \"LegalDocument\" d ON d.id = v.\"documentId\" WHERE d.key = 'privacy' AND v.version = 1")" == SUPERSEDED ]] \
  && dc logs app 2>&1 | grep -q 'legal.release_state' \
  && result pass "Privacy Policy version 2 published at start-up by the release approval (version 1 superseded)" || result fail "privacy v2"
[[ "$(sql "SELECT count(*) FROM \"LegalAcceptance\"")" == "$ACC_BEFORE" && "$(sql "SELECT name FROM \"User\" WHERE id = 'upgrade_member_1'")" == "Uma Upgrade" ]] \
  && [[ "$(dc exec -T app cat /data/storage/upgrade/file.txt | tr -d '\r')" == "uploaded before the upgrade" ]] \
  && result pass "data kept: member, policy records, uploaded file" || result fail "data kept"
[[ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:1010/legal/privacy)" == 200 ]] && result pass "privacy page served" || result fail "privacy page"

# ---------------------------------------------------------------- 4. ledger, backup, restore with replay
cat > "$ROOT/erase.ts" <<'EOF'
import { createPrismaClient } from "./src/lib/db-core";
import { appendLedger, ledgerKey } from "./src/ops/erasure-ledger";
import { eraseAccountData } from "./src/ops/erasure";
const db = createPrismaClient(process.env.DATABASE_URL!);
const choices = { removeIdeas: false, removeComments: false, removeChat: false };
appendLedger(process.env.LEDGER_DIR!, ledgerKey({ BACKUP_ENCRYPTION_KEY: process.env.BACKUP_ENCRYPTION_KEY, ENCRYPTION_KEY: process.env.ENCRYPTION_KEY }), { userId: "upgrade_member_1", requestId: null, at: new Date().toISOString(), op: "erasure/1", choices, retainApplicant: false });
db.$transaction((tx) => eraseAccountData(tx, "upgrade_member_1", { ...choices, retainApplicant: false, now: new Date() })).then(() => db.$disconnect());
EOF
# The backup is made BEFORE the erasure, as an older backup would be.
BK_OUT="$(dc exec -T app npm run -s db:backup -- --label upgradetest 2>&1)"
BK_FILE="$(grep -o '/data/backups/[^ ]*' <<< "$BK_OUT" | head -n 1)"
[[ -n "$BK_FILE" ]] && [[ "$(dc exec -T app sh -c "head -c 6 '$BK_FILE'")" == CWBAK1 ]] && result pass "encrypted database backup made ($BK_FILE)" || { result fail "backup"; echo "$BK_OUT"; }
docker cp "$ROOT/erase.ts" "$(dc ps -q app)":/app/upgradetest-erase.ts > /dev/null
dc exec -T -u 0 app chown node /app/upgradetest-erase.ts
if dc exec -T app node --import tsx upgradetest-erase.ts > "$ROOT/erase.txt" 2>&1; then
  [[ "$(sql "SELECT name FROM \"User\" WHERE id = 'upgrade_member_1'")" == "Erased account" ]] \
    && [[ "$(dc exec -T app sh -c 'stat -c %a /data/ledger; stat -c %a /data/ledger/erasures.ledger')" == $'700\n600' || "$(dc exec -T app sh -c 'stat -c %a /data/ledger; stat -c %a /data/ledger/erasures.ledger' | tr -d '\r')" == $'700\n600' ]] \
    && ! dc exec -T app grep -q "upgrade_member_1\|Uma" /data/ledger/erasures.ledger \
    && result pass "erasure recorded in the encrypted ledger (folder created on the existing volume, 700/600, no ids or names readable)" || result fail "ledger after erasure"
else result fail "erasure"; cat "$ROOT/erase.txt"; fi
RS_OUT="$(dc exec -T app npm run -s db:restore -- "$BK_FILE" --into twigo_restore_upgradetest --replace 2>&1)"
[[ "$(sql "SELECT name FROM \"User\" WHERE id = 'upgrade_member_1'" twigo_restore_upgradetest)" == "Erased account" ]] \
  && [[ "$(sql "SELECT count(*) FROM \"MemberProfile\" WHERE \"userId\" = 'upgrade_member_1'" twigo_restore_upgradetest)" == 0 ]] \
  && grep -qi "ledger" <<< "$RS_OUT" \
  && result pass "restore of the older backup re-applied the erasure from the ledger (the erased member does not reappear)" || { result fail "restore with ledger replay"; echo "$RS_OUT" | tail -20; }
dc exec -T app sh -c 'cp /data/ledger/erasures.ledger /data/ledger/erasures.ledger.keep && echo broken > /data/ledger/erasures.ledger'
if dc exec -T app npm run -s db:restore -- "$BK_FILE" --into twigo_restore_upgradetest --replace > "$ROOT/restore-bad.txt" 2>&1; then
  result fail "restore with a ledger that does not verify was reported as successful"
else result pass "restore fails when the ledger cannot be verified"; fi
dc exec -T app sh -c 'mv /data/ledger/erasures.ledger.keep /data/ledger/erasures.ledger'
dc exec -T -u 0 app rm -f /app/upgradetest-erase.ts

# ---------------------------------------------------------------- 5. clean shutdown
CID="$(dc ps -q app)"
dc stop -t 30 app > /dev/null 2>&1
CODE="$(docker inspect -f '{{.State.ExitCode}}' "$CID")"
docker logs "$CID" 2>&1 | grep -q '"server.shutdown"\|server.shutdown' && [[ "$CODE" == 0 ]] && result pass "clean shutdown on SIGTERM (server.shutdown logged, exit code 0)" || result fail "shutdown (exit $CODE)"
docker volume inspect ${PROJ}_twigo-postgres ${PROJ}_twigo-data > /dev/null 2>&1 && result pass "volumes kept after stopping" || result fail "volumes"

echo
echo "upgrade test: $PASS passed, $FAIL failed"
cleanup
docker rmi twigo-app:upgradetest-previous twigo-app:upgradetest-new > /dev/null 2>&1 || true
rm -rf "$ROOT"
[[ $FAIL -eq 0 ]]
