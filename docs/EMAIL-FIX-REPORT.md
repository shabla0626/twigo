# Email delivery fix: report (2026-11-21)

## Root cause
`connect ECONNREFUSED 127.0.0.1:2525` means nothing was listening on port 2525.

- The development `.env` points email at a **local test mail server**: `SMTP_HOST="127.0.0.1"`, `SMTP_PORT="2525"`.
- That server was a separate program that had to be started by hand with `npm run mail:dev`.
- `npm run dev` did not start it, and it was not running (it was stopped at the end of the previous session). Every email attempt was therefore refused.
- The admin panel showed Nodemailer's raw message, which did not say what to do.

The code and settings were otherwise correct. The SMTP connection itself worked as soon as a server was listening.

## What was fixed
1. **`npm run dev` now starts the local test mail server automatically** whenever `SMTP_HOST` is `127.0.0.1`/`localhost`. `npm run mail:dev` still works on its own.
2. **A web inbox at http://127.0.0.1:8025** shows every captured email, with clickable activation and reset links. It runs on this computer only, with no download or account.
3. **Resend support.** The existing SMTP setup is kept, plus:
   - automatic TLS for port 465;
   - connection timeouts (10 s), so a dead server fails quickly instead of hanging;
   - signed webhook support for confirmed delivery.

   No company name or domain is hard-coded.
4. **Clear statuses** in the delivery log:
   - not set up;
   - server unreachable (with "start `npm run mail:dev`" when local);
   - login refused;
   - sender refused (invalid or unverified domain);
   - recipient refused;
   - other error;
   - **accepted by provider (delivery not confirmed)**;
   - **delivered (confirmed by provider)**;
   - delivery failed (bounced).

   "Delivered" can only be set by a correctly signed provider webhook, never by sending.
5. **Safe manual retry** (Admin → Email → Retry…):
   - **It needs a confirmation tick.** Every retry is added as a new log row; the original row is never changed.
   - **No duplicates:** emails that were accepted or delivered can't be retried.
   - **Emails with private links:** activation and reset links are never stored. Retrying issues a new link, and the old one stops working.
   - **Audit:** every retry is recorded in the audit log.
6. **Admin → Email** now shows the current settings (the API key is never displayed), plus **Check connection** (logs in, sends nothing) and **Send a test email to me**.
7. **Found while testing:** all local databases use the Windows `WIN1252` character set.
   - **The crash:** an email containing a character such as "→" crashed the page while writing its log entry, after the email had already been sent.
   - **The fix:** the log now always saves (unsupported characters become "?").
   - **Still to do:** the database encoding itself is not changed (see "Remaining requirements").

Existing delivery logs were preserved. The database was backed up first: `backups/cowork-20261122-024706.cwbak.gz`. The schema change is purely additive (new status values and four new columns), and nothing was reset.

## How to start the local email testing service
- `npm run dev` starts it automatically, or run `npm run mail:dev` on its own.
- **Read test emails at http://127.0.0.1:8025.** Copies are also saved in `.dev-mail/`.
- Captured emails are **not delivered to any real inbox**.

## How to configure free production delivery
See [EMAIL.md](EMAIL.md), section 2. In short:
1. Create a free Resend account.
2. Verify your domain (DNS records).
3. Create an API key with sending access.
4. Set these on the server:

```
SMTP_HOST="smtp.resend.com"
SMTP_PORT="465"
SMTP_SECURE="true"
SMTP_USER="resend"
SMTP_PASSWORD="<API key>"
EMAIL_FROM="<address on the verified domain>"
```

5. Restart, then use **Check connection** and **Send a test email to me**.
6. Optional: add the webhook for "Delivered" confirmations.

## What was tested
**Automated tests:** 113 unit and integration tests and 15 browser tests pass, with type check and lint clean.

**All 8 workflows**, sent through a real local SMTP server, with each link opened and used:
1. Application confirmation.
2. Interview invitation.
3. Application acceptance.
4. Application rejection.
5. Waiting list.
6. Account activation: the link activated the account.
7. Email verification: the link changed the address.
8. Password reset: the link set a new password.

**Every failure type,** against real SMTP servers configured to refuse:
- not configured;
- invalid sender;
- server unreachable;
- login refused;
- unverified sender domain;
- success with correct credentials.

**Other checks:**
- Retry: same text for ordinary emails, a new link for password reset, no duplicates, the original row unchanged.
- Webhook: forged signature refused; a signed "delivered" event confirms delivery; a bounce overrides it.
- The web inbox and the charset fallback.

**In the browser** (demo site):
- Forgot password → email shown in the local inbox → link → new password saved.
- Admin → Email → Check connection succeeded.
- With the mail server stopped, "Send a test email to me" showed the clear "local test mail server is not running…" message.
- After restarting the mail server, **Retry now** succeeded and the log showed both rows.

**Not tested:**
- **Real external delivery through Resend.** That needs your Resend account, an API key and a verified domain, which don't exist yet.
- **Matching Resend's webhook events to sent emails.** It uses Resend's email id when available, otherwise the recipient and subject. It was tested with simulated signed events; it should be checked once with a real Resend account.

## Remaining configuration requirements
- **For real delivery:** choose and register the company domain, create the Resend account, verify the domain and set the server settings above. This costs nothing on the free plan; the domain itself has a cost when you buy it.
- **Restart running servers:** any `npm run dev` window started before this fix must be restarted once (Ctrl+C, then `npm run dev`), so it loads the updated database code.
- **Recommended follow-up (separate from email):** the local PostgreSQL databases use `WIN1252`.
  - **The problem:** text with characters outside Western European letters (for example names in other alphabets, emoji or "→") cannot be saved anywhere in the app.
  - **The fix:** recreate the local database in UTF-8 and restore your data from a backup.
  - **Production:** production databases (normally UTF-8 on Linux hosts) should be created with `UTF8` encoding.

---
**Update 2026-11-22:** the character-set issue is resolved. All local databases are now UTF-8 and the
"?" replacement was removed (see [ONBOARDING.md](ONBOARDING.md), section 5). Sends to the local test
server are now logged as "Captured locally (test only, not delivered)", and delivery reports are
matched only by exact message identifiers.
