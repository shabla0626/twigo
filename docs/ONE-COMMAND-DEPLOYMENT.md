# Twigo: one-command deployment

Deploying or updating Twigo on the Ubuntu VPS is one command:

```bash
bash ~/Server/deploy-twigo.sh
```

## 1. Upload three files (from this computer)

From the project folder on Windows (PowerShell), upload the script, the release archive and its
checksum into `~/Server/` on the VPS:

```powershell
scp release/deploy-twigo.sh release/twigo-rc3-2026-11-23.tar.gz release/twigo-rc3-2026-11-23.tar.gz.sha256 shabla@162.35.23.106:~/Server/
```

The VPS then looks like this (`.env.production` is yours and stays where it is):

```
/home/shabla/Server/
    deploy-twigo.sh
    twigo-rc3-2026-11-23.tar.gz
    twigo-rc3-2026-11-23.tar.gz.sha256
    twigo/
        .env.production
```

If several archives are in the folder, the newest one is used. Do not unpack the archive yourself.

## 2. Once only: the settings file

`~/Server/twigo/.env.production` must be complete before the first run. Start from
`.env.production.example` (in the archive, or in this repository) and fill in: `POSTGRES_PASSWORD`
(`openssl rand -hex 24`), `AUTH_SECRET`, `ENCRYPTION_KEY`, `BACKUP_ENCRYPTION_KEY` (each
`openssl rand -hex 32`), `ORG_LEGAL_NAME=Twigo`, `ORG_JURISDICTION`, `ORG_CONTACT_EMAIL=contact@twigo.space`,
and the Resend API key in `SMTP_PASSWORD`. The script checks every required value (without showing it)
and tells you exactly which one is missing or invalid. It never changes this file's contents (it only
tightens its permissions to 600).

## 3. Run it

```bash
bash ~/Server/deploy-twigo.sh
```

It shows ten steps:

```
[1/10] Checking server environment...      Ubuntu, Docker, Compose >= 2.17, disk space, tools
[2/10] Verifying release archive...        checksum, readable, no unsafe paths, no secrets, all files
[3/10] Checking production settings...     every required value present and valid (never printed)
[4/10] Creating backups...                 settings, previous code, database, uploaded files
[5/10] Preparing application release...    unpacked in a staging folder, checked, then swapped in
[6/10] Building Docker image...            Next.js on 0.0.0.0:1010
[7/10] Starting PostgreSQL...              waits until it is really healthy
[8/10] Applying database migrations...     the project's migrations; nothing is reset
[9/10] Checking owner and legal publication...
[10/10] Starting and verifying Twigo...    health, pages, chat WebSocket, port 1010, no secrets in the image
```

**Questions it may ask (only when needed):**

- **First run only, if no owner exists:** your email and name, then a hidden password prompt (twice).
  Use your real address (not an `@example` or `.test` address: the site refuses to start with those).
- **While the legal documents are not published:** it asks you to type `PUBLISH` to publish them, then
  the lawyer's or firm's name, the review date and the effective date. Type `PUBLISH` only if a lawyer
  reviewed exactly these texts; press Enter to skip (the documents are then shown as "Draft awaiting legal
  review" and you can publish them on a later run). Only texts identical to the reviewed ones are
  published, and the reviewer is recorded in the audit log.

Later runs (updates) ask nothing: the owner and the published documents are kept.

## 4. What it leaves for you

The final summary lists them; they are not automated on purpose:

1. **Central Caddy:** register `twigo.space` with upstream `127.0.0.1:1010` (WebSocket on;
   `www.twigo.space` redirects to `https://twigo.space`). Caddy must trust Cloudflare's addresses:
   global option `servers { trusted_proxies static <Cloudflare ranges> }`. Cloudflare SSL/TLS: Full (strict).
2. **One real test email:** sign in as the owner (set up two-step verification first), then
   Admin → Email → Check connection → Send a test email to me. "Accepted by provider" means Resend took
   it; check the inbox.
3. **Off-site copies** of `~/Server/backups/twigo/` and of the Docker volume backups.

## 5. Safety

- **Backups before any change**, in `~/Server/backups/twigo/<date_time>/`:
  - `.env.production`, copied byte for byte;
  - the previous code (`app-previous/`) and image (`twigo-app:previous-<date_time>`);
  - an encrypted database backup (also kept in the volume);
  - the uploaded files (`storage.tar.gz`);
  - `deployment-state.txt` (previous release, image, volumes, migrations).
- **Never** removes Docker volumes, never resets or recreates the database, never prints secrets,
  never touches Caddy, Cloudflare or the firewall. The Compose project name stays `twigo`, so the
  existing volumes `twigo_twigo-postgres` and `twigo_twigo-data` are reused.
- **If a step fails,** it stops, keeps all backups and the log, and, if the new code was already
  swapped in, puts the previous code and image back and starts the previous version again. It never
  reports success after a partial deployment. Database migrations are not undone automatically. To
  return to the database as it was, restore the backup from that run (`docs/DEPLOYMENT.md`, section 8).
- **Running it again is safe:** no second owner, no duplicate documents, no reset, no new secrets.

## 6. Logs and help

- Deployment logs: `~/Server/logs/twigo-deploy-<date_time>.log` (no secret values).
- Application logs: `docker compose -p twigo --project-directory ~/Server/twigo logs -f app`.
- Health on the VPS: `curl -s http://127.0.0.1:1010/api/health`.

How it was tested: `scripts/deploy/test-deploy.sh` (isolated; see `docs/ONE-COMMAND-DEPLOYMENT-REPORT.md`).
