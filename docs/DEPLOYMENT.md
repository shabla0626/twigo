# Deployment guide

Nothing has been deployed or purchased. The founder chose **one always-on server**.
Choose a host, get approval for its cost, then follow these steps.

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

Set them in the host's secret manager (never commit them). The server **refuses to
start** in production if `ENCRYPTION_KEY` is missing/short, equals `AUTH_SECRET`, or if
`AUTH_SECRET` still has the development value.

| Variable | Notes |
| --- | --- |
| `DATABASE_URL` | As above |
| `SITE_URL` | Public HTTPS URL. Also used for the WebSocket origin check and CSP |
| `PORT`, `HOST` | Default 3000 / 0.0.0.0 |
| `AUTH_SECRET` | ≥ 32 random chars (form tokens, IP hashing) |
| `ENCRYPTION_KEY` | ≥ 32 random chars, different from `AUTH_SECRET` (encrypts 2FA secrets). **Losing it disables everyone's 2FA**: keep it in your password manager |
| `SESSION_TTL_HOURS` / `MEMBER_SESSION_TTL_HOURS` | Admin 8 h, member 14 days by default |
| `ADMIN_REQUIRE_2FA` | `true` (keep it) |
| `ORG_NAME`, `ORG_TAGLINE`, `ORG_LEGAL_NAME`, `ORG_JURISDICTION`, `ORG_CONTACT_EMAIL`, `EMAIL_FROM_NAME` | Branding (one place: `src/config/brand.ts`) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM` | Required for invitations and password resets |
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
`X-Forwarded-For`. Minimal Caddyfile:

```
your-domain.example {
  reverse_proxy 127.0.0.1:3000
}
```

Keep the process running and restart it on failure with systemd (or pm2):

```ini
# /etc/systemd/system/cowork.service
[Unit]
Description=CoWork
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

## 6. Initialize the owner

```bash
npm run admin:create -- --email founder@your-domain --name "Founder"
```

Sign in at `/login`; you are sent to `/account/security` to set up two-step
verification (authenticator app) and save your recovery codes. Further administrators
are invited from `/admin/admins`.

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
4. Send yourself a password reset and an invitation to a test address before public
   recruitment.

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
- [ ] Email provider verified with a real inbox (invitation + password reset)
- [ ] Off-site backup copy job running; restore test done on the server
- [ ] Retention periods confirmed at /admin/settings
- [ ] Full flow tested on staging: application → acceptance → invitation → activation →
      idea → endorsements → group → chat → meeting link
