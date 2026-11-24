# Twigo: Privacy and Access Control Implementation Report

| | |
| --- | --- |
| Date | 24 November 2026 |
| Decisions implemented | 1. Restricted administrator access to private groups · 2. Account and personal-data deletion requests · 3. General hosting disclosure |
| Builds on | `docs/TWIGO-CURRENT-SYSTEM-BEHAVIOR-REPORT.md` (findings H-2, H-5, H-6, M-8) and `docs/TWIGO-LEGAL-DOCUMENTS-RESOLUTION-REPORT.md` (Privacy Policy blocker) |
| Databases changed | **Local development only**: `cowork` and `cowork_demo` (embedded PostgreSQL, `localhost:5433`). Production was not touched. |
| Code | Committed locally on `main`, not pushed. A new release is required before deployment (section I). |

---

## A. Executive summary

**What is now true in the software (verified by automated tests and, where marked, in the browser):**

1. **Administrators cannot browse private groups.** Owner and administrator accounts can no longer join groups, support ideas (supporters become group members) or hold a working membership. Every membership check (`src/server/community/access.ts`), the live chat (`src/realtime/chat-service.ts`), file downloads (`src/server/community/files.ts`) and agreement downloads (`src/app/api/agreements/[id]/route.ts`) refuse staff. The admin group page no longer shows research notes at "Ready for review" (or ever), nor activity counts. The admin "Project agreements" page shows only counts per state, not project names or terms. The owner's standing download of agreements was removed.
2. **Founder-approved temporary access works.** A member of a group files a report (the server records whether the reporter is a member of that group). An administrator then asks for access from that report, with a reason, the information needed and a duration. The **owner** approves or rejects, choosing the information, the start and the **end** (required, at most 30 days). Only that administrator, for that group, for the approved information and within that period, gets a **read-only view in the admin area**. The view is re-authorized and logged on every page, file and agreement request. Access is never possible through the group pages or the live chat.
3. **Access ends at the founder's time.** Every check compares the period with the clock, so access stops at the set end even before the hourly job records it as `EXPIRED`. The owner can also end it early. Refused attempts are recorded.
4. **All privileged access is auditable.** Every report, request, approval or rejection (with scope and period), view, refused attempt, revocation and expiry is written to the audit log. View entries are written *before* anything is shown: if the entry cannot be written, nothing is shown. The owner sees the full history per request.
5. **Members can request deletion** at Account → Privacy & data → Request deletion, in three steps:
   - the choice;
   - the consequences, which issues a signed step token;
   - an identity check made *after* that step (password, plus two-step code if enabled), then a separate final confirmation (tick + typed phrase).
   All of this is enforced on the server. Deletion cannot be requested through the free-text privacy form any more.
6. **Requests reach the owner's queue** (Admin → Privacy requests) with the statuses Submitted, Verification required, Under review, Additional information required, Approved for deletion, Processing, Completed and Rejected. The member is notified in the app of every status change.
7. **The owner reviews and executes safely.** The queue shows a per-category plan (delete / anonymize / end / keep / your decision / kept temporarily in backups), related groups and projects, verification status, private notes and the processing history. Execution needs "Approved for deletion", the owner role and the typed word ERASE, and it runs in one transaction:
   - the account is **anonymized**, not removed, so shared records keep valid links;
   - personal records are deleted;
   - shared group content and project agreements are kept without the person's name, unless the owner chooses to remove the person's ideas, comments and chat.
   Deactivation is distinct: it never sets the new `erasedAt` marker.
8. **Accurate completion notice.** An email goes to the address that was confirmed on the account. Its real delivery status (not configured / refused / accepted by provider / delivered) is stored with the request and shown to the owner. A failure is shown, not hidden.
9. **Backups are described accurately.** Daily database backups: the newest 14 are kept and older ones are deleted automatically. Pre-deployment copies of the database and uploaded files have **no automatic expiry**. Nothing claims immediate deletion from backups.
10. **Privacy Policy version 2** describes all of this, plus the hosting disclosure in general terms and Cloudflare, Resend and Google Meet. It is added by the release as version 2 with status **Pending legal review**. Version 1 is kept with its fingerprint, marked "replaced (never published)". Version 2 is **not approved and not published**: that needs counsel's review and the owner's approval in Admin → Legal.

**Tests:** see section G for exact counts. In short: type check and ESLint clean; the full automated suite and the Playwright browser suite were run after all changes; 17 new automated tests; 15 earlier tests were rewritten because they asserted the behavior the founder's decisions replace.

---

## B. Group access control

