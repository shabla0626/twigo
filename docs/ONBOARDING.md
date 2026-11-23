# Joining Twigo (formerly CoWork): accounts, applications and membership

Report on the redesign of registration, application, sign-in, email verification and membership
approval (2026-11-22). **One person, one account, one membership lifecycle.**

Legend: **Verified** = run and checked (automated test and/or in the browser). **Not verified** = said so explicitly.

## 1. Problems found in the original implementation

1. **No way to create an account.** Visitors filled in a long anonymous form at `/apply`. An account existed only after an administrator accepted the application *and* separately sent an invitation, which the person then had to activate with a new password. "Sign in" led nowhere for a new visitor.
2. **Applicants could not see their status.** With no account, email was the only way to learn anything. When email failed (as it did), applicants were stuck.
3. **Acceptance did not grant access.** "Accepted" only created an internal participant record. Access needed a second manual step (invite → activation link → password → profile).
4. **Community access was decided by "has a member profile".** There was no explicit membership state, so access could not be paused or removed without suspending the whole account.
5. **Long form.** About 25 fields on one page, many required, with no way to save a draft.
6. **Email.** A send to the local test server looked like a real send. Delivery reports could be matched by recipient and subject alone. The local databases used the Windows-1252 character set, so non-Western characters could not be stored.

## 2. Previous and new journey

**Before:** Apply (anonymous form) → wait for email → admin accepts → admin sends invitation → activation link → choose password → set up profile → community.

**Now:** Join CoWork → Create Account → Confirm Email → Application (3 short steps + review) → Status page → **Enter the Community** after approval, with the same email and password.

| Step | Page | What happens |
|---|---|---|
| Join | `/join` | Name, email, password, confirm password, Terms and Privacy agreement. Free; nothing professional or financial is asked. |
| Confirm email | `/verify-email` | "Check your email", resend (once a minute), correct a mistyped address (after signing in). The emailed link opens a page with one button. |
| Apply | `/apply` | About you → Skills and time → Why you want to join → Review and send. Saved at each step; can be finished later. Name and email come from the account. |
| Status | `/application` | Plain-language status, dates, whether action is needed, interview details, next steps, contact. Works without email. |
| Sign in | `/login` → `/continue` | One place decides where each person belongs (see section 6). |

## 3. Architecture and database changes

Four things are stored separately and never mixed up:

| Concept | Where | Values |
|---|---|---|
| Account | `User.status` | ACTIVE, SUSPENDED, DEACTIVATED (INVITED is kept only for older invitations) |
| Email verification | `User.emailVerifiedAt` | empty = not confirmed |
| Application | `Application.status` | DRAFT → SUBMITTED → UNDER_REVIEW / INTERVIEW_REQUESTED / WAITLISTED → ACCEPTED or DECLINED; WITHDRAWN by the applicant |
| Community membership | `User.membershipStatus` (new) | NONE → ACTIVE (only by approving an application) → SUSPENDED / REVOKED → ACTIVE |

- **One rule for community access.** `communityAccess` = active account + confirmed email + ACTIVE membership (administrators are staff). It is computed in one place (`src/lib/auth/session-core.ts`) and checked by:
  - every community page and action (`requireMember`);
  - the file upload and download routes;
  - the live chat server and chat permissions;
  - the rule for whose support counts toward creating a research group (`ACTIVE_MEMBER`).

  The support threshold itself is unchanged.
- **Approval is one transaction** (`updateApplicationStatus`): status ACCEPTED, decision time and administrator, participant record, member profile and membership ACTIVE on the *existing* account. It is idempotent (approving twice changes nothing).
- **Allowed status changes are enforced on the server** (`ADMIN_TRANSITIONS`). Drafts and withdrawals belong to the applicant. Membership can only be granted by approving an application.
- **Submission is exactly-once.** The application row is locked during submit, and a database index allows at most one open application per person.
- **Verification links** are single-use, valid 24 hours, stored only as a hash, and bound to the account *and* the address. A newer link, or a corrected address, makes older links useless.
- **No account enumeration.** Signing up with an existing address shows the same page; the owner of the address gets an "you already have an account" email. Password reset answers the same for every address.

