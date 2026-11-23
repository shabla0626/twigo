#!/usr/bin/env bash
# =====================================================================================================
#  Twigo one-command production deployment (Ubuntu VPS, Docker Engine + Compose v2)
#
#    bash ~/Server/deploy-twigo.sh
#
#  One click from Windows: .\deploy-twigo.ps1 (project folder) uploads the release named in
#  release/release-manifest.json and runs this script over SSH (docs/ONE-CLICK-DEPLOYMENT.md).
#
#  Expected layout (next to this script):
#    deploy-twigo.sh
#    twigo-<release>.tar.gz          the release archive (the newest one is used)
#    twigo-<release>.tar.gz.sha256   its checksum
#    twigo/.env.production           the production settings (never changed by this script)
#
#  What it does, in order: checks the server, the archive and the settings; backs up the settings,
#  the previous code, the database (when running) and the uploaded files; installs the new code next to
#  the old one and swaps them; builds the image; starts PostgreSQL; applies migrations; makes sure an
#  owner account exists; offers to publish the reviewed legal documents; starts Twigo on
#  127.0.0.1:1010 and verifies it. On a failure after the swap it puts the previous code and image back.
#
#  It never deletes volumes, never resets or recreates the database, never prints secrets, and never
#  touches Caddy, Cloudflare or the firewall. Safe to run again (idempotent).
#
#  Optional, for unattended runs and tests (all optional; secrets are read from the environment, never
#  from the command line):
#    TWIGO_OWNER_EMAIL, TWIGO_OWNER_NAME, ADMIN_PASSWORD   create the first owner without prompts
#    TWIGO_LEGAL_PUBLISH=yes, TWIGO_LEGAL_REVIEWED_BY, TWIGO_LEGAL_REVIEWED_ON[, TWIGO_LEGAL_EFFECTIVE]
#    TWIGO_ARCHIVE (archive path), TWIGO_ASSUME_NO=1 (answer "no" to optional questions)
#    TWIGO_COMPOSE_PROJECT, TWIGO_APP_DIR, TWIGO_BACKUP_ROOT, TWIGO_LOG_DIR   (isolated test runs only)
#
#  Exit codes: 0 success; 10 + N when step N failed (11 = step 1 ... 20 = step 10; 10 = before step 1);
#  30 another deployment is running; 129 the connection or terminal was closed (HUP), 130 Ctrl+C,
#  141 the output pipe was closed, 143 stopped (TERM). After a failure from step 5 on, the previous
#  version is put back. Only one deployment runs at a time (lock file .twigo-deploy.lock next to this script).
# =====================================================================================================
set -Eeuo pipefail
# Release files must stay readable inside the image (the app runs as an unprivileged user); backups and
# logs are made private explicitly below.
umask 022

SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="${TWIGO_APP_DIR:-$SELF_DIR/twigo}"
BACKUP_ROOT="${TWIGO_BACKUP_ROOT:-$SELF_DIR/backups/twigo}"
LOG_DIR="${TWIGO_LOG_DIR:-$SELF_DIR/logs}"
PROJECT="${TWIGO_COMPOSE_PROJECT:-twigo}"
IMAGE="twigo-app"                      # fixed in docker-compose.yml (services.app.image)
PORT=1010
SITE="https://twigo.space"
DB_USER="twigo"
DB_NAME="${TWIGO_DB_NAME:-twigo}"
LEGAL_DOCS=8                           # src/content/legal/index.ts: LEGAL_DOCUMENTS
TS="$(date +%Y-%m-%d_%H-%M-%S)"
BK="$BACKUP_ROOT/$TS"
mkdir -p "$LOG_DIR" && chmod 700 "$LOG_DIR"
LOG="$LOG_DIR/twigo-deploy-$TS.log"
: > "$LOG" && chmod 600 "$LOG"

OKS=(); SKIPS=(); FAILS=(); MANUAL=()
SUDO_KEEPALIVE=""
STEP="start"; STEP_NO=0; SWAPPED=0; PREV_EXISTS=0; PREV_APP_RUNNING=0; PREV_IMAGE=0; STAGING=""; NEWDIR=""; FINISHED=0
INTERACTIVE=0; [[ -t 0 && -t 1 && "${TWIGO_ASSUME_NO:-0}" != "1" ]] && INTERACTIVE=1

say()  { printf '%s\n' "$*"; printf '%s %s\n' "$(date +%H:%M:%S)" "$*" >> "$LOG"; }
note() { printf '      %s\n' "$*"; printf '%s       %s\n' "$(date +%H:%M:%S)" "$*" >> "$LOG"; }
ok()   { OKS+=("$1"); note "OK: $1"; }
skip() { SKIPS+=("$1"); note "SKIPPED: $1"; }
manual() { MANUAL+=("$1"); }
step() { STEP_NO="$1"; STEP="$2"; say ""; say "[$1/10] $2..."; }
die()  { FAILS+=("$STEP: $1"); say ""; say "ERROR: $1"; shift; for l in "$@"; do note "$l"; done; exit $((10 + STEP_NO)); }
quiet() { "$@" >> "$LOG" 2>&1; }      # command output goes to the log only

# docker compose for a given application directory (the old one for backups, the new one after the swap)
dcx() { local d="$1"; shift; docker compose -p "$PROJECT" --project-directory "$d" -f "$d/docker-compose.yml" --env-file "$d/.env.production" "$@"; }
dc()  { dcx "$APP_DIR" "$@"; }