### B.1 Removed or replaced standing access (every path found)

| Path | Before | Now | Where |
| --- | --- | --- | --- |
| Staff joining a group | Allowed (chat from join; all research, files, tasks, decisions, projects) | Refused | `joinGroup` (`src/server/community/groups.ts`) |
| Staff becoming members by supporting an idea | Allowed (founding member) | Refused; staff support never counts | `endorseIdea`, `evaluateIdea` (`src/server/community/ideas.ts`), `GROUP_PARTICIPANT` (`src/lib/auth/member-where.ts`) |
| Staff author of an idea becoming coordinator | Possible | Not a member; the earliest supporter coordinates; the "your idea" message goes only to an active author | `createGroupFromIdea` |
| Old staff membership rows | Counted as members | Ignored by every check (`isMember` false); member counts and coordinator succession exclude staff | `access.ts`, `groups.ts` |
| Promotion of a member to administrator | Kept their memberships | Leaves all groups | `setUserRole` (`src/server/accounts.ts`) |
| Live chat (WebSocket) | Staff with membership could join channels | `channelAccess` returns nothing for staff, re-checked on every join, send, edit, delete and history request | `src/realtime/chat-service.ts` |
| Group and chat files | Staff members could download | Staff only with an active grant covering FILES (or CHAT for attachments), two-step required, every download logged | `authorizeDownload` |
| Agreement downloads | Owner could download any group's agreement | Staff only with an active grant covering PROJECTS | `src/app/api/agreements/[id]/route.ts` |
| Admin group page | Plan/Concept/Revenue/Risks notes shown once "Ready for review"; activity counts | Neither shown; text explains the rule | `src/app/admin/(panel)/groups/[id]/page.tsx` |
| Admin "Project agreements" | Every group project's name, group, status, acceptance count; owner download link | Counts per state only | `src/app/admin/(panel)/agreements/page.tsx` |
| Member-facing texts | "Administrators can now read the research notes"; "an administrator may join…" | Rewritten to the new rule | `groups.ts`, `group-labels.ts`, group page, chat sidebar, Help |

Still visible to administrators by design (not group-private): group name, purpose, stage, member list (for moderation), community-visible discussions and announcements (visible to all approved members), and the copy of content a member attaches to a report.

### B.2 Member report

- `ContentReport` has a new column `reporterGroupMember`. It is set by `fileReport` from the database (`groupAccess(...).isMember`), never from the form.
- The group is derived from the reported content: GROUP → itself; MESSAGE → its channel's group; DISCUSSION / COMMENT → the discussion's group.
- Every report is audited (`report.filed`).
- Fields available: id, reporter, group, reported content (snapshot) or subject, category (reason), description (details), submitted time and processing status.
- Members can now report a chat message (added in the previous change) and a group.
- A report by a non-member of the group is stored, but it **cannot** start an investigation (test: "an unrelated member's report cannot").

### B.3 Administrator request

- Started from the report in Admin → Moderation: "Request access to investigate (needs the owner's approval)". The link appears only for reports filed by a group member.
- The form (`/admin/group-access/new`) asks for: the information needed (CHAT, RESEARCH, FILES, TASKS_DECISIONS, PROJECTS), the reason (≥ 20 characters) and the duration in hours (1–720).
- The group is taken from the report on the server.
- One pending or active request per administrator and group.
- Owners are notified in the app. Audited as `group_access.requested`.

### B.4 Owner decision

- OWNER only: the permission `group_access.approve` plus a role re-check in `decideGroupAccess`.
- **Approve**: choose the information (a subset of what was asked), the start (not in the past) and the end (required, after the start, at most 30 days later). The report must still be from a group member and not dismissed.
- **Reject**: needs a short reason.
- There is no default end and no indefinite access. Nothing depends on the group's stage.
- Audited as `group_access.approved` (with administrator, group, report, scope and period) or `group_access.rejected`.
- The requesting administrator is notified.

### B.5 Use, expiry and revocation

| Requirement | Implementation |
| --- | --- |
| Only that administrator, group and information | `authorizeGroupRead(adminId, {groupId, scope})` finds an APPROVED request of that administrator for that group, active now, whose granted scope contains the requested information |
| Read-only view | `/admin/group-access/[id]?section=…`, server-rendered, re-authorized on every load (`investigationData`). Admin pages are sent with `no-store` (existing header rule) |
| Revoke at expiry | Checks compare `startsAt ≤ now < expiresAt` on every request. The hourly housekeeping (`expireGroupAccess`, `src/ops/housekeeping.ts`) marks it `EXPIRED` and records it |
| Reject further use | After the end, every page, file and agreement request is refused and recorded as `group_access.denied` |
| WebSocket | Staff are never admitted to a group's live chat, with or without a grant, so there is no socket to close |
| Direct URLs and APIs | `/api/files/[id]` and `/api/agreements/[id]` use the same gate |
| Previously opened pages | An open page cannot fetch more: each section, file and download is checked again |
| Owner ends early | "End access now" → `REVOKED`, `group_access.revoked` |
| New investigation | Needs a new request and approval |