**Migrations** (additive, nothing dropped): `20261122034053_onboarding_status_values`, `20261122034054_onboarding_accounts`.
- Existing status values were renamed in place: NEW → SUBMITTED, INTERVIEW → INTERVIEW_REQUESTED.
- New columns: `User.membershipStatus`, `membershipChangedAt`, `membershipChangedById`, `termsAcceptedAt`, `termsVersion`; `Applicant.userId`; on `Application`: `draftStep`, `submittedAt`, `statusChangedAt`, `decidedAt`, `decidedById`, `interviewDetails`, `additionalComments`.
- New email status: `CAPTURED_LOCALLY`.

## 4. Files changed (main ones)

- **Database:** `prisma/schema.prisma`, the two migrations above, `src/ops/create-database.ts` (UTF-8), `scripts/dev-db.ts`, `src/ops/backup.ts`.
- **Access rules:** `src/lib/auth/session-core.ts`, `guard.ts`, `destination.ts` (new), `member-where.ts` (new), `src/realtime/server.ts`, `src/realtime/chat-service.ts`, `src/app/api/files/**`, `src/proxy.ts`.
- **Server logic:** `src/server/onboarding.ts` (new), `src/server/membership-application.ts` (new), `src/server/admin/applications.ts`, `src/server/accounts.ts`, `src/server/email-retry.ts`, `src/server/community/ideas.ts`, `groups.ts`. Removed: `src/server/applications.ts` (anonymous submission).
- **Pages:** `src/app/(auth)/join`, `login`, `verify-email`, `verify-email/[token]`, `actions.ts`; `src/app/continue`; `src/app/(applicant)/apply`, `application`, `layout.tsx`, `actions.ts`. Removed: the public `/apply` form.
- **Admin:** `src/app/admin/(panel)/applications/page.tsx`, `[id]/page.tsx`, `members/page.tsx`, `members/[id]/page.tsx`, `src/app/admin/actions/applications.ts`, `community.ts`.
- **Email:** `src/lib/email/index.ts`, `status.ts`, `templates.ts`, `webhook.ts`, `scripts/dev-mail.ts`.
- **Public site (links only):** header, phone menu, footer, home, How It Works step 1, call-to-action buttons → `/join`.
- **Forms:** `src/components/forms/password-input.tsx` (Show / Hide), `password-fields.tsx`, `src/lib/validation/application.ts`, `account.ts`.
- **Tests:** `tests/onboarding.test.ts` (new, 25 tests), `tests/email.test.ts`, `integration.test.ts`, `unit.test.ts`, `community.test.ts`, `helpers.ts`, `answers.ts`, `tests/e2e/phase1.spec.ts`, `prepare.ts`, `global-setup.ts`.
- **Demo:** `scripts/seed-demo.ts`, `scripts/demo-screenshots.ts`.

## 5. Migration and data preservation

- **Backups** taken before each change: `backups/cowork-20261122-033906.cwbak.gz` and `…-034234.cwbak.gz`.
- **UTF-8.** All local databases were Windows-1252. The real database was restored into a new UTF-8 database (every table verified by row count and checksum) and swapped in. The old one is kept untouched as `cowork_win1252_20261122`. New databases (dev, test, demo, restores) are always created as UTF-8. The earlier "replace unsupported characters with ?" workaround was removed. **Verified:** names in Chinese, Cyrillic, Arabic, accented Latin and emoji are stored exactly.
- **Tested first on a copy** of the real database. The migrated structure was then compared with a database built from the schema (435 columns, 31 enums; the only differences are two intentional hand-written constraints).
- **Result on the real data at migration time:** 2 owner accounts, 3 applicants, 3 applications, 47 audit entries and 12 email logs were all kept; the "New" application became "Received".
- **Later changes by the owner:** the audit log shows that afterwards, at 04:20–04:26 UTC, the owner registered a test account, removed a participant and deleted two applicants from the admin panel.
- **Earlier applications** (made before accounts existed) are stored by email only. They are connected to an account *only after* that person creates an account with the same address and confirms it by email. Typing the address is never enough. If the application was already accepted, membership starts at that moment. Existing members were kept as members by the migration.
- **Rollback:**
  1. Stop the site.
  2. Rename the kept database back in `psql`: `ALTER DATABASE cowork RENAME TO cowork_new; ALTER DATABASE cowork_win1252_20261122 RENAME TO cowork;`. Or restore a backup with `npm run db:restore -- backups/<file> --into <new_name>`.
  3. Check out the previous code.

  The old database holds the state from before this work.

