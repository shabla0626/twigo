# Deployment guide

Nothing has been deployed yet. The founder chose **one always-on server** and has set it up (section 0).

## 0. Production target

| Setting | Value |
| --- | --- |
| Public address | `https://twigo.space` (the site's only canonical address; `www.twigo.space` should redirect to it) |
| `SITE_URL` | `https://twigo.space` (exactly; see section 4) |
| Server | VPS at `162.35.23.106` |
| SSH access | `ssh shabla@162.35.23.106` |
| App directory / service | `/srv/cowork`, systemd unit `cowork.service`, running as its own `cowork` user (section 5) |
| Email sender | `no-reply@twigo.space` once the domain is verified with the email provider ([EMAIL.md](EMAIL.md)) |

Still to do by the founder before the first start (none of this has been done from this project):

1. DNS at the domain registrar: an `A` record for `twigo.space` and for `www.twigo.space` pointing to
   `162.35.23.106` (and `AAAA` records only if the VPS has an IPv6 address).
2. On the VPS: Node.js 20.9+ (tested on 24), PostgreSQL 14+, Caddy (or nginx), a firewall allowing only
   ports 22, 80 and 443. Prefer SSH keys over passwords for `shabla`, and do not run the app as `shabla`
   or `root`.
3. Name the VPS provider and the server location in the Privacy Policy (a new version, reviewed), and
   enter the legal details in Admin → Legal → Legal notices.

Then follow sections 3 to 6.

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
| `PORT`, `HOST` | Default 3000 / 0.0.0.0 |
| `AUTH_SECRET` | ≥ 32 random chars (form tokens, IP hashing) |
| `ENCRYPTION_KEY` | ≥ 32 random chars, different from `AUTH_SECRET` (encrypts 2FA secrets). **Losing it disables everyone's 2FA**: keep it in your password manager |
| `SESSION_TTL_HOURS` / `MEMBER_SESSION_TTL_HOURS` | Admin 8 h, member 14 days by default. Independently of this, an owner or administrator who does nothing for 60 minutes must sign in again (fixed, `ADMIN_IDLE_MINUTES` in `src/lib/auth/constants.ts`) |
| `ADMIN_REQUIRE_2FA` | `true` (keep it) |
| `ORG_NAME`, `ORG_TAGLINE`, `ORG_LEGAL_NAME`, `ORG_JURISDICTION`, `ORG_CONTACT_EMAIL`, `EMAIL_FROM_NAME` | Branding (one place: `src/config/brand.ts`) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM` | Required for confirmation emails, password resets and administrator invitations |
| `ADMIN_NOTIFICATION_EMAIL`, `SEND_APPLICANT_CONFIRMATION` | Optional |
| `STORAGE_DIR`, `MAX_UPLOAD_MB` | Persistent disk path; default 10 MB |
| `JOBS_ENABLED`, `BACKUP_DIR`, `BACKUP_KEEP`, `BACKUP_ENCRYPTION_KEY` | Daily jobs; set the encryption key |

## 5. Build, migrate, start

```bash
npm ci
npm run build          # prisma generate + next build (webpack)
npm run db:backup -- --label pre-release   # before every migration
npm run db:deploy      # apply migrations (or: npx prisma migrate deploy)
npm start              # tsx server.ts --production
```

Reverse proxy: forward `Upgrade`/`Connection` headers for `/socket.io` and set
`X-Forwarded-For`. **Set `TRUSTED_PROXY_HOPS` to the number of proxies in front of the
app** (1 for a single Caddy or nginx; 0 only when the app is reached directly). The app
counts sign-in and form attempts per visitor address and takes that address from the
position in `X-Forwarded-For` written by your own proxy, never from what a visitor
sends. The startup log line `server.ready` states which source is in use. To check a
new deployment: sign in from two different networks and confirm in **Admin → Audit
log** that the two sign-ins are not blocked together after one of them makes repeated
wrong attempts. With nginx use `proxy_set_header X-Forwarded-For
$proxy_add_x_forwarded_for;`. Minimal Caddyfile:

```
twigo.space {
  reverse_proxy 127.0.0.1:3000
}

www.twigo.space {
  redir https://twigo.space{uri} permanent
}
```

Caddy obtains the HTTPS certificates itself once the DNS records point to the server.

Keep the process running and restart it on failure with systemd (or pm2):

```ini
# /etc/systemd/system/cowork.service
[Unit]
Description=Twigo
After=network.target postgresql.service

[Service]
WorkingDirectory=/srv/cowork
EnvironmentFile=/srv/cowork/.env.production
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5
User=cowork

[Install]
WantedBy=multi-user.target
```

Run **one instance** unless you also move rate limiting (`src/lib/rate-limit.ts`, chat
limits in `src/realtime/server.ts`) to Redis and add the Socket.IO Redis adapter;
cross-instance events already work through `LISTEN/NOTIFY`.

## 6. First production start (clean database, one owner)

Production never starts from a development or demonstration database. It starts empty:

1. Create the production database as UTF-8 (section 3) and set `DATABASE_URL`.
2. `npm run db:deploy` (creates all tables; no data).
3. Create the one legitimate owner. The password is typed at a prompt and never shown:

   ```bash
   npm run admin:create -- --email founder@your-domain --name "Founder"
   ```

4. `npm start`. The start is refused, with the reason, if any setting from section 4 is
   missing, if no owner exists, or if an administrator with a test address exists.
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

* The server writes a logical backup of every table daily to `BACKUP_DIR` (gzip,
  AES-256-GCM if `BACKUP_ENCRYPTION_KEY` is set) and keeps the newest `BACKUP_KEEP`.
  Manual: `npm run db:backup` or **Admin → Backups → Back up now**.
* **Copy backups off the server** daily (e.g. `rclone` to object storage). A backup on
  the same disk does not survive disk loss.
* If your host offers managed database backups / point-in-time recovery, enable them too;
  `pg_dump --format=custom` is also fine as an additional copy.
* **Restore test** (never overwrites the live database):

  ```bash
  npm run db:restore -- backups/<file> --into cowork_restore_check
  ```

  It creates the new database, runs migrations, loads every table and verifies row
  counts and checksums table by table. Verified on the development machine on
  2026-11-21 (see `docs/PHASE-1-REPORT.md`). Repeat at least quarterly.
* Uploaded files in `STORAGE_DIR` are **not** in the database backup: back up that
  directory too (same off-site copy job).

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