### B.6 Audit

Entries (entity `GroupAccessRequest`):
- `group_access.requested`
- `group_access.approved` / `group_access.rejected`
- `group_access.viewed` (with the section or file)
- `group_access.denied`
- `group_access.revoked`
- `group_access.expired`

Plus `report.filed`. The owner sees the complete history on each request's page; the full audit log stays available to administrators.

---

## C. Deletion requests

### C.1 First stage (server-enforced)

| Step | Page | Server rule |
| --- | --- | --- |
| 1. Choose | `/account/data/delete` | One option: "Delete my account and my personal data" |
| 2. Consequences | `?step=2` | Plain-language explanation: what is deleted, what is kept and why, shared group information, project agreements, acceptance records, backups, the account at the end. Issues a signed step token (HMAC, bound to the user and the scope, valid 1 hour; `issueStepToken`, `src/lib/security.ts`) |
| 3. Identity | `/account/confirm` (existing) | Password, plus the two-step code when enabled (`confirmIdentity`, unchanged, rate-limited) |
| 4. Final confirmation | `?step=3` | Shown only if the identity check happened **after** the step token was issued and within 10 minutes. Tick "I request the deletion of my account and my personal data…" and type DELETE MY ACCOUNT |
| 5. Queue | `requestDeletionAction` → `submitDeletionRequest` | Re-checks all of the above. Also: 3 attempts per day, one open deletion request per person (checked again inside the transaction), CSRF via the framework's server-action origin check, audit `privacy.deletion_requested`, owners notified. Stores the verification time and method |

Nothing is deleted at this stage (test: account unchanged after submission).

### C.2 Owner review (Admin → Privacy requests → request)

The page shows:
- request id, member, date, scope;
- identity verification ("Verified by password and two-step code on …");
- status;
- related groups (with coordinator roles) and project agreements (names only);
- the deletion plan by category (below);
- the message to the member and private admin notes;
- the processing history (audit entries);
- after completion, the completion notice's delivery status.

Statuses use the existing values plus four additive ones: `OPEN` (Submitted), `VERIFICATION_REQUIRED`, `IN_PROGRESS` (Under review), `INFO_REQUIRED`, `APPROVED_FOR_DELETION`, `PROCESSING`, `COMPLETED`, `REJECTED`. A deletion request becomes `COMPLETED` only by carrying it out. Every status change notifies the member in the app (this closes behavior-report finding M-8; members whose community access is not active see it on their Privacy & data page instead).

### C.3 The plan (classification, from `deletionPlan`)

| Category | Action | Notes |
| --- | --- | --- |
| Account record | Anonymize | Name → "Erased account", email → an unusable placeholder, password and two-step data removed, status DEACTIVATED, community access REVOKED, `erasedAt` set; cannot be reactivated |
| Sessions, sign-in links, recovery codes | Delete | Live connections closed |
| Profile and profile photo | Delete | Photo bytes removed after the transaction |
| Application and internal participant record | Delete, **or your decision** | If linked to assignments in the earlier administrator-run project records (which can carry compensation records), it is kept and flagged |
| Notifications, preferences, chat read markers, meeting attendance | Delete | |
| Group memberships | End | Leaves every group (normal leave lines; coordinator succession) |
| Ideas without a group; comments and discussions; chat messages | **Your decision** (optional tick boxes) | Removed = hidden now, permanently deleted by the existing clean-up after the deleted-content period (default 30 days). The approved policy does not settle this, so it is not done automatically |
| Ideas that formed a group, research notes, tasks, decisions, links, group files | Keep | Shared records; shown without the name |
| Project agreement participations | Keep | Evidence; the agreement text and its fingerprint cannot change |
| Acceptance records, privacy requests, reports filed | Keep | Evidence |
| Email delivery log | Keep until its retention period ends | Existing setting (default 730 days) |
| Audit log | Keep | No automatic deletion (existing policy) |
| Contact-form messages from the same address | Keep until the existing retention period | Not linked to the account |
| Backups | Kept temporarily | See C.5 |

