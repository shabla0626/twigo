# Email: local testing and real delivery

The site sends email through **SMTP** (Nodemailer). The same code works with the local
test mail server (development) and with **Resend** (real delivery). You switch between them
only in the server settings (`.env`). The company name and domain are **not** written into
the code; they come from settings.

| Setting | Meaning |
|---|---|
| `SMTP_HOST`, `SMTP_PORT` | The mail server to connect to |
| `SMTP_SECURE` | `"true"` = encrypted from the start (port 465). `"false"` = ports 587/2587/25. Empty = automatic |
| `SMTP_USER`, `SMTP_PASSWORD` | Login. For Resend: `resend` and your API key |
| `EMAIL_FROM` | Sender address. Must be on a domain verified with the provider |
| `EMAIL_FROM_NAME` | Sender name shown to recipients (defaults to the organization name) |
| `RESEND_WEBHOOK_SECRET` | Optional. Lets Resend confirm "Delivered" or "Bounced" |
| `DEV_MAIL_CATCHER` | Development only. `"false"` lets `npm run dev` use the configured provider instead of the local test inbox |
| `DEV_MAIL_PORT`, `DEV_MAIL_UI_PORT` | Development only. Ports of the local test inbox (default 2525 and 8025) |

**Twigo's settings** (Resend, domain `twigo.space` verified in Resend):

```
SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=resend
SMTP_PASSWORD=
EMAIL_FROM="Twigo <noreply@twigo.space>"
```

`SMTP_PASSWORD` is the Resend API key; the founder enters it after `SMTP_PASSWORD=` in `.env`
(it is deliberately empty in the repository). While it is empty, **no connection is attempted** and
every attempt is recorded as "Not sent: email not set up" with the reason ("SMTP_PASSWORD is empty"),
in Admin → Email; nothing is reported as sent, and the production server logs
`email.credentials_missing` once at start. After entering the key, restart the site.

**Development never sends real email.** With `npm run dev`, every email goes to the local test inbox
(`http://127.0.0.1:8025`), whatever `SMTP_HOST` says and even if the API key is in `.env`; the key is not
used. Only `DEV_MAIL_CATCHER="false"` changes that. The production site (`npm start`) never uses the
local test inbox.

Secrets (`SMTP_PASSWORD`, `RESEND_WEBHOOK_SECRET`) stay on the server only. They are never
shown in the admin panel, never sent to browsers, and `.env` must never be committed.

---

## 1. Local testing (free, nothing leaves your computer)

**Settings:** none needed. In development the local test inbox is always used (see above).

**Start it.** `npm run dev` starts the local test mail server automatically (unless
`DEV_MAIL_CATCHER="false"`). To run it on its own (for example, next to an already-running site):

```powershell
npm run mail:dev
```

**Read the emails:** open **http://127.0.0.1:8025** in your browser. The page lists every
captured email (newest first) and refreshes every 5 seconds. Click a subject to read it. Links
inside are clickable: activation, email confirmation and password reset links open the site
directly. Copies are also saved in the `.dev-mail/` folder.

> **Important:** emails captured locally are **not delivered** to anyone's real inbox,
> even if the address is real. This is only for testing.

**Try each email:**

| Email | How to trigger it |
|---|---|
| Welcome + confirm your email | Create an account at `/join` |
| Application received | Finish and submit the application |
| Interview invitation | Admin → Applications → open one → *Other decisions* → "Interview Requested" + tick "Also email the applicant" |
| Application acceptance | Same page → **Approve and Notify** |
| Application rejection | Same page → "Declined" + tick the email box |
| Waiting list | Same page → "Waitlisted" + tick the email box |
| Email change | Account Settings → change email address |
| Password reset | `/forgot-password` |

---

## 2. Real delivery with Resend (free plan)

At the time of writing, Resend's free plan includes about 3,000 emails per month (100 per day)
and one domain. Check https://resend.com/pricing for the current limits. No payment details
are needed for the free plan.

### Step 1: Create a free account
1. Go to https://resend.com and choose **Sign up**. Use an email address you control.
2. Confirm your email address from the message Resend sends you.

### Step 2: Verify your domain (needed before you can email other people)
Until a domain is verified, Resend only lets you send test emails **to your own account
address**. Other recipients are refused, and the log shows "Not sent: sender address refused".

1. You need a domain that you own. The company domain is not chosen yet; when it is, continue here.
2. In Resend, open **Domains → Add domain**. Resend recommends a subdomain for sending, for
   example `mail.<your-domain>`.
3. Resend shows several **DNS records** (TXT and MX: SPF and DKIM; DMARC is recommended). Add
   them exactly as shown at the company that manages your domain's DNS.
