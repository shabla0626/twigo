# Twigo: An Online Collaborative Community

*Together We Innovate, Grow & Opportunity* · intended address: `https://twigo.space`

Twigo is an independent, remote-first online collaborative community where people come together to
propose ideas, develop business opportunities, form voluntary project groups, and pursue income through
meaningful contributions and cooperation. Twigo charges no fees, takes no commission or share of project
revenue, and does not collect, hold or distribute project money: each project group decides and documents
its own arrangements.

> The name is set by `ORG_NAME` (all branding lives in `src/config/brand.ts`). Internal identifiers such as
> the `cowork` database name and the repository folder were deliberately not renamed. The legal operator,
> jurisdiction and contact details are **not yet confirmed**; see
> [docs/TWIGO-OPEN-DECISIONS.md](docs/TWIGO-OPEN-DECISIONS.md) and
> [docs/TWIGO-LEGAL-REVIEW-CHECKLIST.md](docs/TWIGO-LEGAL-REVIEW-CHECKLIST.md).

Twigo transformation report: **[docs/TWIGO-IMPLEMENTATION-REPORT.md](docs/TWIGO-IMPLEMENTATION-REPORT.md)**.

Phase 1 status, test evidence and open items: **[docs/PHASE-1-REPORT.md](docs/PHASE-1-REPORT.md)**.
Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Deployment and costs:
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
One click from Windows: `.\deploy-twigo.ps1` ([docs/ONE-CLICK-DEPLOYMENT.md](docs/ONE-CLICK-DEPLOYMENT.md)).

## What's included

| Area | Features |
| --- | --- |
| Public site | Home, About, How It Works (incl. the member-community model), Participation, Compensation, Founding Contributors, **Work With Us** (honest business inquiry form), FAQ, Contact, Apply, **Community rules**, **Legal centre** (`/legal`: versioned Terms, Privacy, Guidelines, IP, Participation & Compensation, Cookies, Group Participation, Community Support, Legal Notices), **Community Support** (`/support`), sitemap, robots, generated share image |
| Accounts | One identity model (OWNER / ADMIN / MEMBER), self-registration with email confirmation (administrators are invited by the owner), sign-in with lockout and rate limits, **two-step verification (TOTP + recovery codes)**, password reset and change, email change with verification, device/session list with revoke, re-confirmation for sensitive actions, suspension/deactivation |
| Community | Home feed, Business Ideas (submit, search, filter, sort, threaded comments, endorsements), **automatic project group at 2 supporters** (configurable), **group-led projects with versioned agreements every participant accepts**, group directory, My Groups, dedicated group pages (Overview, Discussions, Chat, Meetings, Research & Planning, Members, Files), join/leave/rejoin, coordinator succession, notifications with preferences, member profiles with visibility controls, reporting |
| Real-time | Socket.IO group chat: persisted history, replies, edit/delete, unread counts, presence, typing indicator, attachments, reconnection with idempotent resend; live notification badge |
| Meetings | Google Meet links per group (founder decision), voice or video, member-only join, attendance metadata; nothing recorded |
| Admin | Overview, applications (status, notes, **email with preview**, export for the owner), members, participants, reports & moderation, ideas, project groups (coordinator, archive/suspend), project agreements (terms owner-only), earlier project records, **legal documents, notices and acceptance records**, community support records, privacy requests, inquiries, email templates + delivery log, content, privacy & retention, backups, administrators, settings, audit log |
| Operations | Custom server (`server.ts`), daily retention + backup jobs, verified backup/restore tooling, health check, structured logging, security headers |

## Tech stack

Next.js 16 (App Router, React 19, TypeScript strict, webpack) · Tailwind CSS 4 ·
PostgreSQL + Prisma 6 (Rust-free client with `@prisma/adapter-pg`) · Socket.IO 4 ·
Zod 4 · React Hook Form · scrypt password hashing (Node built-in; bcryptjs only reads older hashes) · otpauth (TOTP) · qrcode · Nodemailer (SMTP) ·
sharp · Vitest · Playwright (+ axe-core).

## Project structure

```
server.ts                    One process: Next.js + Socket.IO + daily jobs
prisma/                      Schema and SQL migrations
scripts/                     dev-db, migrate, create-admin, backup/restore, dev-mail, retention, photos
src/config/                  brand.ts (branding), org-settings.ts (owner settings)
src/app/(site)/              Public pages
src/app/(auth)/              Sign-in, 2FA, activation, password reset, email verification
src/app/account/             Account settings (security, notifications, data)
src/app/community/           Member portal (ideas, groups, notifications, profiles)
src/app/admin/               Admin dashboard and actions
src/app/api/                 files (upload/download), health
src/lib/                     auth, crypto, db, email, validation, security, csv, files
src/server/                  Business logic (accounts, community/*, privacy, settings, admin/*)
src/realtime/                Socket.IO server and chat service
src/ops/                     backup, retention, scheduler
tests/                       Vitest unit + integration; tests/e2e Playwright scenario
docs/                        Architecture, deployment, legal drafts, Phase 1 report
```

## Local development

Requirements: Node.js 20.9+ (tested on Node 24). PostgreSQL is optional locally.

```powershell
npm install
```

```powershell
Copy-Item .env.example .env
```

Set `AUTH_SECRET` and `ENCRYPTION_KEY` in `.env` to two different random values:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Start the local database (separate terminal; keep it running):