No retention period or legal exception was invented. Categories the approved texts do not settle are left to the owner at execution time, with the default being to keep.

### C.4 Execution and notification

`executeDeletion` (OWNER, `privacy.erase`) runs in this order:
1. Requires "Approved for deletion" and the typed word ERASE. Refuses staff targets and the owner's own account.
2. Claims the request (`PROCESSING`) so that a second click cannot run it twice.
3. Leaves all groups and ends sessions.
4. One transaction deletes or anonymizes as planned, marks the request `COMPLETED` with `completedAt` and a per-category count summary (no personal data), and writes `privacy.erasure_completed`.
5. Removes the photo files and recounts idea support.
6. Emails the template `account_deletion_completed` to the confirmed address captured before anonymization. The delivery row id is stored on the request and `privacy.erasure_notice` is audited with the real status.

In the tests, where email is not set up, the notice is recorded as `NOT_CONFIGURED`. The owner's flash message and the request page say so explicitly, and the email can be retried from Admin → Email. "Accepted by provider" is never shown as delivered.

### C.5 Backups (actual configuration inspected)

- Daily backup job: `src/ops/scheduler.ts` and `src/ops/backup.ts`. It keeps the newest `BACKUP_KEEP` files (template: 14) and prunes older ones. It is encrypted when `BACKUP_ENCRYPTION_KEY` is set, which production requires. Location: `/data/backups` in the `twigo-data` volume.
- Pre-deployment copies: `scripts/deploy/deploy-twigo.sh` step 4 writes the database backup, `storage.tar.gz` (uploaded files, **not encrypted**) and a copy of the server settings to `~/Server/backups/twigo/<time>/` with directory mode 700. **There is no automatic expiry**: they remain until the operator deletes them.
- The completion notice, the consequences page, the plan and Privacy Policy version 2 all state this. Nothing claims removal from existing backups.
- No pruning was added to the deployment script: deleting server backups automatically was not authorized and would change a safety mechanism. It is listed in section H as a decision for the founder.

---

## D. Privacy Policy version 2

### D.1 How it relates to version 1 and to the PUBLISH step

- Version 1 (`src/content/legal/privacy.ts`) is unchanged. Its fingerprint stays locked by a test, and it remains readable at `/legal/privacy/v/1`.
- Version 2 (`src/content/legal/privacy-v2.ts`) is declared as a release-defined later version (`LegalDefinition.later`, `src/content/legal/index.ts`). `ensureLegalDocuments` adds it to a database as **version 2, Pending legal review** only when that database's latest Privacy version is exactly the release's version 1. An owner-written version is never numbered over (test).
- On adding it, a version 1 that was only shown and never published is marked `SUPERSEDED`. The public notice says "replaced (never published)", not "no longer in force". A PUBLISHED version 1 would stay in force until version 2 is published.
- Version 2 is flagged as a material change requiring renewed acknowledgment. The gate applies only once it is published.
- The one-time `legal:publish-reviewed` script (deployment `PUBLISH` step) publishes only texts identical to the reviewed version 1 texts. It **never publishes version 2**, and Privacy version 1 stays `incomplete`. Version 2 needs counsel's review and then Admin → Legal → Privacy Policy → Approve (reviewer note) → Publish (effective date).
- Registration now records acknowledgment of the version shown (version 2). The application's consent record now stores the exact Privacy Policy version, status and fingerprint shown at submission (previously a fixed string), and the application's review step links that version.

### D.2 Mapping to the software

| Statement in version 2 | Software |
| --- | --- |
| Group information is private to members; administrators cannot join or browse | B.1 |
| Access only after a member's report, the owner's approval, for set information and period (≤ 30 days), read-only, automatic end, every view recorded | B.2–B.6 |
| Administrators, including the owner, see only counts of projects per state | Admin agreements page |
| Email log includes message text except for messages with sign-in or confirmation links | `EmailDelivery.body` for non-secret templates |
| Deletion steps 1–7 | C.1–C.4 |
| Backups: daily, newest copies (currently 14) kept, older deleted; pre-update copies kept until deleted; backups not changed by deletion | C.5 |
| Hosting in general terms; Cloudflare; Resend; Google Meet | E |
| Removed from version 1 because untrue: "Administrators do not browse them"; "full deletion is done on request"; collection of time zone and preferred contact method on applications; "before this policy is published" sentences | — |
| Retention periods | Unchanged defaults from `src/config/org-settings.ts` |

---

## E. Hosting disclosure and remaining uncertainty

