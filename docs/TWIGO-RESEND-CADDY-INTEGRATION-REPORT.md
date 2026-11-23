# Twigo: Resend SMTP, domain twigo.space, port 1010 and central Caddy registration

Report of 23 November 2026, branch `feature/twigo-platform-transformation`. Covers the founder's
instructions "Resend SMTP integration and centralized Caddy registration" and the correction "Next.js
must run directly on port 1010". Every result below comes from a run on this computer unless it says
otherwise. **Nothing was deployed, no DNS or Cloudflare setting was changed, and no command was run on
the VPS** (this computer's SSH key is still refused there; see section C).

---

## A. Resend SMTP integration

### Previous email architecture

One email system (`src/lib/email/`), unchanged in structure:

- `index.ts`: Nodemailer SMTP transport, `deliver()` records every attempt in `EmailDelivery`
  (recipient, template, status, provider response; texts with one-time links are never stored).
- `status.ts`: turns SMTP errors into categories (not configured, server unreachable, login refused,
  sender refused, recipient refused, error) and labels that never claim inbox delivery.
- `webhook.ts` and `/api/email/webhook`: Resend delivery events, accepted only with a valid Svix
  signature not older than 5 minutes; the only way a row becomes "Delivered" or "Delivery failed".
- Admin → Email: settings (secrets never shown), connection check, test email, delivery log, retry.
- Development: a local mail catcher (`scripts/dev-mail.ts`, SMTP 2525, inbox at
  `http://127.0.0.1:8025`), started by `npm run dev` only when `SMTP_HOST` was a local address.

### What changed

| Change | Why |
| --- | --- |
| An empty `SMTP_PASSWORD` (with `SMTP_USER` set) is now **"Not sent: email not set up"** with the message "The Resend API key is missing: SMTP_PASSWORD is empty in the server settings (.env). No connection was attempted and nothing was sent." It was previously labelled "login refused". | The instructions: no connection, clear configuration error, recorded, no crash, never reported as sent |
| **Development always uses the local test inbox**, whatever `SMTP_HOST` says, unless `DEV_MAIL_CATCHER="false"`; the provider login is never sent to it. Production and automated tests never use it. One rule (`devMailCatcherPort()` in `status.ts`) is used by both the email code and `server.ts`; `server.ts` now states `NODE_ENV=development` explicitly when started without `--production`. | With the Resend settings now in the developer's `.env`, the old rule would have sent real email from the development computer once the key is entered |
| Ports other than 465 now **require** STARTTLS (`requireTLS`), except for the local test inbox | Encrypted transport is guaranteed |
| Production start logs `email.credentials_missing` once when the key is empty (the site still starts) | Visible at once; no crash |
| `webhookSecretProblem()`: the webhook refuses (503, logged) a signing secret that is an API key (`re_…`) or equals `SMTP_PASSWORD` | The SMTP key must never double as the webhook secret |
| Admin → Email shows: sending through now, configured provider, SMTP host and port, encryption, login user, **credentials configured / MISSING** (never the value), sender, webhook on/off/misconfigured | Instructions 1.8 |
| Tests are isolated from the developer's `.env` email settings (`tests/setup-env.ts`, `playwright.config.ts`, the walkthrough and performance runners set them explicitly) | The database client and Next.js fill every unset variable from `.env`; with `SMTP_USER=resend` there, 4 unit tests and 1 browser test failed until this was fixed (see D) |

Files changed: `src/lib/email/index.ts`, `src/lib/email/status.ts`, `src/lib/email/webhook.ts`,
`src/app/api/email/webhook/route.ts`, `src/app/admin/(panel)/email/page.tsx`, `server.ts`,
`.env.example`, `docs/EMAIL.md`, `tests/setup-env.ts`, `playwright.config.ts`,
`scripts/audit/walkthrough-run.sh`, `scripts/perf-measure.ts`; new `tests/resend-smtp.test.ts`.

### Environment variables

| Variable | Value | Where |
| --- | --- | --- |
| `SMTP_HOST` | `smtp.resend.com` | `.env`, `.env.example`, `.env.production.example` |
| `SMTP_PORT` | `465` | same |
| `SMTP_SECURE` | `true` | same |
| `SMTP_USER` | `resend` | same |
| `SMTP_PASSWORD` | **empty** (the line is exactly `SMTP_PASSWORD=`) | same; checked in all three files |
| `EMAIL_FROM` | `"Twigo <noreply@twigo.space>"` | same |
| `RESEND_WEBHOOK_SECRET` | empty; optional, a separate `whsec_…` secret from Resend → Webhooks for `https://twigo.space/api/email/webhook` | `.env.example`, `.env.production.example` |
| `DEV_MAIL_CATCHER`, `DEV_MAIL_PORT`, `DEV_MAIL_UI_PORT` | development only; defaults `true`, 2525, 8025 | `.env.example` |

The local `.env` kept all its other settings (database, secrets, organization, jobs); only the six
email lines above were set. `.env` is not tracked by git (`.gitignore` line 7, confirmed with
`git check-ignore`); the only tracked env files are `.env.example` and the new
`.env.production.example`, neither with a secret. **No API key was generated, requested or entered.**
The key that appeared in the chat earlier was not stored anywhere (see D, security checks).

### Sender and links

All emails use `EMAIL_FROM` = `Twigo <noreply@twigo.space>`. Every link in every email is built from
`SITE_URL` (`siteUrl()`), so with `SITE_URL=https://twigo.space` all of them point there: account
verification, email-change confirmation, password reset, administrator invitation/activation, and
the links in application received / interview / accepted / declined / waitlisted, contact
notifications and community notifications. Templates and business logic were not changed. Verified by
test (below) for verification and password reset, including the sender header.

## B. Domain migration

- Previous references: `twigo.stream` appeared only in documentation and `.env.example` (no code); all
  were changed to `twigo.space` earlier today (commit `0586e3b`). Two history notes still say "changed
  from twigo.stream", on purpose. No migration file or database record mentions a domain.
- The application has **one** address setting, `SITE_URL`. From it come canonical URLs and Open Graph
  (`metadataBase`), sitemap and robots, every email link, the live-chat CORS origin and the file-upload
  origin check. There is no `NEXT_PUBLIC_SITE_URL` or `NEXTAUTH_URL` (the site has its own sign-in);
  cookies are host-only (no `Domain` attribute), `Secure` in production; HSTS is sent.
- Production value `SITE_URL=https://twigo.space` is in `.env.production.example`; the local `.env`
  keeps `http://127.0.0.1:3000` for development.
- DNS as seen from public resolvers (1.1.1.1) on 23 November: nameservers
  `paityn.ns.cloudflare.com` / `sullivan.ns.cloudflare.com`; `twigo.space` and `www.twigo.space`
  resolve to Cloudflare addresses (104.21.68.87, 172.67.192.125 and IPv6), i.e. **proxied through
  Cloudflare**. No DNS or Cloudflare setting was changed.

## C. Port 1010, Docker, and central Caddy registration

### Port 1010 (implemented and verified locally)

```
https://twigo.space -> Cloudflare -> central Caddy (VPS) -> 127.0.0.1:1010 (VPS)
                    -> container port 1010 -> Next.js inside server.ts (+ Socket.IO chat)
```

- `server.ts`: production listens on **1010** by default (`PORT` overrides; development stays 3000).
  Next.js runs inside `server.ts`, which also serves the group chat (Socket.IO) on the same port. The
  Next.js "standalone" `server.js` was **not** used: it would drop the chat server. `HOSTNAME` is not
  read (Docker sets it to the container name); `HOST=0.0.0.0`.
- `Dockerfile`: `PORT=1010`, `HOST=0.0.0.0`, `EXPOSE 1010`, runs `tsx server.ts --production`
  as the unprivileged `node` user. `.env.production` reaches the build only as a BuildKit secret
  (never stored in the image); `.dockerignore` excludes every `.env*` except the two examples.
- `docker-compose.yml`: `app` with `ports: "127.0.0.1:1010:1010"` and a health check on
  `http://127.0.0.1:1010/api/health`; `db` (PostgreSQL 16, no published port); volumes for files,
  backups and the database. **No port 3000 in any production file** (automated test).
- `.env.production.example`: complete production template (empty secrets, `PORT=1010`,
  `TRUSTED_PROXY_HOPS=2` for Cloudflare + Caddy).
- **Verified on this computer:** the production server started with no `PORT` set logged
  `server.ready … "url":"http://127.0.0.1:1010"`, and `/api/health` (200, database ok), the home page
  (200) and the chat endpoint `/socket.io/` (200) answered on port 1010.
- **Not verified:** the Docker image was not built or run, because Docker is not installed on this
  computer; nothing was run on the VPS.

### Central Caddy: not registered (no access)

| Item | Finding |
| --- | --- |
| Access | `ssh shabla@162.35.23.106` with this computer's key: **"Permission denied (publickey,password)"** on every attempt today. The server offers password login, which the assistant may not use. The key-install command was given to the founder; the server still refuses the key. |
| Central management system | **Not identified.** It cannot be inspected without access. Nothing was assumed. |
| Registration | **Not done.** No upstream, certificate or reload was changed. |
| What the public sees now | `https://twigo.space` and `https://www.twigo.space`: **Cloudflare error 525** (SSL handshake failed between Cloudflare and the server: nothing on the server presents a certificate for twigo.space yet). `http://` and direct requests to `162.35.23.106` timed out from this computer (possibly this computer's VPN; not conclusive). |
| Other sites on the server | Not touched (no access). |

### Registration specification (for the central Caddy system)

| Field | Value |
| --- | --- |
| Domain | `twigo.space` (primary, canonical) |
| Redirect | `www.twigo.space` → `https://twigo.space{uri}`, permanent (308/301) |
| HTTP | `http://twigo.space` → `https://twigo.space` (Caddy's automatic HTTPS redirect) |
| Upstream | **`127.0.0.1:1010`** if the central Caddy runs directly on the Ubuntu host. If it runs in Docker: the host's port 1010 as the server's other sites reach their hosts (for example `host.docker.internal:1010` with `host-gateway`), and Twigo published on the Docker bridge address instead of `127.0.0.1`. The app port stays 1010. |
| Protocol to upstream | plain HTTP over the loopback interface |
| WebSocket | Required for `/socket.io/` (group chat, presence, live notifications). Caddy's `reverse_proxy` passes `Upgrade`/`Connection` automatically; no path rewriting; no response buffering |
| Headers | `X-Forwarded-For`, `X-Forwarded-Proto`, `Host` passed (Caddy's defaults). App setting `TRUSTED_PROXY_HOPS=2` (Cloudflare + Caddy) |
| Uploads | Up to 10 MB per file (app limit); Cloudflare's free plan allows 100 MB per request |
| HTTPS / certificates | Managed by the central Caddy as for the server's other domains. **Cloudflare compatibility:** with the records proxied, a Let's Encrypt HTTP-01 challenge works only if Cloudflare passes `http://twigo.space/.well-known/acme-challenge/…` to the server (no forced HTTPS redirect for that path); TLS-ALPN-01 does not work behind the Cloudflare proxy. If the central system uses the Cloudflare DNS challenge or a Cloudflare Origin Certificate, either works. Cloudflare's SSL/TLS mode should then be **Full (strict)**. |
| DNS conditions | Already met for routing (proxied records exist). Nothing to change unless the certificate method above requires it. |
| Order | Deploy the app first (`docker compose … up -d app`, health check 200 on `127.0.0.1:1010`), then register, so the domain is never routed to a missing or temporary instance. |

## D. Test results

| Check | Command | Result |
| --- | --- | --- |
| TypeScript | `npx tsc --noEmit -p .` | **Passed** |
| ESLint | `npx eslint . --quiet` | **Passed** |
| Unit + integration | `npx vitest run` | **409 passed, 0 failed** (34 files; 396 before + 10 SMTP + 3 port/deployment) |
| SMTP configuration tests | `tests/resend-smtp.test.ts` | **10 passed**: settings parsing (key never exposed); missing key (no connection at all, recorded "not set up", retryable, nothing reported sent); wrong key (login refused, no message sent); unreachable Resend (host:port in the message); development inbox (used without the provider login even with a key in `.env`; never in production or tests); sender and links (verification and reset emails from `Twigo <noreply@twigo.space>` with every link on `https://twigo.space/`); retry once the key is set (sent once, second retry refused); statuses never claim inbox delivery; webhook secret cannot be an API key |
| Port and deployment files | `tests/deployment-config.test.ts` | **3 passed**: 1010 in Dockerfile/compose/template, `127.0.0.1:1010:1010`, no 3000 in production files, no Caddy in the project, secrets only as build secret, `SMTP_PASSWORD=` empty |
| Existing email workflows | `tests/email.test.ts`, `onboarding`, `community`, `corrective-stage3d` | Passed (part of the 409) |
| Browser tests | `npx playwright test` (fresh production build) | **23 passed, 0 failed** (now also checks Admin → Email for accessibility) |
| Port 1010 | production server started locally without `PORT` | **Listening on 1010**; health, home page and `/socket.io/` answered 200 |
| Docker image build/run | — | **Not run** (Docker not installed on this computer) |
| Domain connectivity | public DNS and HTTPS through Cloudflare | DNS resolves (proxied); HTTPS returns **Cloudflare 525** |
| HTTPS / TLS on twigo.space | — | **Not working yet** (no certificate on the server for twigo.space) |
| WebSocket via twigo.space | — | **Not testable** (site not deployed) |

Failures found and fixed during this work:

1. After setting `SMTP_USER=resend` in the local `.env`, 4 unit tests and 1 browser test failed: the
   test processes inherited that login with an empty key (correctly reported as "not set up"). Cause:
   Prisma and Next.js fill unset variables from `.env`. Fixed by fixing all email settings in the test
   set-ups; the product behaviour was right.
2. A comment containing "3000" in the production template failed the new no-3000 test; reworded.

Security checks:

- `.env` not tracked (only `.env.example` and `.env.production.example` are).
- No API key in source: the only key-shaped string is a fake one in a test
  (`re_should_never_be_used`, used to prove the key is not sent in development).
- The key pasted in the chat earlier: **not found** in any project file or log (full search of the
  project folder, excluding dependencies and build output). It does remain in this conversation's
  saved history, which is why rotating it is recommended (E.3).
- Admin → Email shows only whether credentials are configured, never the value (test 1).
- SMTP: TLS from the start on 465; STARTTLS required on other ports.
- CORS: the live chat accepts only its own origin (`SITE_URL`, or the same host); uploads check the
  `SITE_URL` origin.
- HTTPS: production requires an `https://` `SITE_URL`; HSTS sent; cookies `Secure` in production.
- Authentication: all sign-in, verification and reset tests pass; links use `twigo.space` (test 6–8).

## E. Founder actions required

1. **Let this computer log in to the VPS** (or do the server steps yourself): the server still rejects
   the key. In a normal PowerShell window run the one-line command from earlier and type the `shabla`
   password; it must print `KEY_OK`.
2. On the VPS: install Docker Engine with the Compose plugin if it is not there; copy the project;
   create `.env.production` from `.env.production.example` and fill in the secrets (`openssl rand -hex 32`),
   `POSTGRES_PASSWORD`, `ORG_LEGAL_NAME`, `ORG_JURISDICTION`, `ORG_CONTACT_EMAIL`.
3. **Enter the Resend API key** after `SMTP_PASSWORD=` (in `.env.production` on the server; in `.env`
   on this computer only if you want to test real sending, with `DEV_MAIL_CATCHER="false"`).
   Because a key was pasted into the chat, create a new key in Resend and delete the old one.
4. Build and start (docs/DEPLOYMENT.md, sections 5–6), create the owner account, check
   `curl http://127.0.0.1:1010/api/health` on the VPS.
5. **Register `twigo.space` in the central Caddy system** with the specification in section C (or give
   this computer access and ask for it to be done), choosing a certificate method that works behind the
   Cloudflare proxy; set Cloudflare SSL/TLS to Full (strict).
6. Restart the app after any settings change (`docker compose --env-file .env.production up -d app`).
7. Send one real test email: Admin → Email → Check connection, then Send a test email to me.
8. Optional: add the Resend webhook (`https://twigo.space/api/email/webhook`) and put its `whsec_`
   secret into `RESEND_WEBHOOK_SECRET`.

## F. Final status

| Task | Status |
| --- | --- |
| Resend SMTP configuration in code, `.env`, `.env.example`, `.env.production.example` | **Implemented but awaiting credentials** (key empty by design) |
| Missing-key handling, statuses, retry, webhook guard, Admin → Email | **Completed and verified** (automated tests) |
| Development keeps the local test inbox; production never uses it | **Completed and verified** (automated tests) |
| Real email delivery through Resend | **Pending external action** (API key, deployed site) |
| Domain `twigo.space` in configuration, links, documentation | **Completed and verified** (tests and search) |
| DNS for twigo.space | **Exists** (Cloudflare, proxied); certificate method to be confirmed with the central Caddy |
| Next.js on port 1010, Docker Compose, production template | **Completed; verified locally** (server on 1010); Docker image **not built** here |
| Central Caddy registration of twigo.space | **Not completed: pending external action** (no access to the VPS; specification in section C) |
| HTTPS on twigo.space, WebSocket through the domain | **Not completed** (site not deployed; currently Cloudflare 525) |
