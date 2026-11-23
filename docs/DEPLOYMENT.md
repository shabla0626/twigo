# Deployment guide

Nothing has been deployed yet. The founder chose **one always-on server** and has set it up (section 0).

## 0. Production target

| Setting | Value |
| --- | --- |
| Public address | `https://twigo.space` (canonical; `www.twigo.space` redirects to it) |
| `SITE_URL` | `https://twigo.space` (exactly; see section 4) |
| DNS | Cloudflare (nameservers `paityn` / `sullivan.ns.cloudflare.com`), records **proxied** |
| Server | VPS at `162.35.23.106`, SSH `ssh shabla@162.35.23.106` |
| Reverse proxy and HTTPS | The server's **existing, centrally managed Caddy**. Twigo has no Caddy of its own: no Caddyfile, no Caddy service or container in this project. Twigo is *registered* with the central system (section 5) |
| App | Docker Compose (`docker-compose.yml`): Next.js (inside `server.ts`, with the live chat) listens on **`0.0.0.0:1010` in the container**; the host publishes the **same port on `127.0.0.1:1010`** only. No port 3000 anywhere in production |
| Database | PostgreSQL 16 container `db`, reachable only by the app container (no published port) |
| Central Caddy upstream | `127.0.0.1:1010` (if the central Caddy runs on the host); see section 5 if it runs in Docker |
| Email | Resend SMTP, sender `Twigo <noreply@twigo.space>` ([EMAIL.md](EMAIL.md)) |

Architecture:

```
https://twigo.space -> Cloudflare (proxy) -> central Caddy on the VPS (HTTPS)
                    -> 127.0.0.1:1010 on the VPS -> container port 1010 -> Next.js (server.ts + Socket.IO)
                                                                          -> db container (PostgreSQL)
```

Status on 23 November 2026: not deployed; the public address answers with Cloudflare error 525
(Cloudflare cannot make a secure connection to the server, because nothing serves `twigo.space` there yet).

## 1. What runs where

One Node.js process (`server.ts`) serves everything:

| Part | How it runs | Needs |
| --- | --- | --- |
| Website, member portal, admin | Next.js 16 inside `server.ts` | Node.js 20.9+ (tested on 24) |
| Real-time chat, presence, live notifications | Socket.IO on the same port, path `/socket.io` | A host that allows long-lived WebSocket connections |
| Server events between instances | PostgreSQL `LISTEN/NOTIFY` (channel `cowork_realtime`) | Nothing extra |
| Daily retention + daily backup | In-process scheduler (`JOBS_ENABLED=true`), guarded by Postgres advisory locks | Writable `BACKUP_DIR` |
| Database | PostgreSQL 14+ | Managed or self-hosted |
| Uploaded files | Private directory `STORAGE_DIR` (never under `/public`) | **Persistent disk** (or replace the small driver in `src/server/community/files.ts` with S3-compatible storage) |
| Email | Resend (free plan) or any SMTP provider, see [EMAIL.md](EMAIL.md) | Account with the provider |
| Voice/video | **Google Meet** (founder decision, Phase 1); the app only stores links and metadata | Members' Google accounts |

**Not compatible with serverless platforms** (e.g. Vercel functions), because WebSocket
connections and the scheduler need a long-running process.

Suitable hosts: a small VPS (Hetzner, DigitalOcean, Linode, Lightsail…) behind Caddy or
nginx, or a container platform with persistent disks and WebSocket support (Render,
Railway, Fly.io).

## 2. Estimated operating costs (about 30 members)

Rough list prices to verify at purchase time. Nothing was bought.

| Item | Typical choice | Est. monthly |
| --- | --- | --- |
| Server (2 vCPU, 2–4 GB RAM, 40+ GB disk) | VPS | $6–25 |
| PostgreSQL | Same VPS (self-managed) or a managed starter plan | $0 (same VPS) – $15–25 |
| Off-site backup storage | S3-compatible object storage, a few GB | $1–5 |
| Email delivery (low volume) | Transactional SMTP provider; many have free tiers of a few thousand emails/month | $0–15 |
| Domain name | Registrar | ~$1–2 (≈$12–20/year) |
| TLS certificate | Let's Encrypt via Caddy/nginx | $0 |
| Video meetings | Google Meet (free personal accounts have a time limit on group calls; Google Workspace removes it) | $0 – ~$7+ per organizer |
| **Total** | | **≈ $10–75 / month** |