The founder's wording is used verbatim in section 5 of version 2, with the community name:

> Twigo uses third-party hosting and infrastructure services to operate the community. Information submitted to Twigo may be stored or processed using infrastructure operated by external service providers in the jurisdictions where those services operate. Twigo does not identify the precise physical server location in this notice.

The providers are kept distinct: hosting and infrastructure (unnamed); Cloudflare (domain name service and proxy, processing network addresses and requests); Resend (email delivery); Google Meet (meetings opened by members).

Uncertain or not verified:
- **The hosting provider and server location are not named and were not verified.** The VPS location is not treated as the jurisdiction.
- Whether Cloudflare proxies all traffic in production is per the project's own documents (DNS observed as proxied on 23 November); not verified here.
- Resend is configured but has never delivered a real email.
- Whether this general wording satisfies every legal requirement is for counsel. Version 2 is therefore **Pending legal review**, not approved.

---

## F. Files, migration and database operations

### F.1 Migration

`prisma/migrations/20261124165713_privacy_access_control/migration.sql` (purely additive):
- new enums `GroupAccessScope` and `GroupAccessStatus`;
- four new `PrivacyRequestStatus` values;
- nullable columns `User.erasedAt` and `PrivacyRequest.{scope, verifiedAt, verificationMethod, adminNotes, completedAt, outcome, completionEmailId}`;
- `ContentReport.reporterGroupMember BOOLEAN NOT NULL DEFAULT false`;
- new table `GroupAccessRequest` with indexes and foreign keys (`ON DELETE RESTRICT` to report and group; `SET NULL` to users).

No existing column, row or constraint is changed or dropped. `prisma/schema.prisma` and `prisma/migrations/schema.snapshot.prisma` were updated with it.

### F.2 Code

| File | Change |
| --- | --- |
| `src/lib/auth/member-where.ts` | `GROUP_PARTICIPANT` (active member with a MEMBER account), `isStaffRole` |
| `src/server/community/access.ts` | Staff are never `isMember`; `activeMemberIds` excludes staff |
| `src/server/community/groups.ts` | Join refused for staff; participant rule in counts, succession and creation; ready-for-review notice text; author message fix |
| `src/server/community/ideas.ts` | Staff support refused and never counted |
| `src/server/community/reports.ts` | `reporterGroupMember` from the database; audit `report.filed`; real errors no longer reported as "already reported" |
| `src/server/community/files.ts` | Staff downloads only through `authorizeGroupRead` |
| `src/realtime/chat-service.ts` | Staff never get channel access |
| `src/server/accounts.ts` | Promotion to staff leaves groups; erased accounts cannot be reactivated |
| `src/server/admin/group-access.ts` (new) | Request, decision, revocation, `authorizeGroupRead`, `investigationData`, history |
| `src/app/admin/actions/group-access.ts` (new) | Server actions (permission-checked) |
| `src/app/admin/(panel)/group-access/page.tsx`, `new/page.tsx`, `[id]/page.tsx` (new) | List, request form, decision, revocation, history, read-only investigation view |
| `src/app/admin/(panel)/layout.tsx` | Menu entry "Group access" |
| `src/app/admin/(panel)/reports/page.tsx` | "Reported by a member of this group" and request link |
| `src/app/admin/(panel)/groups/[id]/page.tsx` | Notes and counts removed; texts |
| `src/app/admin/(panel)/agreements/page.tsx` | Counts per state only |
| `src/app/api/agreements/[id]/route.ts` | Staff only with a PROJECTS grant |
| `src/ops/housekeeping.ts`, `src/ops/scheduler.ts` | Hourly expiry recording |
| `src/lib/auth/permissions.ts` | `group_access.request` (ADMIN, OWNER), `group_access.approve` (OWNER), `privacy.erase` (OWNER) |
| `src/lib/security.ts` | Signed step tokens |
| `src/server/privacy-deletion.ts` (new) | Submission, plan, execution, status updates, backup note |
| `src/app/account/actions.ts`, `src/app/account/data/page.tsx`, `src/app/account/data/delete/page.tsx` (new), `src/app/account/account-nav.tsx` | Member flow; "Privacy & data"; deactivation explained as not deletion |
| `src/server/privacy-requests.ts` | Deletion not accepted through the free-text form; open-request statuses |
| `src/app/admin/actions/twigo.ts`, `src/app/admin/(panel)/privacy-requests/page.tsx`, `[id]/page.tsx` (new) | Queue, review, notes, history, execution |
| `src/lib/labels.ts` | Status labels |
| `src/lib/email/templates.ts` | `account_deletion_completed` |
| `src/content/legal/privacy-v2.ts` (new), `src/content/legal/index.ts`, `src/server/legal.ts`, `src/components/legal/document-view.tsx` | Version 2; release-defined later versions; superseded-never-published notice |
| `src/server/membership-application.ts`, `src/app/(applicant)/apply/page.tsx`, `src/app/admin/(panel)/applications/[id]/page.tsx` | Application records and links the Privacy Policy version shown |
| `src/components/community/chat.tsx`, `src/app/community/(portal)/help/page.tsx`, `src/app/community/(portal)/groups/[slug]/page.tsx`, `src/server/community/group-labels.ts` | Member-facing explanations |
| Tests | New `tests/privacy-access-control.test.ts` (17 tests); updated `corrective-chat`, `regression-probes`, `release-fixes`, `twigo-legal`, `legal-publish`, `twigo-support-privacy`, `corrective-admin`, `tests/e2e/phase1.spec.ts` |