```powershell
npm run db:up
```

Email in development: with `SMTP_HOST=127.0.0.1`, `SMTP_PORT=2525` and
`EMAIL_FROM=no-reply@cowork.test`, `npm run dev` starts a local test mail server automatically.
Read captured emails (with clickable activation and reset links) at **http://127.0.0.1:8025**.
They are **not** delivered to real inboxes. To run the test mail server on its own:

```powershell
npm run mail:dev
```

Real delivery (Resend, free plan) and all email statuses: see [docs/EMAIL.md](docs/EMAIL.md).

**How people join:** Join → create account → confirm email → short application → status page →
community after an administrator approves. One account per person; approval upgrades that same
account. Details, state model and manual test steps: [docs/ONBOARDING.md](docs/ONBOARDING.md).

Apply migrations and create your owner account:

```powershell
npm run db:deploy
```

```powershell
npm run admin:create -- --email you@example.com --name "Your Name"
```

Run the app at http://127.0.0.1:3000 (sign in at /login; admins set up 2FA first):

```powershell
npm run dev
```

### Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server (custom server + webpack) |
| `npm run build` / `npm start` | Production build / production server |
| `npm test` | Unit + integration tests (needs `npm run db:up`; uses `cowork_test`) |
| `npm run test:e2e` | Browser end-to-end scenario in Microsoft Edge (uses `cowork_e2e`, port 3210) |
| `npm run typecheck` / `npm run lint` | TypeScript / ESLint |
| `npm run db:up` | Embedded PostgreSQL 17 on port 5433 (dev only) |
| `npm run db:deploy` | Apply pending migrations |
| `npm run db:migration -- <name>` | Generate a migration after editing `schema.prisma` (review it before applying) |
| `npm run db:backup [-- --label x]` | Back up the database to `backups/` |
| `npm run db:restore -- <file> --into <new_db>` | Verified restore into a **new** database (never the live one) |
| `npm run admin:create -- --email … --name …` | Create an owner/admin or reset a password (revokes sessions) |
| `npm run demo:seed` | Rebuild the separate local **demo** database (`cowork_demo`) with fictional members; run it with the "demo" server on port 3100. Never touches real data. |
| `npx tsx scripts/demo-screenshots.ts` | Capture desktop and phone screenshots of the demo site into `docs/ux-review/screenshots` |
| `npm run mail:dev` | Local test mail server: SMTP 127.0.0.1:2525, inbox http://127.0.0.1:8025 (started automatically by `npm run dev`) |
| `npm run purge:retention [-- --dry]` | Run the retention job now |
| `npm run photos:status` | Which of the 28 photo slots have files |

### Notes on this Windows environment
Prisma's native engines and Turbopack crash on the development machine, so the project
uses the Rust-free Prisma client, its own migration runner (`scripts/migrate.ts`,
Prisma-compatible) and webpack. IPv6 loopback connections are blocked on that machine,
so the dev server binds to 127.0.0.1. Stop the database before `npm ci` and the dev
server before `npm run build` (Windows file locks).

## Environments (keep them apart)

| Environment | Database | What it is for |
| --- | --- | --- |
| Development | `cowork` on this computer | The working copy. It may contain test people, test projects and a development owner account. **It is never taken to production.** |
| Demonstration | `cowork_demo` | Fictional people for showing the site (`npm run demo:seed`) |
| Automated tests | `cowork_test`, `cowork_e2e` | Emptied and refilled by the tests |
| Production | created empty at launch | One legitimate owner and default settings, then real people only |

Production is started from an empty database (`docs/DEPLOYMENT.md`, section 6). The server
refuses a production start when an owner or administrator has a test address, so a
development database cannot become the live one by mistake. Version control, safety
copies and rollback are described in `docs/DEPLOYMENT.md`, section 11.

## Testing

* `npm test`: the Vitest suite (unit + PostgreSQL integration; the current count is in the latest stage report under `docs/`), including permissions,
  TOTP, sessions, tokens, simultaneous endorsements, succession, chat isolation, a real
  Socket.IO client, uploads, invitations through a local SMTP server, email failures,
  retention, and backup → restore.
* `npm run test:e2e`: the founder's Phase 1 scenario in independent browser sessions,
  plus accessibility scans (axe, WCAG 2 A/AA) and mobile-layout checks.

Results of the last runs are recorded in [docs/PHASE-1-REPORT.md](docs/PHASE-1-REPORT.md).

## Photographs

The public pages use photographs supplied by the site owner (28 slots, all present):
`src/content/photos.ts`, [docs/PHOTO-SHOT-LIST.md](docs/PHOTO-SHOT-LIST.md),
[docs/IMAGE-CREDITS.md](docs/IMAGE-CREDITS.md). They are illustrative and never presented
as members or staff.

## Known limitations

* One server instance (in-memory rate limits and presence); see DEPLOYMENT.md for scaling.
* Voice/video run in Google Meet (founder decision); a Meet link works for anyone who has
  it, so groups should use a fresh link per meeting.
* Email delivery to real inboxes has not been verified (no provider configured yet).
* Uploaded files are stored on local disk; production needs a persistent disk or S3.
* CSP allows `'unsafe-inline'` scripts (Next.js without nonces).
* Legal pages and documents are drafts pending attorney review.
