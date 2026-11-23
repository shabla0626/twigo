#!/usr/bin/env bash
# Runs the Stage 4 walkthrough against a THROW-AWAY demo database ("cowork_walk_demo").
# Nothing here touches the development database (cowork) or the normal demo (cowork_demo).
#
#   bash scripts/audit/walkthrough-run.sh <screenshot folder>
set -u
cd "$(dirname "$0")/../.." || exit 1
OUT="${1:-walkthrough-out}"
DB="postgresql://postgres:postgres@localhost:5433/cowork_walk_demo?schema=public"
PORT=3400
MAILPORT=2626

stop_port() {
  powershell -NoProfile -Command "\$c = Get-NetTCPConnection -LocalPort $1 -State Listen -ErrorAction SilentlyContinue; if (\$c) { \$c | ForEach-Object { Stop-Process -Id \$_.OwningProcess -Force -Confirm:\$false } }" > /dev/null 2>&1
}
stop_port $PORT; stop_port $MAILPORT; stop_port $((MAILPORT + 6000))
rm -rf .walk-mail .walk-storage .walk-backups
mkdir -p .walk-mail .walk-storage .walk-backups

echo "seeding cowork_walk_demo..."
DEMO_DATABASE_URL="$DB" npx tsx scripts/seed-demo.ts | tail -1

DEV_MAIL_PORT=$MAILPORT DEV_MAIL_UI_PORT=$((MAILPORT + 6000)) DEV_MAIL_DIR=.walk-mail npx tsx scripts/dev-mail.ts > /dev/null 2>&1 &

PORT=$PORT HOST=127.0.0.1 SITE_URL=http://127.0.0.1:$PORT LOCAL_PRODUCTION_TEST=1 \
  AUTH_SECRET=walkthrough-secret-that-is-long-enough-0123456789 \
  DATABASE_URL="$DB" STORAGE_DIR=.walk-storage BACKUP_DIR=.walk-backups \
  BACKUP_ENCRYPTION_KEY=walkthrough-backup-key-that-is-long-enough-42 \
  SMTP_HOST=127.0.0.1 SMTP_PORT=$MAILPORT SMTP_SECURE=false SMTP_USER= SMTP_PASSWORD= EMAIL_FROM=no-reply@demo.test SEND_APPLICANT_CONFIRMATION=true \
  JOBS_ENABLED=false NEXT_DIST_DIR=.next-e2e NODE_ENV=production \
  npx tsx server.ts --production > .walk-server.log 2>&1 &

for t in $(seq 1 60); do
  curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:$PORT/api/health 2>/dev/null | grep -q 200 && break
  python -c "import time; time.sleep(1)"
done
curl -s -o /dev/null -w "server: %{http_code}\n" http://127.0.0.1:$PORT/api/health

MSYS_NO_PATHCONV=1 AUDIT_URL=http://127.0.0.1:$PORT WALK_MAIL_DIR=.walk-mail npx tsx scripts/audit/walkthrough.ts "$OUT"

# Owner step that has no screen: restore the backup the owner just made into a scratch database.
latest=$(ls -t .walk-backups/* 2>/dev/null | head -1)
if [ -n "$latest" ]; then
  echo "restoring $latest into cowork_walk_restorecheck..."
  DATABASE_URL="$DB" BACKUP_ENCRYPTION_KEY=walkthrough-backup-key-that-is-long-enough-42 \
    npx tsx scripts/backup.ts restore "$latest" --into cowork_walk_restorecheck --replace 2>&1 | tail -4
  python - <<'EOF'
import subprocess
EOF
else
  echo "RESTORE: no backup file found"
fi

stop_port $PORT; stop_port $MAILPORT; stop_port $((MAILPORT + 6000))