### F.3 Database operations (development only)

| Step | Result |
| --- | --- |
| Targets confirmed | `cowork` (the `.env` database, `localhost:5433`) and `cowork_demo` (fictional `@demo.test` accounts) on the local embedded PostgreSQL |
| Backups | `backups/cowork-20261124-172626-before-privacy-access-control.cwbak.gz` (56 tables, 309 rows); `backups/cowork_demo-20261124-172634-before-privacy-access-control.cwbak.gz` (56 tables, 142 rows). No older backup was pruned |
| Pre-check | No staff account had an active group membership in either database |
| Migration | `npm run db:deploy`, first on `cowork_demo` (populated rehearsal), then on `cowork`: `1 migration(s) applied` each |
| After | Users 6 / 9 and acceptance records 0 / 5 unchanged; `GroupAccessRequest` empty; Privacy version 2 added on first page load (in `cowork_demo`: version 1 `SUPERSEDED`, never published; version 2 `PENDING_LEGAL_REVIEW`; audit `legal.release_version_added`) |

---

## G. Tests and results

All runs on 24 November 2026 on this computer, against isolated databases. A first full run after the changes found 15 earlier tests failing; each asserted behavior the founder's decisions replace (G.3). They were rewritten to assert the new rules, and the whole suite was run again.

### G.1 Final runs (on the final code)

| Check | Command | Result |
| --- | --- | --- |
| TypeScript | `npx tsc --noEmit -p .` | **Passed** (0 errors) |
| ESLint | `npx eslint . --quiet` | **Passed** (0 errors) |
| Unit and integration tests | `npx vitest run` (database `cowork_test`) | **455 passed, 0 failed** (39 files). Before this work: 441 in 38 files. +17 new tests, −3 net from the rewritten chat tests |
| Browser tests (Playwright, Microsoft Edge, production build, database `cowork_e2e`) | `npx playwright test` | **23 passed, 0 failed** (4.2 min) |
| Production Docker image | `docker compose -f docker-compose.yml --env-file .env.docker-local build app` (Docker 29.7.2 in WSL; local only) | **Built** (`twigo-app:latest`, exit 0). The image was built but not started; the running local trial container was not replaced |
| Migration on populated databases | `npm run db:deploy` on `cowork_demo`, then on `cowork` | **Applied**; counts unchanged (F.3) |

The same full chain (type check, ESLint, vitest, Playwright) also passed once before the last three wording edits: 455 / 23.

### G.2 New automated tests (`tests/privacy-access-control.test.ts`, 17)