# Reads KEY=value from a settings file without executing it; strips one pair of surrounding quotes.
envval() {
  local file="$1" key="$2" line v
  line="$(grep -E "^${key}=" "$file" 2>/dev/null | tail -n 1 || true)"
  v="${line#*=}"
  v="${v%$'\r'}"
  if [[ "$v" == \"*\" && ${#v} -ge 2 ]]; then v="${v:1:${#v}-2}"; elif [[ "$v" == \'*\' && ${#v} -ge 2 ]]; then v="${v:1:${#v}-2}"; fi
  printf '%s' "$v"
}

container_of() { dc ps -q "$1" 2>/dev/null | head -n 1; }
health_of() { local c; c="$(container_of "$1")"; [[ -n "$c" ]] && docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$c" 2>/dev/null || echo "absent"; }
wait_healthy() {
  local svc="$1" secs="$2" s i
  for ((i = 0; i < secs; i += 3)); do
    s="$(health_of "$svc")"
    [[ "$s" == "healthy" ]] && return 0
    [[ "$s" == "unhealthy" || "$s" == "exited" || "$s" == "dead" ]] && return 1
    sleep 3
  done
  return 1
}
psql_q() { dc exec -T db psql -U "$DB_USER" -d "$DB_NAME" -At -v ON_ERROR_STOP=1 -c "$1"; }

rollback() {
  [[ "$SWAPPED" == "1" ]] || return 0
  say ""
  say "Restoring the previous application code and image..."
  # Without a previous running version, the new one (if it was started) must not keep running.
  if [[ "$PREV_APP_RUNNING" != "1" && -f "$APP_DIR/docker-compose.yml" ]]; then dc stop app >> "$LOG" 2>&1 || true; fi
  if [[ -d "$APP_DIR" ]]; then mv "$APP_DIR" "$BK/app-failed" 2>>"$LOG" || true; fi
  if [[ -d "$BK/app-previous" ]]; then
    if mv "$BK/app-previous" "$APP_DIR" 2>>"$LOG"; then note "previous code restored to $APP_DIR"; else note "the previous code could NOT be moved back: it is in $BK/app-previous"; fi
  fi
  if [[ "$PREV_IMAGE" == "1" ]]; then
    if docker tag "$IMAGE:previous-$TS" "$IMAGE:latest" >> "$LOG" 2>&1; then note "previous image restored"; else note "the previous image could NOT be tagged back: it is $IMAGE:previous-$TS"; fi
  fi
  if [[ "$PREV_APP_RUNNING" == "1" && -f "$APP_DIR/docker-compose.yml" ]]; then
    if dc up -d --no-build app >> "$LOG" 2>&1 && wait_healthy app 180; then
      note "the previous version is running again on 127.0.0.1:$PORT"
    else
      note "the previous version did not become healthy; see the log"
    fi
  fi
  SWAPPED=0
}

on_exit() {
  local code=$?
  # Finish the clean-up whatever happens now: no abort on a failing command, no second interruption.
  set +e; trap - ERR; trap '' HUP INT TERM PIPE
  [[ -n "$STAGING" && -d "$STAGING" ]] && rm -rf "$STAGING"
  [[ -n "$NEWDIR" && -d "$NEWDIR" ]] && rm -rf "$NEWDIR"
  [[ -n "$SUDO_KEEPALIVE" ]] && kill "$SUDO_KEEPALIVE" 2>/dev/null
  if [[ "$code" != "0" && "$FINISHED" != "1" ]]; then
    [[ ${#FAILS[@]} -eq 0 ]] && FAILS+=("$STEP: a command failed (exit code $code); details in the log")
    if [[ ! -d "$BK" ]]; then
      # Stopped during the checks: nothing on the server was changed. Keep it short.
      say ""
      say "STOPPED: nothing was changed on the server."
      say "After fixing the problem above, run again:  bash $SELF_DIR/deploy-twigo.sh"
      say "(details: $LOG; exit code $code)"
    else
      rollback || true
      summary "FAILED"
      say ""
      say "What to do: fix the problem shown above, then run again:  bash $SELF_DIR/deploy-twigo.sh"
      note "Backups of this run: $BK   Log: $LOG   Exit code: $code"
      [[ "$STEP" == "Applying database migrations" || "$STEP" == "Checking owner and legal publication" || "$STEP" == "Starting and verifying Twigo" ]] && \
        note "Database changes are not undone automatically; the database backup of this run can be restored (docs/DEPLOYMENT.md, section 8)."
    fi
  fi
  exit "$code"
}
# Interrupted: HUP when the SSH connection or the terminal is closed, PIPE when the output can no longer be
# written, INT for Ctrl+C, TERM for kill. The run stops and the EXIT handler puts the previous version back.
on_signal() {
  trap '' HUP INT TERM PIPE
  # Nobody can read the terminal any more: from here on everything goes to the log only.
  if [[ "$1" == HUP || "$1" == PIPE ]]; then exec >> "$LOG" 2>&1 < /dev/null; fi
  FAILS+=("$STEP: interrupted ($3)")
  exit "$2"
}
trap on_exit EXIT
# An unexpected failing command: say so (never stop silently), then stop like die().
trap 'ERR_RC=$?; FAILS+=("$STEP: command failed at line $LINENO (exit code $ERR_RC)"); say ""; say "ERROR: an unexpected command failed during \"$STEP\" (line $LINENO, exit code $ERR_RC). Details: $LOG"; exit $((10 + STEP_NO))' ERR
trap 'on_signal HUP 129 "the connection or terminal was closed"' HUP
trap 'on_signal INT 130 "stopped with Ctrl+C"' INT
trap 'on_signal TERM 143 "stopped by a TERM signal"' TERM
trap 'on_signal PIPE 141 "the output could no longer be written"' PIPE

summary() {
  say ""
  say "========================================"
  say "DEPLOYMENT RESULT: $1"
  say "========================================"
  local x
  say "Successful:";   for x in "${OKS[@]:-}";   do [[ -n "$x" ]] && note "$x"; done
  say "Skipped:";      for x in "${SKIPS[@]:-}"; do [[ -n "$x" ]] && note "$x"; done
  say "Failed:";       for x in "${FAILS[@]:-}"; do [[ -n "$x" ]] && note "$x"; done; [[ ${#FAILS[@]} -eq 0 ]] && note "none"
  say "Remaining manual actions:"; for x in "${MANUAL[@]:-}"; do [[ -n "$x" ]] && note "$x"; done
  if [[ -d "$BK" ]]; then say "Backups:        $BK"; else say "Backups:        none made (nothing was changed)"; fi
  say "Log:            $LOG"
  say "Application:    $SITE  (local: http://127.0.0.1:$PORT)"
  say "Caddy upstream: 127.0.0.1:$PORT"
}

say "========================================"
say "       TWIGO PRODUCTION DEPLOYMENT"
say "========================================"
say "Folder: $SELF_DIR    Log: $LOG"

# One deployment at a time: a second run (from another terminal or another computer) stops here.
LOCK="$SELF_DIR/.twigo-deploy.lock"
if command -v flock >/dev/null; then
  exec 9>> "$LOCK"
  if ! flock -n 9; then
    FAILS+=("start: another deployment is running")
    say ""
    say "ERROR: another deployment is already running on this server (it holds $LOCK)."
    note "Wait until it has finished, then run again."
    exit 30
  fi
else
  note "WARNING: flock is missing; two deployments at the same time cannot be prevented (sudo apt-get install -y util-linux)"
fi

# -----------------------------------------------------------------------------------------------------
step 1 "Checking server environment"
if [[ "${TWIGO_SKIP_OS_CHECK:-0}" != "1" ]]; then
  # shellcheck disable=SC1091
  . /etc/os-release 2>/dev/null || true
  [[ "${ID:-}" == "ubuntu" ]] || die "This script is for Ubuntu (found: ${PRETTY_NAME:-unknown})."
  ok "Ubuntu ${VERSION_ID:-}"
fi
for c in curl tar sha256sum python3 ss awk; do command -v "$c" >/dev/null || die "The command '$c' is missing." "Install it: sudo apt-get install -y $c"; done

ask_yes() { [[ "$INTERACTIVE" == "1" ]] || return 1; local a; read -r -p "      $1 [y/N] " a; [[ "$a" =~ ^[Yy] ]]; }
# Docker: installed? running? usable by this user? Fixes what it can, asking first where it installs anything.
if ! command -v docker >/dev/null; then
  say "      Docker is not installed on this server."
  ask_yes "Install Docker now from the Ubuntu packages (docker.io, docker-compose-v2)?" || die "Docker is needed." "Install it: sudo apt-get install -y docker.io docker-compose-v2"
  sudo apt-get update >> "$LOG" 2>&1 && sudo apt-get install -y docker.io docker-compose-v2 >> "$LOG" 2>&1 || die "Installing Docker failed." "See: $LOG"
  sudo systemctl enable --now docker >> "$LOG" 2>&1 || true
  ok "Docker installed"
fi
DOCKER_SUDO=0
if ! docker info >/dev/null 2>&1; then
  # Not usable by this user (not in the docker group yet) or not running: use sudo for this run.
  say "      Your user may not use Docker directly yet; using sudo for this run (your password may be asked once)."
  sudo -v || die "Administrator rights (sudo) are needed to use Docker." "Ask the server administrator to add you to the docker group."
  ( exec 9>&-; while true; do sudo -n true 2>/dev/null; sleep 50; done ) &
  SUDO_KEEPALIVE=$!
  if ! sudo docker info >/dev/null 2>&1; then
    sudo systemctl start docker >> "$LOG" 2>&1 || true
    sleep 3
  fi
  sudo docker info >/dev/null 2>&1 || die "Docker does not start on this server." "Check it with: sudo systemctl status docker"
  DOCKER_SUDO=1
  docker() { sudo docker "$@"; }
  if ! id -nG "$USER" | tr ' ' '\n' | grep -qx docker; then
    sudo usermod -aG docker "$USER" >> "$LOG" 2>&1 && note "added $USER to the docker group: from your next login, no password is needed"
  fi
fi
ok "Docker Engine $(docker version -f '{{.Server.Version}}' 2>/dev/null)"
CV="$(docker compose version --short 2>/dev/null || true)"
[[ -n "$CV" ]] || die "Docker Compose v2 is missing." "Install the plugin: sudo apt-get install -y docker-compose-plugin"
IFS=. read -r cv1 cv2 _ <<< "${CV#v}"
(( cv1 > 2 || (cv1 == 2 && cv2 >= 17) )) || die "Docker Compose $CV is too old (2.17 or newer is needed for build secrets)." "Update: sudo apt-get install -y docker-compose-plugin"
ok "Docker Compose $CV"
# Free space in KB, or nothing when the folder is not visible here (e.g. Docker's data folder of a daemon
# in a VM or another container): the callers then fall back to the root file system.
avail_kb() { df -Pk "$1" 2>/dev/null | awk 'NR==2 {print $4}' || true; }
FREE="$(avail_kb "$SELF_DIR")"; [[ -n "$FREE" ]] || FREE=0
(( FREE >= 3 * 1024 * 1024 )) || die "Not enough disk space in $SELF_DIR: $((FREE / 1024)) MB free, at least 3072 MB needed."
DROOT="$(docker info -f '{{.DockerRootDir}}' 2>/dev/null || echo /var/lib/docker)"
DFREE="$(avail_kb "$DROOT")"; [[ -n "$DFREE" ]] || DFREE="$(avail_kb /)"
(( DFREE >= 5 * 1024 * 1024 )) || die "Not enough disk space for Docker images: $((DFREE / 1024)) MB free, at least 5120 MB needed."
ok "disk space ($((FREE / 1024)) MB here, $((DFREE / 1024)) MB for Docker)"

# -----------------------------------------------------------------------------------------------------
step 2 "Verifying release archive"
if [[ -n "${TWIGO_ARCHIVE:-}" ]]; then ARCHIVE="$TWIGO_ARCHIVE"; else
  ARCHIVE="$(ls -1t "$SELF_DIR"/twigo-*.tar.gz 2>/dev/null | head -n 1 || true)"
fi
[[ -n "$ARCHIVE" && -f "$ARCHIVE" ]] || die "No release archive found next to this script." "Upload twigo-<release>.tar.gz and its .sha256 file to $SELF_DIR."
SUMFILE="$ARCHIVE.sha256"
[[ -f "$SUMFILE" ]] || die "The checksum file $(basename "$SUMFILE") is missing." "Upload it next to the archive."
EXPECTED="$(awk '{print $1; exit}' "$SUMFILE")"
ACTUAL="$(sha256sum "$ARCHIVE" | awk '{print $1}')"
[[ "$EXPECTED" =~ ^[0-9a-f]{64}$ && "$EXPECTED" == "$ACTUAL" ]] || die "The archive does not match its checksum: it is damaged or not the released file." "Upload $(basename "$ARCHIVE") and its .sha256 file again."
ok "checksum of $(basename "$ARCHIVE")"
LISTING="$(tar -tvzf "$ARCHIVE" 2>>"$LOG")" || die "The archive cannot be read (damaged)." "Upload it again."
NAMES="$(tar -tzf "$ARCHIVE" | sed 's#^\./##')"
if grep -qE '(^/|(^|/)\.\.(/|$))' <<< "$NAMES"; then die "The archive contains unsafe paths (absolute or '..'). It was not extracted."; fi
if grep -qE '^[lhbcp]' <<< "$LISTING"; then die "The archive contains links or special files. It was not extracted."; fi
if grep -qE '(^|/)\.env(\.production|\.local|\.docker-local)?$' <<< "$NAMES"; then die "The archive contains a settings file with secrets (.env). It was not extracted."; fi
if grep -qE '\.cwbak|^(backups|storage|\.pgdata)/' <<< "$NAMES"; then die "The archive contains backups or uploaded files. It was not extracted."; fi
for f in Dockerfile docker-compose.yml package.json package-lock.json server.ts prisma/schema.prisma scripts/migrate.ts scripts/create-admin.ts scripts/legal-publish-reviewed.ts scripts/backup.ts .env.production.example src/app/api/health/route.ts; do
  grep -qxF "$f" <<< "$NAMES" || die "The archive is incomplete: $f is missing."
done
ok "archive integrity, path safety, no secrets, required files present"

# -----------------------------------------------------------------------------------------------------
step 3 "Checking production settings"
ENVF="$APP_DIR/.env.production"
[[ -f "$ENVF" ]] || die "$ENVF does not exist." "Create it from the template: copy .env.production.example from the release to $ENVF and fill it in (docs/ONE-COMMAND-DEPLOYMENT.md)."
PERM="$(stat -c '%a' "$ENVF")"
if [[ "$PERM" != "600" && "$PERM" != "400" ]]; then chmod 600 "$ENVF"; ok "settings file permissions tightened to 600 (contents unchanged)"; else ok "settings file permissions $PERM"; fi
MISSING=()
for k in POSTGRES_PASSWORD AUTH_SECRET ENCRYPTION_KEY BACKUP_ENCRYPTION_KEY SITE_URL ORG_NAME ORG_LEGAL_NAME ORG_JURISDICTION ORG_CONTACT_EMAIL SMTP_PASSWORD TRUSTED_PROXY_HOPS; do
  [[ -n "$(envval "$ENVF" "$k")" ]] || MISSING+=("$k")
done
(( ${#MISSING[@]} == 0 )) || die "Required settings are empty in $ENVF: ${MISSING[*]}" "Fill them in with: nano $ENVF   (secrets: openssl rand -hex 32; POSTGRES_PASSWORD: openssl rand -hex 24)"
PROBLEMS=()
[[ "$(envval "$ENVF" SITE_URL)" == "$SITE" ]] || PROBLEMS+=("SITE_URL must be exactly $SITE")
[[ "$(envval "$ENVF" POSTGRES_PASSWORD)" =~ ^[A-Za-z0-9]{16,}$ ]] || PROBLEMS+=("POSTGRES_PASSWORD must be at least 16 letters and digits only (openssl rand -hex 24)")
[[ $(envval "$ENVF" AUTH_SECRET | wc -c) -ge 32 ]] || PROBLEMS+=("AUTH_SECRET must be at least 32 characters")
[[ $(envval "$ENVF" ENCRYPTION_KEY | wc -c) -ge 32 ]] || PROBLEMS+=("ENCRYPTION_KEY must be at least 32 characters")
[[ "$(envval "$ENVF" ENCRYPTION_KEY)" != "$(envval "$ENVF" AUTH_SECRET)" ]] || PROBLEMS+=("ENCRYPTION_KEY must differ from AUTH_SECRET")
[[ $(envval "$ENVF" BACKUP_ENCRYPTION_KEY | wc -c) -ge 16 ]] || PROBLEMS+=("BACKUP_ENCRYPTION_KEY must be at least 16 characters")
P="$(envval "$ENVF" PORT)"; [[ -z "$P" || "$P" == "$PORT" ]] || PROBLEMS+=("PORT must be $PORT (or empty)")
[[ "$(envval "$ENVF" TRUSTED_PROXY_HOPS)" =~ ^[0-5]$ ]] || PROBLEMS+=("TRUSTED_PROXY_HOPS must be a number from 0 to 5")
[[ -z "$(envval "$ENVF" LOCAL_PRODUCTION_TEST)" ]] || PROBLEMS+=("LOCAL_PRODUCTION_TEST must not be set on the server")
[[ "$(envval "$ENVF" ADMIN_REQUIRE_2FA)" != "false" ]] || PROBLEMS+=("ADMIN_REQUIRE_2FA must not be false")
grep -E '^[A-Z0-9_]+=' "$ENVF" | grep -q '\$' && PROBLEMS+=("values must not contain the \$ character (Docker Compose would change them)")
(( ${#PROBLEMS[@]} == 0 )) || die "Some settings in $ENVF are not valid:" "${PROBLEMS[@]}"
ok "required settings present and valid (values not shown)"
EXPECT_SMTP=("SMTP_HOST=smtp.resend.com" "SMTP_PORT=465" "SMTP_SECURE=true" "SMTP_USER=resend" "EMAIL_FROM=Twigo <noreply@twigo.space>")
for pair in "${EXPECT_SMTP[@]}"; do
  k="${pair%%=*}"; v="${pair#*=}"
  [[ "$(envval "$ENVF" "$k")" == "$v" ]] || { note "WARNING: $k differs from the Resend setting ($v)"; manual "check $k in .env.production (expected: $v)"; }
done
ok "Resend email settings checked (the API key is present; it is never shown or changed)"

# -----------------------------------------------------------------------------------------------------
# Existing installation (old code), port 1010, volumes
[[ -f "$APP_DIR/docker-compose.yml" ]] && PREV_EXISTS=1
VOL_DB="${PROJECT}_twigo-postgres"; VOL_DATA="${PROJECT}_twigo-data"
DB_VOL_EXISTS=0; docker volume inspect "$VOL_DB" >/dev/null 2>&1 && DB_VOL_EXISTS=1
DATA_VOL_EXISTS=0; docker volume inspect "$VOL_DATA" >/dev/null 2>&1 && DATA_VOL_EXISTS=1
docker image inspect "$IMAGE:latest" >/dev/null 2>&1 && PREV_IMAGE=1
if [[ "$PREV_EXISTS" == "1" ]]; then
  [[ "$(health_of app)" =~ ^(healthy|running|starting)$ ]] && PREV_APP_RUNNING=1
fi
LISTENER="$(ss -ltnH "sport = :$PORT" 2>/dev/null || true)"
if [[ -n "$LISTENER" ]]; then
  OWN="$(docker ps --filter "label=com.docker.compose.project=$PROJECT" --filter "label=com.docker.compose.service=app" --format '{{.Ports}}' | grep -c ":$PORT->" || true)"
  [[ "$OWN" -gt 0 ]] || die "Port $PORT is already used by another program." "Twigo must listen on $PORT. Find it with: sudo ss -ltnp 'sport = :$PORT'"
  ok "port $PORT is used by the current Twigo (it will be replaced)"
else
  ok "port $PORT is free"
fi
note "existing installation: code=$([[ $PREV_EXISTS == 1 ]] && echo yes || echo no), running=$([[ $PREV_APP_RUNNING == 1 ]] && echo yes || echo no), database volume=$([[ $DB_VOL_EXISTS == 1 ]] && echo yes || echo no), files volume=$([[ $DATA_VOL_EXISTS == 1 ]] && echo yes || echo no)"

# -----------------------------------------------------------------------------------------------------
step 4 "Creating backups"
mkdir -p "$BK" && chmod 700 "$BACKUP_ROOT" "$BK"
cp -p "$ENVF" "$BK/.env.production"
[[ "$(sha256sum < "$ENVF")" == "$(sha256sum < "$BK/.env.production")" ]] || die "The copy of .env.production differs from the original."
ok "settings file copied byte for byte"
{
  echo "date: $TS"
  echo "new archive: $(basename "$ARCHIVE") sha256 $ACTUAL"
  echo "previous release: $(cat "$APP_DIR/.twigo-release" 2>/dev/null | head -n 1 || echo unknown)"
  echo "previous image: $(docker image inspect -f '{{.Id}}' "$IMAGE:latest" 2>/dev/null || echo none)"
  echo "volumes: $VOL_DB=$DB_VOL_EXISTS $VOL_DATA=$DATA_VOL_EXISTS"
} > "$BK/deployment-state.txt"
if [[ "$PREV_EXISTS" == "1" ]]; then dcx "$APP_DIR" ps >> "$BK/deployment-state.txt" 2>&1 || true; fi
if [[ "$PREV_IMAGE" == "1" ]]; then docker tag "$IMAGE:latest" "$IMAGE:previous-$TS"; ok "previous image kept as $IMAGE:previous-$TS"; fi
if [[ "$PREV_EXISTS" == "1" && "$(health_of db)" == "healthy" ]]; then
  psql_q "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY 1" > "$BK/migrations-before.txt" 2>>"$LOG" || true
  if [[ "$PREV_APP_RUNNING" == "1" ]]; then
    quiet dc exec -T app npm run db:backup -- --label "pre-deploy-$TS" || die "The database backup failed; nothing was changed." "See the log: $LOG"
  elif [[ "$PREV_IMAGE" == "1" ]]; then
    quiet dc run --rm --no-deps app npm run db:backup -- --label "pre-deploy-$TS" || die "The database backup failed; nothing was changed." "See the log: $LOG"
  fi
  if [[ "$PREV_IMAGE" == "1" ]]; then
    docker run --rm --user 0 -v "$VOL_DATA:/data:ro" -v "$BK:/out" --entrypoint sh "$IMAGE:previous-$TS" -c \
      "f=\$(ls -1t /data/backups/*pre-deploy-$TS* 2>/dev/null | head -n 1); [ -n \"\$f\" ] && cp \"\$f\" /out/ && chown $(id -u):$(id -g) /out/\$(basename \"\$f\")" >> "$LOG" 2>&1 \
      || die "The database backup could not be copied out of the volume." "See the log: $LOG"
    ok "database backed up (encrypted) to $BK and kept in the volume"
  fi
else
  skip "database backup (no running database from an earlier deployment)"
fi
if [[ "$DATA_VOL_EXISTS" == "1" && "$PREV_IMAGE" == "1" ]]; then
  docker run --rm --user 0 -v "$VOL_DATA:/data:ro" -v "$BK:/out" --entrypoint sh "$IMAGE:previous-$TS" -c \
    "[ -d /data/storage ] && tar -czf /out/storage.tar.gz -C /data storage && chown $(id -u):$(id -g) /out/storage.tar.gz || true" >> "$LOG" 2>&1 || true
  [[ -f "$BK/storage.tar.gz" ]] && ok "uploaded files archived to $BK/storage.tar.gz (volume $VOL_DATA left untouched)"
fi
note "volumes $VOL_DB and $VOL_DATA are never removed by this script"

# -----------------------------------------------------------------------------------------------------
step 5 "Preparing application release"
STAGING="$SELF_DIR/.twigo-staging-$TS"; NEWDIR="$SELF_DIR/.twigo-new-$TS"
mkdir -p "$STAGING"
tar -xzf "$ARCHIVE" -C "$STAGING" --no-same-owner --no-same-permissions >> "$LOG" 2>&1 || die "Extracting the archive failed." "See the log: $LOG"
for f in Dockerfile docker-compose.yml package.json scripts/legal-publish-reviewed.ts; do [[ -f "$STAGING/$f" ]] || die "Extracted release is incomplete: $f"; done
grep -q '"127.0.0.1:1010:1010"' "$STAGING/docker-compose.yml" || die "The release's docker-compose.yml does not publish 127.0.0.1:1010:1010."
grep -q 'PORT=1010' "$STAGING/Dockerfile" || die "The release's Dockerfile does not set PORT=1010."
grep -qE '^name: twigo$' "$STAGING/docker-compose.yml" || die "The release's docker-compose.yml does not keep the project name 'twigo' (the data volumes depend on it)."
if grep -nE '^\s+ports:' -A2 "$STAGING/docker-compose.yml" | grep -q '5432'; then die "The release would publish the database port."; fi
grep -q '"legal:publish-reviewed"' "$STAGING/package.json" || die "The release lacks the legal publication command."
mkdir -p "$NEWDIR"
cp -a "$STAGING/." "$NEWDIR/"
cp -p "$ENVF" "$NEWDIR/.env.production"
[[ "$(sha256sum < "$ENVF")" == "$(sha256sum < "$NEWDIR/.env.production")" ]] || die "The settings file could not be carried over unchanged."
printf '%s\n%s\n' "$(basename "$ARCHIVE") $ACTUAL" "deployed $TS" > "$NEWDIR/.twigo-release"
dcx "$NEWDIR" config --quiet >> "$LOG" 2>&1 || die "The Docker Compose configuration of the release is not valid with these settings." "See the log: $LOG"
python3 - "$NEWDIR" "$PROJECT" "$DOCKER_SUDO" >> "$LOG" 2>&1 <<'PY' || die "The release's service configuration is not as expected (port 1010 on 127.0.0.1, private database)." "See the log: $LOG"
import json, subprocess, sys
d, p = sys.argv[1], sys.argv[2]
prefix = ["sudo", "docker"] if sys.argv[3] == "1" else ["docker"]
out = subprocess.run(prefix + ["compose", "-p", p, "--project-directory", d, "-f", f"{d}/docker-compose.yml", "--env-file", f"{d}/.env.production", "config", "--format", "json"], capture_output=True, text=True, check=True).stdout
c = json.loads(out)
app, db = c["services"]["app"], c["services"]["db"]
ports = app.get("ports", [])
assert len(ports) == 1 and str(ports[0].get("published")) == "1010" and int(ports[0]["target"]) == 1010 and ports[0].get("host_ip") == "127.0.0.1", "app must publish 127.0.0.1:1010:1010"
assert str(app["environment"].get("PORT")) == "1010", "PORT must be 1010"
assert not db.get("ports"), "the database must not publish a port"
assert app.get("restart") == "unless-stopped" and db.get("restart") == "unless-stopped", "automatic restart must be on"
print("compose configuration: app 127.0.0.1:1010 -> 1010, database private, restart unless-stopped")
PY
ok "release prepared and checked (staging), settings carried over unchanged"
if [[ -d "$APP_DIR" ]]; then mv "$APP_DIR" "$BK/app-previous"; fi
mv "$NEWDIR" "$APP_DIR"; NEWDIR=""
SWAPPED=1
ok "new code installed in $APP_DIR (previous code kept in $BK/app-previous)"
rm -rf "$STAGING"; STAGING=""

# -----------------------------------------------------------------------------------------------------
step 6 "Building Docker image"
note "this takes a few minutes the first time"
if ! dc build app >> "$LOG" 2>&1; then
  tail -n 25 "$LOG" | sed 's/^/      | /'
  die "The Docker image could not be built." "The previous version is being restored. Details: $LOG"
fi
ok "image $IMAGE built (Next.js on 0.0.0.0:$PORT)"

# -----------------------------------------------------------------------------------------------------
step 7 "Starting PostgreSQL"
quiet dc up -d db || die "PostgreSQL could not be started." "See the log: $LOG"
wait_healthy db 180 || die "PostgreSQL did not become healthy within 3 minutes." "See: docker compose -p $PROJECT logs db"
ok "PostgreSQL healthy (database volume $VOL_DB kept)"

# -----------------------------------------------------------------------------------------------------
step 8 "Applying database migrations"
if ! quiet dc run --rm --no-deps app npm run db:deploy; then
  if tail -n 30 "$LOG" | grep -q 'password authentication failed'; then
    die "The database refused the password." "POSTGRES_PASSWORD in .env.production is not the password the database was created with"       "(it is set only when the database volume is first created). Put the original value back, or change it inside PostgreSQL first (docs/DEPLOYMENT.md, section 8)."
  fi
  die "The database migrations failed." "The database was backed up first ($BK). See the log: $LOG"
fi
APPLIED="$(psql_q "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL")"
ok "migrations applied with the project's migration history ($APPLIED in total; nothing reset)"

# -----------------------------------------------------------------------------------------------------
step 9 "Checking owner and legal publication"
OWNERS="$(psql_q "SELECT count(*) FROM \"User\" WHERE role = 'OWNER' AND status = 'ACTIVE'")"
if [[ "$OWNERS" -gt 0 ]]; then
  ok "owner account exists ($OWNERS active owner(s)); kept as it is"
else
  OE="${TWIGO_OWNER_EMAIL:-}"; ON="${TWIGO_OWNER_NAME:-}"
  if [[ -z "$OE" && "$INTERACTIVE" == "1" ]]; then
    say "      No owner account exists yet. It is created once; the password is typed at a hidden prompt."
    read -r -p "      Owner email address: " OE
    read -r -p "      Owner name: " ON
  fi
  [[ -n "$OE" ]] || die "No owner account exists and none can be created without your input." "Run this script in a terminal (it will ask), or set TWIGO_OWNER_EMAIL, TWIGO_OWNER_NAME and ADMIN_PASSWORD."
  [[ "$OE" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]] || die "'$OE' is not a valid email address."
  if [[ -n "${ADMIN_PASSWORD:-}" ]]; then
    dc run --rm --no-deps -T -e ADMIN_PASSWORD app npm run admin:create -- --email "$OE" --name "${ON:-Owner}" --role OWNER >> "$LOG" 2>&1 || die "The owner account could not be created." "See the log: $LOG"
  else
    dc run --rm --no-deps app npm run admin:create -- --email "$OE" --name "${ON:-Owner}" --role OWNER || die "The owner account could not be created."
  fi
  ok "owner account created for $OE (two-step verification is set up at the first sign-in)"
fi
OWNER_EMAIL="$(psql_q "SELECT email FROM \"User\" WHERE role = 'OWNER' AND status = 'ACTIVE' ORDER BY \"createdAt\" LIMIT 1")"

PUBLISHED="$(psql_q "SELECT count(DISTINCT \"documentId\") FROM \"LegalDocumentVersion\" WHERE status = 'PUBLISHED'")"
if [[ "$PUBLISHED" -ge "$LEGAL_DOCS" ]]; then
  ok "legal documents already published ($PUBLISHED of $LEGAL_DOCS); nothing changed"
else
  DO_PUBLISH="no"; BY="${TWIGO_LEGAL_REVIEWED_BY:-}"; ON_DATE="${TWIGO_LEGAL_REVIEWED_ON:-}"; EFF="${TWIGO_LEGAL_EFFECTIVE:-$(date +%Y-%m-%d)}"
  if [[ "${TWIGO_LEGAL_PUBLISH:-}" == "yes" ]]; then DO_PUBLISH="yes"
  elif [[ "$INTERACTIVE" == "1" ]]; then
    say "      $PUBLISHED of $LEGAL_DOCS legal documents are published. The others are shown as \"Draft awaiting legal review\"."
    say "      Publish them ONLY if a lawyer reviewed exactly the texts in this release. Their reviewer and date are recorded."
    read -r -p "      Type PUBLISH to publish the reviewed documents now, or press Enter to skip: " ANSWER
    if [[ "$ANSWER" == "PUBLISH" ]]; then
      DO_PUBLISH="yes"
      read -r -p "      Reviewed by (lawyer or law firm): " BY
      read -r -p "      Review date (YYYY-MM-DD): " ON_DATE
      read -r -p "      Effective date (YYYY-MM-DD, Enter for today $EFF): " E2; [[ -n "$E2" ]] && EFF="$E2"
    fi
  fi
  if [[ "$DO_PUBLISH" == "yes" ]]; then
    [[ -n "$BY" && "$ON_DATE" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ && "$EFF" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || die "Publishing needs the reviewer's name and dates as YYYY-MM-DD." "Nothing was published. Run again and answer the questions."
    PUB_OUT="$(dc run --rm --no-deps -T app npm run -s legal:publish-reviewed -- --owner "$OWNER_EMAIL" --reviewed-by "$BY" --reviewed-on "$ON_DATE" --effective "$EFF" 2>&1)" || { echo "$PUB_OUT" >> "$LOG"; die "Publishing the legal documents failed." "See the log: $LOG"; }
    echo "$PUB_OUT" >> "$LOG"
    grep -E '^(published|already-published|text-differs)' <<< "$PUB_OUT" | sed 's/^/      /'
    if grep -q '^text-differs' <<< "$PUB_OUT"; then manual "some legal documents were not published because their text differs from the reviewed one: Admin -> Legal"; fi
    ok "legal documents published (reviewed by $BY on $ON_DATE, effective $EFF)"
  else
    skip "legal publication (documents stay \"Draft awaiting legal review\"; run the script again to publish)"
    manual "publish the reviewed legal documents: run this script again and type PUBLISH"
  fi
fi

# -----------------------------------------------------------------------------------------------------
step 10 "Starting and verifying Twigo"
quiet dc up -d --no-build app || die "Twigo could not be started." "See: docker compose -p $PROJECT logs app"
if ! wait_healthy app 240; then
  dc logs --tail 40 app 2>&1 | grep -vE 'PASSWORD|SECRET|KEY' | sed 's/^/      | /' || true
  die "Twigo did not become healthy within 4 minutes." "The previous version is being restored. Details: $LOG"
fi
ok "application container healthy (automatic restart: unless-stopped)"
APPC="$(container_of app)"; DBC="$(container_of db)"
V_FAIL=()
check() { if eval "$2" >> "$LOG" 2>&1; then note "  pass  $1"; else note "  FAIL  $1"; V_FAIL+=("$1"); fi; }
check "PostgreSQL healthy" '[[ "$(health_of db)" == healthy ]]'
check "database reachable from the app (/api/health)" 'curl -fsS --max-time 10 http://127.0.0.1:$PORT/api/health | grep -q "\"db\":\"ok\""'
check "Next.js listens on 0.0.0.0:1010 inside the container" 'docker exec "$APPC" sh -c "cat /proc/net/tcp /proc/net/tcp6" | awk '"'"'$4=="0A"{print $2}'"'"' | grep -qi ":03F2$"'
check "host port 127.0.0.1:1010 -> container 1010" 'docker port "$APPC" | grep -q "1010/tcp -> 127.0.0.1:1010"'
for path in / /login /join /legal /legal/terms /legal/privacy; do
  check "page $path answers 200" '[[ "$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 http://127.0.0.1:$PORT'"$path"')" == 200 ]]'
done
# The WebSocket stays open until curl's time limit, so curl always "fails" with a timeout: only its first line counts.
check "live chat WebSocket upgrade (101)" '{ curl -s -i -N --max-time 5 -H "Connection: Upgrade" -H "Upgrade: websocket" -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" -H "Origin: http://127.0.0.1:$PORT" "http://127.0.0.1:$PORT/socket.io/?EIO=4&transport=websocket" || true; } | head -n 1 | grep -q " 101 "'
check "production mode (not development)" 'docker exec "$APPC" sh -c "[ \"\$NODE_ENV\" = production ]" && docker logs "$APPC" 2>&1 | grep "server.ready" | tail -n 1 | grep -q "\"dev\":false"'
check "database port not published" '[[ -z "$(docker port "$DBC" 2>/dev/null)" ]]'
check "no settings file with secrets inside the image" '[[ -z "$(docker run --rm --entrypoint sh $IMAGE:latest -c "ls -a /app" | grep -E "^\.env" | grep -vxE "\.env\.example|\.env\.production\.example")" ]]'
ERRS="$(docker logs --since 10m "$APPC" 2>&1 | grep -c '"level":"error"' || true)"
note "  info  startup log: $ERRS error line(s) in the last 10 minutes (see: docker compose -p $PROJECT logs app)"
(( ${#V_FAIL[@]} == 0 )) || die "Verification failed: ${V_FAIL[*]}" "The previous version is being restored. Details: $LOG"
ok "all local checks passed"
SWAPPED=0

HOPS="$(envval "$ENVF" TRUSTED_PROXY_HOPS)"
manual "register twigo.space in the central Caddy with upstream 127.0.0.1:$PORT (WebSocket on, www.twigo.space -> https://twigo.space)"
manual "Caddy must trust Cloudflare's addresses (global option: servers { trusted_proxies static <Cloudflare ranges> }); TRUSTED_PROXY_HOPS is $HOPS"
manual "Cloudflare SSL/TLS mode: Full (strict)"
manual "send one real test email: sign in as the owner, Admin -> Email -> Check connection, then Send a test email to me"
manual "copy $BACKUP_ROOT and the Docker volume backups off the server (docs/DEPLOYMENT.md, section 8)"
FINISHED=1
summary "SUCCESS (local checks); public HTTPS needs the Caddy registration above"