## 6. Authentication and authorization (verified)

Where people land after signing in (`/continue`, decided on the server from real state):

| State | Lands on |
|---|---|
| Email not confirmed | `/verify-email` |
| Confirmed, no application or a draft | `/apply` (continues the draft) |
| Submitted / under review / interview / waitlisted / declined / withdrawn | `/application` |
| Approved member | `/community` |
| Membership paused or removed | `/application` (explains it) |
| Administrator | `/admin` (two-step verification as before) |
| Account suspended or closed | cannot sign in; message at sign-in |

Verified by tests:
- Unverified, pending, waitlisted and declined people are redirected with an explanation, never to a bare error. They get 404 from the file API, are refused by chat, and cannot support ideas.
- Pausing membership cuts access immediately, including live chat.
- A suspended account's sessions stop working.
- Non-administrators get an error on `/admin`.
- Passwords are hashed with scrypt (Node's built-in implementation, `src/lib/auth/password.ts`). Hashes made earlier with bcrypt are still accepted and are replaced with scrypt the next time the person signs in. Administrator two-step verification and recovery codes are unchanged.
- Reset links are single-use, last one hour, and end all sessions.
- Session cookies are HttpOnly, SameSite=Lax (and `__Host-`/Secure in production).
- Sign-up, sign-in, reset and resend are rate limited.

## 7. Email (verified locally)

- **Emails:** welcome + confirm email, resend, account already exists, application received, interview, waitlisted, declined, accepted, password reset, email change, membership paused / removed / restored, plus "please create your account" for earlier applicants. All remain editable in Admin → Email.
- **Local test mode cannot be mistaken for real delivery.**
  - The log status is **"Captured locally (test only, not delivered)"**.
  - Admin actions show: *"Test email captured locally. This message was not sent to the recipient's real email inbox."*
  - In development, the admin pages and the "check your email" page link to the local inbox at http://127.0.0.1:8025.
  - That link and the local inbox are never shown in production.
- **Statuses:** captured locally · accepted by provider · delivered · delivery failed (bounced) · not sent (not set up / server unreachable / login refused / sender refused / recipient refused / error).
- **"Delivered" only from proof.** It requires a signed provider webhook that identifies the exact message: our own delivery id (sent as the `X-CoWork-Delivery-Id` header) or the provider's message id. Recipient + subject alone is never used, and ambiguous or unmatched events change nothing.
- **Failures lose nothing.** Accounts, applications and approvals are saved before any email is sent. After a failed verification email, "Send the email again" works immediately; otherwise once a minute. Retry issues fresh links and never stores them.

## 8. Administrator workflow (verified in the browser)

Admin → Applications → open one:
- **Where things stand** shows four separate items: 1. Application, 2. Account (email confirmed / no account yet), 3. Community access, 4. Last email.
- **Approve** needs a confirmation tick, then **Approve and Notify** or **Approve without email**. If the email fails, the approval stays and the failure is reported.
- **Other decisions:** Under Review, Interview Requested (the message is shown on the applicant's status page), Waitlisted, Declined, with an optional email.
- **Write an email…** never changes the status.
- **Also on the page:** communication history, private notes (never shown to applicants), data export and deletion.
- **Admin → Members → a member:** pause, restore or remove community access (optional email).
- Unfinished drafts are not shown to administrators. Every decision is in the audit log.

## 9. Screenshots

In `docs/ux-review/screenshots/`:
- `onboarding-01-join.png`
- `onboarding-02-sign-in.png`
- `onboarding-03-check-your-email.png`
- `onboarding-04-application-step-1.png`
- `onboarding-05-application-status.png`
- `onboarding-06-admin-applications.png`
- `onboarding-07-admin-review.png`
- `onboarding-phone-01-join.png`
- `onboarding-phone-02-application.png`

They come from the demo database; the "N" badge is the development indicator.

## 10. Automated test results (2026-11-22)

| Check | Result |
|---|---|
| TypeScript | 0 errors |
| ESLint | 0 problems |
| Unit + integration (`npm test`, real PostgreSQL, UTF-8) | **133 passed** (25 new onboarding tests) |
| Browser (`npm run test:e2e`, Microsoft Edge, fresh production build) | **21 passed** |
| Production build | succeeds (part of the browser run) |
| Accessibility (axe, WCAG 2 A/AA) | no serious issues on join, check-your-email, application form, status page, admin application page, sign-in, forgot-password and the existing pages |

Browser scenarios:
- **A:** register → verify → reach the application.
- **A2:** duplicate registration.
- **B:** draft, resume, submit once, status after signing in again.
- **C:** approve and notify.
- **C2:** enter the community with the original password.
- **D:** waitlisted and declined applicants see their status and are kept out.
- **E:** email outage: account kept, clear message, resend works.
- **F:** password reset; used and invalid links are refused.
- **G:** edge cases, covered in the integration tests:
  - simultaneous duplicate sign-ups create one account;
  - six simultaneous submits produce one application;
  - sessions of a suspended account stop working;
  - earlier applications are linked safely;
  - names in any language are stored exactly;
  - sign-up attempts are rate limited.
- **Phone layouts (375 px):** join, sign-in, application and status pages, with no sideways scrolling.

## 11. Trying it yourself

1. `npm run db:up` (if the database is not running), then `npm run dev`. Open http://127.0.0.1:3000.
2. Click **Join CoWork**. Create an account with any address (for example `you+test1@example.com`).
3. Open the local inbox at **http://127.0.0.1:8025**, open the email, click the link, press **Confirm my email**.
4. Fill in the three steps and submit. You land on the status page: "Application Received".
5. Sign out. Sign in as the owner (Admin → Applications → the application → tick the box → **Approve and Notify**).
6. Sign in again as the applicant with the same password: the status page shows **Enter the Community**.
7. To see an email failure: stop `npm run dev`, start it with `$env:DEV_MAIL_CATCHER="false"; npm run dev` (no local mail server), register another account, and read the message. Then start `npm run mail:dev` in another window and press "Send the email again".

## 12. Development-only test accounts

`npm run demo:seed` rebuilds a separate demo database (`cowork_demo`, never your real data). Start the "demo" server on port 3100. Password for all: in `scripts/demo-config.ts`.

| Account | State |
|---|---|
| `maya`, `luis`, `grace`, `sam`, `tom` `@demo.test` | approved members |
| `nina@demo.test` | confirmed email, no application yet |
| `omar@demo.test` | application received (try approving it) |
| `owner@demo.test` | owner (two-step code from the test secret in `demo-config.ts`) |

No test accounts or default passwords exist in the real or production database.

## 13. Not done, and what production still needs

- **Real email delivery is NOT verified.** It needs a Resend account, an API key and a verified sending domain (see `docs/EMAIL.md`). Until then, no email reaches a real inbox.
- **Delivery confirmations from a real provider are NOT verified.** Signature checking and exact matching were tested with simulated signed events. Whether Resend's events include our delivery-id header must be checked once with a real account; if they don't, statuses stay "accepted by provider" rather than guessing.
- **Resume upload is not offered** (a link field is). File upload for people who are not yet members would need its own storage rules.
- **Signed-in visitors still see "Sign In / Join" on public pages.** Both buttons take them to the right place.
- **Terms of Use and Privacy Notice are drafts** and need legal review before public sign-up.
- **Production database must be created with UTF-8 encoding** (normal on Linux hosts).
- **Not tested with real users or a real screen reader.**