Expected load: 30 members, a few concurrent chat users, small files. A 2 GB VPS is
sufficient. Self-hosting video (e.g. LiveKit) would add roughly $20–60/month for a
server with good bandwidth, but it is not part of Phase 1.

## 3. PostgreSQL setup

```sql
CREATE DATABASE cowork;
CREATE USER cowork_app WITH PASSWORD '<strong-random-password>';
GRANT CONNECT ON DATABASE cowork TO cowork_app;
\c cowork
GRANT USAGE, CREATE ON SCHEMA public TO cowork_app;
```

```
DATABASE_URL="postgresql://cowork_app:<password>@<host>:5432/cowork?schema=public&sslmode=require"
```

## 4. Production environment variables

Set them in the host's secret manager (never commit them).

**The server checks all of this before it starts** (`server.ts`, rules in
`src/lib/env-schema.ts`). In production it prints a plain list of what is wrong and
exits without serving anything when:

* `SITE_URL` is missing, points to this computer, or is not `https://`;
* `ENCRYPTION_KEY` is missing/short or equals `AUTH_SECRET`, or `AUTH_SECRET` still has
  the development value;
* `SMTP_HOST`, `EMAIL_FROM` or `ORG_CONTACT_EMAIL` is empty;
* `ORG_LEGAL_NAME` or `ORG_JURISDICTION` is empty (the Privacy Notice and the Terms would
  show a placeholder instead of who is responsible);
* `BACKUP_ENCRYPTION_KEY` is missing (at least 16 characters);
* `ADMIN_REQUIRE_2FA` is turned off;
* `TRUSTED_PROXY_HOPS` is not set explicitly;
* the database contains an active owner or administrator with a test address
  (`@example.test`, `@example.com`, `.invalid`, `.localhost`…), or no owner at all.

`GET /api/health` answers 503 when the settings are invalid, so a wrongly configured
release never looks healthy. **`SITE_URL` must already be set when you run
`npm run build`**: page addresses for search engines and the allowed live-chat address
are fixed at build time.

`LOCAL_PRODUCTION_TEST=1` is used only by the browser tests and the performance
measurement on a development computer. It is honoured only while `SITE_URL` is a local
address; on a real site the start is refused if it is set.

| Variable | Notes |
| --- | --- |
| `DATABASE_URL` | As above |
| `SITE_URL` | Public HTTPS URL, written exactly as people reach the site (scheme, host and, if not the default, port; no path). It is used for the origin checks of the live chat **and of file uploads**: a different spelling (for example `www.` missing, or `http://`) makes chat and uploads refuse every request. Also used for the CSP. Needed at build time too |
| `TRUSTED_PROXY_HOPS` | `1` behind one reverse proxy (Caddy, nginx), `0` when reached directly. See section 5 |
| `PORT`, `HOST` | Production: **1010** / `0.0.0.0` (fixed in `docker-compose.yml`; `server.ts` also defaults to 1010 in production). Development (`npm run dev`): 3000 / 127.0.0.1. `HOSTNAME` is not used: Docker sets it to the container's name |
| `AUTH_SECRET` | ≥ 32 random chars (form tokens, IP hashing) |
| `ENCRYPTION_KEY` | ≥ 32 random chars, different from `AUTH_SECRET` (encrypts 2FA secrets). **Losing it disables everyone's 2FA**: keep it in your password manager |
| `SESSION_TTL_HOURS` / `MEMBER_SESSION_TTL_HOURS` | Admin 8 h, member 14 days by default. Independently of this, an owner or administrator who does nothing for 60 minutes must sign in again (fixed, `ADMIN_IDLE_MINUTES` in `src/lib/auth/constants.ts`) |
| `ADMIN_REQUIRE_2FA` | `true` (keep it) |
| `ORG_NAME`, `ORG_TAGLINE`, `ORG_LEGAL_NAME`, `ORG_JURISDICTION`, `ORG_CONTACT_EMAIL`, `EMAIL_FROM_NAME` | Branding (one place: `src/config/brand.ts`) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM` | Required for confirmation emails, password resets and administrator invitations |
| `ADMIN_NOTIFICATION_EMAIL`, `SEND_APPLICANT_CONFIRMATION` | Optional |
| `STORAGE_DIR`, `MAX_UPLOAD_MB` | Persistent disk path; default 10 MB |
| `JOBS_ENABLED`, `BACKUP_DIR`, `BACKUP_KEEP`, `BACKUP_ENCRYPTION_KEY` | Daily jobs; set the encryption key |

## 5. Build, migrate, start (Docker, port 1010)

On the VPS, in the project folder, with `.env.production` filled in from `.env.production.example`
(Docker Engine with the Compose plugin is needed). Every command passes `--env-file .env.production`
so Compose can fill in `POSTGRES_PASSWORD`:

```bash
alias dc='docker compose --env-file .env.production'
dc build                                   # image; Next.js build reads .env.production as a build secret
dc up -d db                                # database first
dc run --rm app npm run db:backup -- --label pre-release   # before every migration (skip on the very first start)
dc run --rm app npm run db:deploy          # apply migrations
# first start only: create the owner now (section 6), or the start is refused ("no owner")
dc up -d app                               # Next.js on 0.0.0.0:1010 in the container, 127.0.0.1:1010 on the host
curl -s http://127.0.0.1:1010/api/health   # from the VPS: {"status":"ok","db":"ok",...}
docker port twigo-app-1                    # should show 1010/tcp -> 127.0.0.1:1010
```

**Trial on a development computer** (Docker in WSL, done on 23 November 2026, see
[TWIGO-RESEND-CADDY-INTEGRATION-REPORT.md](TWIGO-RESEND-CADDY-INTEGRATION-REPORT.md), section G): a
git-ignored `.env.docker-local` with generated test secrets, `SITE_URL=http://127.0.0.1:1010` and
`LOCAL_PRODUCTION_TEST=1`, used through `TWIGO_ENV_FILE`:

```bash
cd /mnt/d/MyProject/Co_work
export TWIGO_ENV_FILE=.env.docker-local
alias dc='docker compose --env-file .env.docker-local'
dc build && dc up -d db && dc run --rm app npm run db:deploy && dc up -d app
# open http://127.0.0.1:1010 ; stop with: dc stop   (dc down keeps the data volumes)
```

The site listens on **1010** in the container and on the host (`127.0.0.1:1010:1010`); there is no
other application port. Updating: copy the new release onto the server (replace the project folder,
keeping `.env.production`), then `dc build`, backup, `dc run --rm app npm run db:deploy`,
`dc up -d app`. Logs: `dc logs -f app`. Uploaded files and backups are in the `twigo-data` volume,
the database in `twigo-postgres`; `docker compose down` keeps both (never add `-v`).

**Reverse proxy: the server's central Caddy.** Do not install or configure another Caddy for
Twigo. Register `twigo.space` with the server's existing Caddy management system, upstream
**`127.0.0.1:1010`** when the central Caddy runs directly on the host (the exact specification is in
[TWIGO-RESEND-CADDY-INTEGRATION-REPORT.md](TWIGO-RESEND-CADDY-INTEGRATION-REPORT.md), section C).
If the central Caddy itself runs in a Docker container, `127.0.0.1` inside it is that container, not
the host: then let Caddy reach the host's port 1010 the way the server's other sites do (for example
`host.docker.internal:1010` with `extra_hosts: ["host.docker.internal:host-gateway"]` on the Caddy
container, and publish Twigo as `"<docker-bridge-ip>:1010:1010"` instead of `127.0.0.1`). The app
port stays 1010 in every case. Caddy forwards WebSocket upgrades (`/socket.io`) and sets
`X-Forwarded-For`/`X-Forwarded-Proto` by itself.