4. Back in Resend, click **Verify**. This can take from a few minutes to a few hours.

### Step 3: Create an API key
1. In Resend, open **API Keys → Create API key**.
2. Name it (for example "website"), choose **Sending access**, and limit it to your domain if offered.
3. Copy the key (it starts with `re_`). Resend shows it **only once**. Keep it secret.

### Step 4: Choose the sender address
Use any address on the verified domain, for example `no-reply@mail.<your-domain>`, or a monitored
address if you want replies. It does not need its own mailbox for sending.

### Step 5: Connect it to the site
On the **server** (production `.env` or your host's secret settings, never in Git):

```
SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=resend
SMTP_PASSWORD=          <- paste the Resend API key after the = sign
EMAIL_FROM="Twigo <noreply@twigo.space>"
```

Restart the site, then:
1. **Admin → Email → Check connection.** This logs in to Resend without sending anything.
2. **Admin → Email → Send a test email to me**, then check that inbox (and its spam folder).
3. Send yourself a real password reset and an invitation to a test address before inviting members.

If your network blocks port 465, use `SMTP_PORT="587"` with `SMTP_SECURE="false"`
(Resend also accepts 2465/2587).

### Step 6 (optional): Delivery confirmation
Without this, a successful send shows **"Accepted by provider (delivery not confirmed)"**.
To see **"Delivered"** or **"Delivery failed"**:
1. The site must be online at a public `https://` address. Resend cannot reach `localhost`.
2. In Resend open **Webhooks → Add endpoint**, URL `https://<your-site>/api/email/webhook`,
   and select at least `email.delivered`, `email.bounced` and `email.failed`.
   For Twigo: `https://twigo.space/api/email/webhook`.
3. Copy the **signing secret** (starts with `whsec_`) into `RESEND_WEBHOOK_SECRET`, then restart.
   It is a different value from the API key; the site refuses an API key (`re_…`) here.

Only correctly signed requests can change a status. A request without a valid signature is refused.

An event must also identify the exact message: every email carries a hidden `X-CoWork-Delivery-Id`
header, and the provider's own message id is used when known. An email is never matched by recipient
and subject alone. If an event cannot be matched with certainty, nothing is changed and the status
stays "Accepted by provider".

---

## 3. What the statuses mean (Admin → Email → Delivery log)

| Status | Meaning | What to do |
|---|---|---|
| **Captured locally (test only, not delivered)** | Sent to the local test mail server on this computer | Read it at http://127.0.0.1:8025. It never reaches a real inbox |
| Not sent: email not set up | `SMTP_HOST` or `EMAIL_FROM` is empty | Fill in the settings |
| Not sent: email server unreachable | Could not connect (server stopped, wrong host/port, wrong secure setting, no internet) | Locally: `npm run mail:dev`. Resend: check host, port and `SMTP_SECURE` |
| Not sent: email login refused | Wrong `SMTP_USER` / API key | Resend: user `resend`, a valid `re_…` key |
| Not sent: sender address refused | `EMAIL_FROM` is invalid or its domain is not verified | Verify the domain; use an address on it |
| Not sent: recipient refused | The provider refused that recipient | Check the address |
| Not sent: error | Any other error; the details column shows the provider's message | Read the details |
| **Accepted by provider (delivery not confirmed)** | The provider took the message | Nothing. This is **not** proof that it reached the inbox |
| **Delivered (confirmed by provider)** | Resend reported delivery to the recipient's mail server (needs the webhook) | Nothing |
| Delivery failed (reported by provider) | Resend reported a bounce or failure after accepting | Check the address, then retry |

The site never shows an email as delivered just because it tried to send it.

## 4. Retrying a failed email

In the delivery log, emails that were not sent (or that bounced) have a **Retry…** button.
Confirm, then press **Retry now**.

- Every attempt is kept. A retry is added as a **new row** linked to the original, and the original row is not changed.
- Emails that were accepted or delivered **cannot** be retried, so nobody receives duplicates.
- **Ordinary emails** (application updates, notifications, test emails) are re-sent with the same text.
- **Emails with a private link** (account activation, password reset, email confirmation) are
  never stored, so they cannot be re-sent as they were:
  - **Email confirmation for a new account, and password reset:** the retry issues a **new link**, and the old one stops working.
  - **Email confirmation:** the member has to request the change again.
  - **Administrator invitations:** invite the person again from Admin → Administrators.

## 5. Diagnosing problems
- In development, the server log prints `devmail.ready` when the local test mail server starts.
- **Admin → Email → Check connection** tests login without sending.
- Each failed attempt records the provider's own error text in the log's *Details* column.