| Requirement | Test |
| --- | --- |
| No access without a member report or without owner approval; an unrelated member cannot authorize | "only a report by a member of that group can start a request; an unrelated member's report cannot"; "nothing is visible before the owner approves; only the owner can approve; approval needs an explicit end of at most 30 days" |
| Only the approved administrator, group and scope; expired access rejected | "only the approved administrator, group and information, and only inside the period": another administrator, another group and another scope are refused; access is refused after the end even before the hourly job runs; the job marks the request EXPIRED |
| Live sockets never authorized; no direct-API bypass | "the live chat never admits staff, even with an active approval"; "the owner can end access early; direct file and agreement requests follow the same rule" (`/api/agreements/[id]` 404 → 200 → 404; file download refused → allowed → refused) |
| Staff cannot join or support; old membership rows give nothing | "an administrator or owner cannot join a group or support an idea"; "an old membership row gives staff nothing…" |
| Attempts logged; the owner sees the history | "the whole history is recorded and the owner can read it" |
| Deletion: first stage cannot be bypassed; duplicates; reaches the queue | "needs the step token, an identity check made after it, the tick and the phrase; then reaches the queue once": forged token, no identity check, identity check before the step, missing tick, wrong phrase, someone else's token, duplicate. Also "the free-text request form cannot be used for deletion". Unauthenticated: page and action call `requireUser`; the browser check shows a 307 to sign-in |
| Plan finds associated data; shared records safe; legally required records kept; backups not reported as erased | "the plan names every category and how it is handled; backups are never reported as erased" |
| Unauthorized admins cannot execute; approved deletion succeeds; shared records and acceptances kept; no double run; no reactivation | "only the owner, only after approval, only with the typed confirmation; erasure anonymizes and keeps shared records" |
| Completion notice generated; failed email recorded accurately | "the completion notice goes to the confirmed address and its real outcome is recorded (no email set up here: not sent)": status `NOT_CONFIGURED`, template, address, backup text, audit |
| Privacy Policy: new version displays; v1 in history; a draft is never shown as published; PUBLISH never publishes v2 | "is added next to the reviewed version 1, pending review; version 1 stays readable with its fingerprint" |
| Owner-written versions are never overwritten | "an owner's own version is never numbered over" |
| Disclosure matches the software | "says what the software does…": hosting wording, Cloudflare, Resend, Google Meet, no joining, owner approval, 30 days, deletion path, backups with `BACKUP_KEEP` = 14, and none of the removed untrue sentences |
| Registration and application consent reference the correct versions | "registration and the application record the Privacy Policy version actually shown (version 2)" |

### G.3 Earlier tests rewritten (they asserted the replaced behavior)

| File | Before | Now |
| --- | --- | --- |
| `corrective-chat.test.ts` | 1 test that an owner or administrator is named when they join or leave, and 6 tests of the join-with-history-boundary rule | 1 test: staff cannot join, no line is written. 3 tests: an owner's socket is refused while members see the history; chat attachments cannot be downloaded by staff; staff support is refused and no group forms (net −3 tests) |
| `regression-probes.test.ts` | 9: staff support counts. 11: the owner joins and sees only later messages | 9: staff support is refused. 11: the owner cannot join or open the chat |
| `release-fixes.test.ts` | The owner downloads any agreement with two-step verification | The owner gets 404 without an approved investigation; the attempt is recorded |
| `twigo-legal.test.ts` | Exactly one version per document | Plus the release's Privacy version 2 (version 1 superseded) |
| `legal-publish.test.ts` | Privacy shown as version 1 | Privacy shown as version 2, pending; the admin-path guard is tested on a version 1 still awaiting review |
| `twigo-support-privacy.test.ts` | Deletion through the free-text form | Deletion refused there; a correction request goes through, with an in-app notice to the member |
| `corrective-admin.test.ts` | 15 menu entries | 16 (Group access) |
| `tests/e2e/phase1.spec.ts` | Admin group page text; the owner sees "Bookkeeping pilot" and "3 of 3" | New admin group page text; project names are not shown to the owner; `/admin/group-access` and `/account/data/delete` added to the accessibility checks |

### G.4 Browser checks (local demo server, `cowork_demo`, fictional accounts, email captured locally)

| Check | Result |
| --- | --- |
| `/legal/privacy` | "Draft awaiting legal review". History: Version 1 · Superseded; Version 2 · Pending legal review. The version 2 text shows the hosting wording and "Administrator accounts cannot join groups" |
| `/legal/privacy/v/1` | "Version 1 was replaced" and "This version was never published" |
| `/join` | "Privacy Policy (version 2)" and "The Privacy Policy is a draft awaiting legal review." |
| Deletion flow (member) | Step 3 with a forged token shows "Confirm your identity first". Then: step 1 → step 2 (consequences, backup text with 14 days) → identity confirmation (password) → step 3 → submit → "Your deletion request was received. Nothing has been deleted yet…". Listed as "Delete my information · Submitted" |
| Group report (member) | "Thank you. The report was sent to the moderators." |
| Moderation (owner) | "Request access to investigate" is shown only for the new member report; an older report from before the migration is treated as not from a group member |
| Access request and approval | Request recorded ("Nothing is visible until the owner approves it"). Approval without an end refused ("Set both the start and the end of the access."). Approval with a one-hour end → "Active now". The chat section shows the group's messages read-only. History: requested, approved, viewed |
| End access now | The section then shows "This access is not active", with no message text. History adds revoked and denied |
| Privacy request review (owner) | Verification "Verified by password", related groups and projects, a 17-row plan with actions and reasons, the backup row, history |
| Execution (owner) | Approved for deletion → ERASE → "Completed". The member is shown as "Erased account (erased)". Completion notice: "Captured locally (test only, not delivered)". History: deletion_requested, request_updated, erasure_started, erasure_completed, erasure_notice |
| Admin group page | No "Workspace" counts, no "Business proposal"; the rule text is present |
| Admin Project agreements | Counts per state only, with the privacy sentence |
| Not signed in | `/admin/group-access` and `/account/data/delete` → 307 to sign-in |