**Required behind Cloudflare:** Caddy must trust Cloudflare's addresses, or it replaces the
visitor's address with Cloudflare's and every visitor shares one sign-in limit. In the central Caddy's
global options: `servers { trusted_proxies static <Cloudflare IPv4 and IPv6 ranges> }` (the ranges are
published at https://www.cloudflare.com/ips/), or the `cloudflare` IP-source module. If this is missing,
the app logs `proxy.forwarded_chain_too_short` (at most once an hour).

**`TRUSTED_PROXY_HOPS`** is the number of proxies in front of the app that add to
`X-Forwarded-For`. With the Cloudflare proxy **and** Caddy that is **2**: Cloudflare writes the
visitor's address, Caddy adds Cloudflare's. With `1` every visitor would appear to be a Cloudflare
address and share one sign-in limit. Use `2` only while the server accepts web traffic exclusively
from Cloudflare (otherwise someone reaching the server directly could choose their own address);
without the Cloudflare proxy use `1`. The startup log line `server.ready` states which source is in
use. To check a new deployment: sign in from two different networks and confirm in **Admin → Audit
log** that the two sign-ins are not blocked together after one of them makes repeated wrong attempts.

Docker restarts the containers after a failure or a server reboot (`restart: unless-stopped`) and
checks `/api/health` every 30 seconds.

Run **one instance** unless you also move rate limiting (`src/lib/rate-limit.ts`, chat
limits in `src/realtime/server.ts`) to Redis and add the Socket.IO Redis adapter;
cross-instance events already work through `LISTEN/NOTIFY`.

## 6. First production start (clean database, one owner)

Production never starts from a development or demonstration database. It starts empty:

1. The `db` container creates an empty UTF-8 database (`dc up -d db`, section 5).
2. `dc run --rm app npm run db:deploy` (creates all tables; no data).
3. Create the one legitimate owner. The password is typed at a prompt and never shown:

   ```bash
   dc run --rm app npm run admin:create -- --email <owner email> --name "Founder"
   ```

4. `dc up -d app`. The start is refused, with the reason (`dc logs app`), if any setting from
   section 4 is missing, if no owner exists, or if an administrator with a test address exists.
5. Sign in at `/login`; you are sent to `/account/security` to set up two-step
   verification (authenticator app) and save your recovery codes. Further
   administrators are invited from `/admin/admins`.

After step 3 the database contains exactly one account and nothing else. Organization
settings (support threshold, retention periods) use their defaults until changed at
`/admin/settings`.

**Environments.** Keep them apart and never copy one into another:

| Environment | Database | Purpose |
| --- | --- | --- |
| Development | `cowork` on the developer's computer | Working copy; may contain test people and records |
| Demonstration | `cowork_demo` | Fictional people for showing the site (`npm run demo:seed`) |
| Automated tests | `cowork_test`, `cowork_e2e` | Emptied and refilled by the tests |
| Production | created as described above | Real people only |

**Command-line account tools** (need access to the server; every use is audited):

Run them as `dc run --rm app npm run admin:create -- ...` on the VPS.

```bash
# Reset an administrator's password (the role is kept, all their sessions end)
npm run admin:create -- --email admin@your-domain
# An administrator lost the authenticator AND the recovery codes
npm run admin:create -- --email admin@your-domain --reset-2fa
# Deliberately give an existing account more power (member -> administrator, role
# change, or bringing back a suspended/deactivated account): add --promote
npm run admin:create -- --email member@your-domain --role ADMIN --promote
```

## 7. Email

Step-by-step for Resend (free plan): [EMAIL.md](EMAIL.md).

**Database encoding:** create the production database with `ENCODING 'UTF8'` (the default on most
Linux hosts), so names and text in every language can be stored. `npm run db:restore` and the
development scripts create UTF-8 databases automatically.

1. Create an account with a transactional email provider; verify the sending domain
   (SPF, DKIM, DMARC).
2. Set the SMTP variables, then use **Admin → Email → Check connection** and **Send a test email to me**.
3. Confirm the test arrives in a real inbox (the app can only confirm that the provider
   *accepted* the message).
4. Create a test account (confirmation email) and send yourself a password reset before
   public recruitment.

## 8. Backups and restore

In Docker (section 5, `dc` = `docker compose --env-file .env.production`):

* The app writes a logical backup of every table daily to `/data/backups` in the `twigo-data`
  volume (`JOBS_ENABLED=true`), compressed and encrypted with `BACKUP_ENCRYPTION_KEY`
  (AES-256-GCM; nothing is written unencrypted), and keeps the newest `BACKUP_KEEP`.
  Manual: **Admin → Backups → Back up now**, or `dc exec app npm run db:backup -- --label manual`.
* **Copy backups and uploaded files off the server** daily. A backup on the same disk does not
  survive disk loss. Example (from the VPS, into a folder that your off-site job copies):

  ```bash
  docker run --rm -v twigo_twigo-data:/data -v /srv/twigo-offsite:/out alpine \
    sh -c 'cp -a /data/backups /out/ && tar -czf /out/storage.tgz -C /data storage'
  ```

  Keep `BACKUP_ENCRYPTION_KEY` in your password manager: without it the backups cannot be read.
* **Restore test** (never touches the live database; the target name must contain "restore"):

  ```bash
  dc exec app ls -t /data/backups                       # newest first
  dc exec app npm run db:restore -- /data/backups/<file> --into twigo_restore_check
  dc exec db dropdb -U twigo twigo_restore_check         # afterwards
  ```

  It creates the database, runs the migrations, loads every table and verifies row counts and
  checksums table by table. Verified in the Docker production build on this project's development
  computer on 23 November 2026 (docs/TWIGO-RELEASE-REPORT.md). Repeat after deployment and at least
  quarterly.
* **Rollback to a backup** (after a failed release): restore into a new database whose name contains
  `restore` (above), then point the app at it and restart:

  ```bash
  TWIGO_DB_NAME=twigo_restore_check dc up -d app
  ```

  `TWIGO_DB_NAME` (default `twigo`) is read by `docker-compose.yml`; changing `DATABASE_URL` in
  `.env.production` has no effect, because Compose sets it.
* `POSTGRES_PASSWORD` is applied only when the database volume is first created. To change it later,
  change it inside PostgreSQL first (`dc exec db psql -U twigo -c "ALTER USER twigo PASSWORD '...'"`),
  then in `.env.production`, then `dc up -d app`.

## 9. Monitoring

* Health check: `GET /api/health` → `{"status":"ok","db":"ok"}` (503 when the database
  is unreachable). Point an uptime monitor at it.
* Logs are single-line JSON on stdout (ids only, no personal data). Alert on
  `level=error`, especially `email.send_failed`, `job.failed`, `realtime.send_failed`,
  `audit.write_failed`.
* Review **Admin → Audit log**, **Backups** (job history) and **Privacy** (retention
  runs) weekly.

## 10. Pre-launch checklist

- [ ] Hosting, domain and email provider costs approved by the founder
- [ ] Legal review complete; placeholders replaced (`docs/LEGAL-REVIEW.md`, `docs/legal/`)
- [ ] Branding variables set; content reviewed in /admin/content
- [ ] Strong `AUTH_SECRET` and `ENCRYPTION_KEY`; owner account with 2FA; no test accounts
- [ ] HTTPS active; WebSockets work through the proxy (chat shows "Connected")
- [ ] Email provider verified with a real inbox (confirmation email + password reset)
- [ ] Off-site backup copy job running; restore test done on the server
- [ ] Retention periods confirmed at /admin/settings
- [ ] Full flow tested on staging: create account → confirm email → application → acceptance →
      idea → endorsements → group → chat → meeting link

## 11. Version control, backups and rollback (development computer)

Set up on 22 November 2026 as Stage 0 of `docs/CORRECTIVE-IMPLEMENTATION-PLAN.md`.

### What is and is not in the repository

* The project is a local Git repository on branch `main`. The state at the final audit
  is tagged `audit-baseline-2026-11-22`.
* **Never tracked:** `.env` files (only `.env.example` is tracked), the local database
  (`.pgdata/`), `backups/`, uploaded files (`storage/`), captured test email, build
  output, keys and certificates, database exports. The rules are in `.gitignore`.
* Before every commit that adds new kinds of files, run `git status --ignored --short`
  and check that nothing private is about to be tracked and that no source folder is
  hidden by a rule. (Two such mistakes were caught this way when the repository was
  created: a rule for backup folders hid the admin Backups page, and a rule for SQL
  exports hid the migration files. Both rules were corrected.)

### Making a safety copy

1. Code: `git bundle create backups/cowork-code-<date>.bundle --all`
   (one file that contains the whole history; check it with `git bundle verify <file>`).
2. Data: `npm run db:backup -- --label <reason>` (writes to `backups/`).
3. Uploaded files: copy the `storage/` folder, if it exists.
4. Copy the bundle, the newest backup file and the `storage/` copy to a second place
   (external drive first; an outside service only after the founder approves one).
5. Keep `.env` in a password manager, not next to the copies.

### Proving a backup works

`npm run db:restore -- backups/<file> --into cowork_restore_check`

Restore always creates a new, separate database and checks every table. It refuses to
write over the database the site is using. Remove the check database afterwards.

### Rolling back

| What went wrong | How to go back |
|---|---|
| One correction caused a problem | `git revert <commit>`. Every correction is its own commit, named with its finding ID |
| Everything since the audit must be undone | `git checkout audit-baseline-2026-11-22` (look at it) or create a branch from that tag and continue there. Nothing is deleted from history |
| A database migration must be undone | Restore the backup that was made immediately before that migration into a **new** database (`--into <name>`), then set `DATABASE_URL` to the new database and check out the commit from before the migration. The old database is kept until the founder confirms it is no longer needed |
| Data was changed by mistake | Same restore; compare and copy back only what is needed |

Before every migration: make a backup, restore it once into a check database, and only
then apply the migration.