### G.5 Not run

- Deployment and launcher suites (`scripts/deploy/test-*.sh`, `test-launcher.ps1`): they need an isolated SSH server in WSL. Neither script was changed in this task. Their static checks in `tests/deployment-config.test.ts` and `tests/launcher-config.test.ts` are part of the full suite above.
- The Docker role walkthrough (`scripts/audit/docker-verify.sh`): not run, because it reseeds the local trial's demo database. Only the image build was run.
- Nothing was run against the VPS or any production service.

---

## H. Remaining issues

1. **Privacy Policy version 2 is pending legal review.** It is not approved or published. Until it is published, the site shows it as a draft, and new members acknowledge the draft.
2. **Hosting provider and server location** are not named (by decision) and not verified.
3. **Pre-deployment backups have no automatic expiry**, and their `storage.tar.gz` is not encrypted. The founder should decide a retention period and delete old copies by hand (`~/Server/backups/twigo/`). No automatic pruning was added.
4. **Shared content after erasure:** a person's text in shared group areas stays (without their name) unless the owner removes ideas, comments, discussions or chat at execution. Research notes, tasks, decisions and group files written by the person are always kept. Agreement texts keep participant names. All of this is stated in the policy and the notice; whether it is sufficient is for counsel.
5. **Applications linked to earlier project records** are not deleted automatically (flagged).
6. **Status-change notices** reach members in the app only while they have community access. Applicants without access see the status on their Privacy & data page. Only the completion notice is always emailed.
7. **Existing staff memberships** in a populated production database would be ignored but not removed (production has none: it was never deployed).
8. **Approving a group for a project** (owner) no longer shows the group's notes; the coordinator must share what the group chooses.
9. **The investigation chat view** shows up to the 2,000 oldest messages in one page (no paging).
10. The privacy-request record keeps the email address the request was made from (as evidence that it was handled), and the email log keeps the completion notice's address until its retention period ends. Both are stated in Privacy Policy version 2 ("your privacy requests … are kept"; email records).
11. Reports filed before this change cannot start an investigation (the new `reporterGroupMember` field defaults to false and is not inferred afterwards).
12. Still open from earlier reports: real email never sent; production not deployed; legal operator and governing law unresolved; the reviewer and review date of version 1 texts not provided.

---

## I. Release and deployment procedure (for the founder; nothing here was run)

1. **Review** sections B–E and H.
2. **Build a new release** (the existing `release/` package does not contain these changes):

   ```powershell
   git tag twigo-rc6-2026-11-24
   ```

   ```powershell
   .\scripts\deploy\new-release.ps1
   ```

3. **Deploy** with `.\deploy-twigo.ps1` (unchanged launcher, three connections).
   - The server script backs up the database and uploads before anything changes.
   - It then applies the new migration (`npm run db:deploy`; additive, safe on a populated database).
   - At the legal step, type `PUBLISH` only if a lawyer reviewed exactly the version 1 texts. Seven documents publish; the Privacy Policy shows `incomplete`. Version 2 appears as a draft on first use.
4. **After deployment** (read-only checks on https://twigo.space):
   - `/legal/privacy` shows "Version 2 · Draft awaiting legal review"; `/legal/privacy/v/1` shows "replaced (never published)".
   - Admin → Group access opens.
   - Admin → Project agreements shows counts only.
   - Account → Privacy & data shows "Request deletion".
5. **Privacy Policy version 2:** have counsel review it (it is at `/legal/privacy`, and the text is in `src/content/legal/privacy-v2.ts`). If approved without changes: Admin → Legal → Privacy Policy → version 2 → Approve (note naming the reviewer and date) → Publish (effective date). Members are then asked to acknowledge it once. If counsel requires changes: Admin → Legal → New version (draft), edit, then follow the same steps.
6. **Backups:** decide how long pre-deployment copies are kept, and delete older ones on the server by hand.
7. Do not approve any group access until a real report by a group member exists. Each approval needs an explicit end.
