# Corrective Implementation Plan

Prepared 22 November 2026, from the 59 findings in `docs/FINAL-PRODUCT-AUDIT.md` and the founder's six decisions.

**Status: plan only. No corrective work has started.** Nothing in this document is implemented until the founder approves it.

**Scope rule.** The goal is to finish the existing website. Nothing here adds a product feature beyond what a finding or a decision requires. Where a correction needs something new (for example a revision history for ideas), it is the smallest version that satisfies the decision, and it is marked **New element**.

---

## 1. How the six decisions are applied

| Decision | What it changes in this plan | Findings |
|---|---|---|
| 1. Administrators may take part in groups as ordinary members, with no hidden access | Every join, leave and removal is shown in the group chat and recorded. Administrators and the owner see chat only from the moment they joined. They are labelled as administrators in the member list. No "browse chat" tool exists or will be built; the only moderation view remains the snapshot of a message that a member reported | P1-1, P3-21 |
| 2. Keep Google Meet; correct the wording | One "Start a meeting" button, accurate wording everywhere, meetings that end by themselves, one active meeting per group, permission tests. No audio or video infrastructure | P2-10 |
| 3. No fixed organizational share; full disclosure; everything agreed before work begins | Public wording and the revenue diagram are corrected. The policy draft is updated to match. No percentage is published. No new financial feature is built | P2-19, P3-23 |
| 4. Preserve development data; separate environments; clean production database | Nothing is deleted. The placeholder owner stays in the development database only. Production starts from an empty database with one legitimate owner. A production safety check blocks test accounts | P0-1, P2-23 |
| 5. Minor corrections keep endorsements; material changes need renewed endorsement; groups change direction openly | Idea revision history; the author states whether an edit is minor or material; a material edit resets support and notifies supporters; a group's purpose can only change together with a recorded, announced decision | P2-9 |
| 6. Owner-only powers | Destructive operations (deleting projects and participant records), backups, restore, settings, administrator management and compensation stay or become owner-only. Ordinary administrators keep applications, members, public content and moderation | P1-4, P1-6, P2-13 |

---

## 2. Where this plan differs from the audit's recommendations

The audit recommendations were reviewed one by one. These are changed, narrowed or dropped, with the reason.

| Finding | Audit suggested | Plan | Why |
|---|---|---|---|
| P1-1 | Either bar administrators from groups, or make joining visible | Make joining visible **and** limit administrators' chat history to after they joined | Decision 1 allows participation but forbids access to earlier conversations |
| P1-3 | Also change the default network address to 127.0.0.1; add a global sign-in cap | Fix the client-address source only. Keep the default address | The default 0.0.0.0 is needed by container hosting. Once the address cannot be spoofed, the default is no longer a weakness. A global cap is a new mechanism and is not needed |
| P1-5 | Owner tool in the admin area to reset another administrator's two-step verification; check the second step per session | Add the reset to the existing command-line admin script instead. No per-session check | The command-line script already resets passwords, needs server access (which only the owner has) and adds no new screen. Ending other sessions at setup makes the per-session check redundant |
| P1-6 | Prefer archiving (soft delete) over deleting | Owner-only deletion, and the database refuses to delete while an agreement exists | Soft delete touches every project and participant query. The simpler rule meets the acceptance criterion and decision 6 |
| P2-13 | Move public content editing (contact address, FAQ) to owner-only | **Withdrawn.** Content stays with ordinary administrators | Decision 6 explicitly lets administrators manage public content. Content changes are already audited |
| P2-16 | Replace the lock with a slow-down | Keep a temporary lock, make its message identical to "wrong password", and key it to account plus network | A lock is simpler and already tested. The harm was the different message and that one outsider could lock anyone |
| P2-22 | Stream the backup instead of holding it in memory | Not now | At the current size (tens of kilobytes) it has no effect. It is noted as a later item if the database grows |
| P3-3 | Merge or shorten public pages | Only remove repeated blocks, after the founder approves an exact cut list | Earlier instruction: do not redesign public pages |
| P3-7 | Consider folding group discussions into chat and announcements | **Not recommended.** Keep all four, clarify their labels | Discussions are visible to the whole community; chat is for members only. Folding them would either hide discussions or expose chat. It would also orphan existing records |
| P3-16 | Remove all invitation-flow leftovers | Remove only what a dependency check proves unused | Administrator invitations still use the activation link and its email template |
| P3-20 | Update Prisma when a fix exists | Same, and explicitly do **not** run `npm audit fix --force` | That command would downgrade Prisma to 6.12, a breaking change |
| P3-23 | A read-only owner list of all compensation agreements | **Deferred, no change now** | It is a new screen. Decision 3 asks for agreed, disclosed arrangements, which the existing per-project records support. Revisit when real projects exist |

---

## 3. Working rules for the implementation

1. **One stage at a time.** Each stage ends with a short written report and waits for approval before the next begins.
2. **A commit per finding** (after Stage 0), named with the finding ID, so any single correction can be reverted.
3. **Before any database migration:** a verified backup (`npm run db:backup`, then a restore into a scratch database to prove it). Migrations are written by hand when existing rows are affected, and are first applied to a copy of the development database.
4. **No real data is edited or deleted.** Corrections change code and structure. The three places where existing rows could be touched are listed in section 9 and each needs explicit approval.
5. **Every correction gets a test** that fails before the change and passes after. The 12 audit probes become permanent regression tests with the expected result reversed.
6. **No external service, account or purchase** without explicit approval. No deployment.
7. **Evidence, not claims.** A finding is reported as corrected only with the test or browser check that shows it.

**Planned database changes** (all additive or constraint-only; none drops data). P3-13 needs no structural change:

| # | Change | For |
|---|---|---|
| M1 | `ChatMessage.kind` (USER or SYSTEM), default USER | P1-1 |
| M2 | Compensation agreement → assignment: cascade replaced by restrict | P1-6 |
| M3 | One active meeting per group (partial unique index); close existing duplicate active meetings first if any exist | P2-10 |
| M4 | New table `IdeaRevision` | P2-9 |

---

## 4. Stage 0 — Project preservation

Covers **P1-10**. Nothing else starts before this is complete and confirmed.

### 0.1 Local version control

- **Audit issue ID:** P1-10. **Original severity:** P1.
- **Root cause:** a repository was never created.
- **Steps:**
  1. Extend `.gitignore` before the first commit (see 0.2).
  2. `git init` on a branch named `main`.
  3. Dry run: list what would be committed and confirm that no secret, personal data or database file is included.
  4. First commit: the project exactly as it stands now, including all uncommitted development changes and the audit files. No file is altered for this commit.
  5. Tag it `audit-baseline-2026-11-22`.
- **Affected files:** `.gitignore`; new `.gitattributes` (keeps line endings stable on Windows).
- **Dependencies:** none.
- **Implementation risks:** committing a secret by mistake. Mitigation: the dry run in step 3, and a search of the staged files for the values of `AUTH_SECRET`, `ENCRYPTION_KEY` and the admin password before committing.
- **Required tests:** `git status` clean after commit; `git ls-files` contains no `.env*` except `.env.example`, nothing under `backups/`, `.pgdata/`, `storage/`, `.dev-mail/`.
- **Acceptance criteria:** the project has a baseline commit; type check, lint and the 134 tests still pass from a fresh checkout of that commit into another folder.

### 0.2 Exclusions

Already excluded: `.env`, `.env.local`, `.env.*.local`, `.env.test`, `.pgdata/`, `backups/`, `storage/`, build folders, test output, local mail folders.

To add:

| Pattern | Reason |
|---|---|
| `*.cwbak`, `*.cwbak.gz`, `*.cwbak.enc` | Backup files anywhere, not only in `backups/` |
| `*.sql`, `*.dump` | Database exports |
| `.e2e-storage/`, `.demo-storage/`, `.e2e-mail/`, `.dev-mail/` | Uploaded test files and captured emails (already partly listed; confirm all four) |
| `*.pem`, `*.key`, `*.p12` | Certificates and keys |
| `tsconfig.tsbuildinfo` | Build cache |
| exports folder used by data-access requests, if any is written to disk | Personal data |

`docs/audit-screenshots/` and `docs/ux-review/` contain only demo data and stay in the repository.

### 0.3 Verified backup and rollback

1. Create a fresh backup of the development database (`npm run db:backup`).
2. Restore it into a scratch database and compare table counts and checksums (the restore command already verifies every table).
3. Copy the uploaded-files folder alongside it.
4. Record in `docs/DEPLOYMENT.md` the three rollback procedures:
   - **Code:** `git revert <commit>` for one correction, or `git checkout audit-baseline-2026-11-22` for everything.
   - **Database structure:** restore the pre-migration backup into a new database and point the site at it. The old database is kept until the founder confirms.
   - **Data:** unchanged by this plan; the same restore applies.
- **Acceptance criteria:** a restore of today's backup has been performed and verified once, and the three procedures are written down.

### 0.4 External backup strategy (proposal; needs approval before anything is set up)

The aim is a second copy of the code and of the backups in a different place.

| Option | What it protects | Cost | Notes |
|---|---|---|---|
| A. External drive or USB stick, weekly, using a git bundle plus the backup files | Code and data against disk failure | None | Fully offline. Depends on remembering to do it |
| B. Private repository at a hosting service (for example GitHub private) | Code only | Free tier exists | Sends source code to an outside service. Requires an account |
| C. Encrypted backup files copied to cloud storage | Data | Usually a small monthly fee | Only encrypted files leave the computer. Requires the backup encryption key (P2-22) |

**Recommendation:** A now (no approval for outside services needed), B for code once the founder agrees, C when a production site exists. Backups are never placed in the code repository.

---

## 5. Stage 1 — Critical and high-priority corrections

Suggested order inside the stage: P1-7 and P1-4 (small, isolated), then P2-5's group lock (needed by P1-9), then P1-9, P1-1, P1-2, P1-3, P1-5, P1-6, P1-8, P0-1.

### P0-1 — Placeholder owner account without two-step verification

- **Original severity:** P0.
- **Root cause:** a development account was created early and never separated from what would become production data.
- **Proposed correction (decision 4):**
  1. The development database is left untouched. The placeholder account stays there.
  2. Production is created as a new, empty UTF-8 database: apply migrations, then create the one legitimate owner with the existing admin script (password typed at a prompt, two-step verification forced at first sign-in).
  3. Production safety check at startup: refuse to start if any active owner or administrator has an address on a reserved test domain (`.test`, `.example`, `.invalid`, `.localhost`, `example.com/.net/.org`).
  4. `scripts/create-admin.ts` no longer silently promotes or reactivates an existing account; it stops and asks for an explicit `--promote` flag.
  5. The procedure is written as a checklist in `docs/DEPLOYMENT.md` ("First production start").
- **Affected files:** `src/lib/env.ts` or a new `src/ops/launch-checks.ts`; `server.ts`; `scripts/create-admin.ts`; `docs/DEPLOYMENT.md`.
- **Dependencies:** P1-8 (startup checks), P1-5 (closes the takeover route), P2-23.
- **Implementation risks:** the check could block local production-mode test runs. Mitigation: the existing local-test switch stays, but only works when the site address is a local one.
- **Required tests:** startup check refuses a test-domain owner in production mode and allows it in development; admin script refuses to promote without the flag.
- **Acceptance criteria:** a production start with a test-domain administrator exits with a clear message; a freshly initialized production database contains exactly one account.

### P1-1 — Administrators can read any group's private chat unseen

- **Original severity:** P1.
- **Root cause:** joining a group is silent for everyone, and a joiner receives the full chat history.
- **Proposed correction (decision 1):**
  1. **Visible membership changes.** Every join, leave, removal and coordinator change writes a system line into the group chat ("Demo Owner joined the group"), visible to all members and kept with the chat. **New element:** message kind SYSTEM (migration M1).
  2. **Recorded.** Each of these also writes an audit entry (`group.member_joined`, `group.member_left`).
  3. **No earlier conversations for administrators.** For an account with the owner or administrator role, chat history, older-message paging and chat attachments start at that person's joining time. Rejoining starts a new boundary. An administrator who is a founding member of a group naturally sees it from its creation.
  4. **Labelled.** The member list and chat show "Administrator" next to staff accounts, so members always know who is present.
  5. **Support counts as before.** An administrator's support for an idea counts like any member's (they participate as ordinary members); if a group forms they appear as a founding member, which point 1 makes visible.
  6. **Exceptional moderation access** stays exactly what exists: the stored text of a message that a member reported. Opening and deciding a report is audited. The review page for a group that asked for review is limited to the proposal sections (it currently also loads shared notes).
  7. Ordinary members keep the current behaviour (full history on joining). Reason: the decision concerns administrative roles, and newcomers need context.
- **Affected files:** `prisma/schema.prisma` (M1); `src/server/community/groups.ts` (join, leave, remove, transfer, create); `src/realtime/chat-service.ts` (`history`, DTO); `src/realtime/server.ts`; `src/server/community/files.ts` (attachment access and lists); `src/components/community/chat.tsx` (render system lines); group overview and members pages (label); `src/app/admin/(panel)/groups/[id]/page.tsx`; `src/server/community/reports.ts`; community help page; `docs/ARCHITECTURE.md`.
- **Dependencies:** P2-5 (group lock) so the system line and membership change are written together.
- **Implementation risks:** system lines could be mistaken for member messages, or be editable or reportable. Mitigation: they have no author, are rendered differently, and are excluded from edit, delete, reply and report. Unread counters must not count them.
- **Required tests:** probe 11 reversed (join by an owner produces a system line, an audit entry, and no access to the earlier message); attachment of an earlier message refused; ordinary member still sees history; system lines not editable; browser test: member sees "joined" line live.
- **Acceptance criteria:** no administrator can read a chat message from before they joined; every membership change is visible in the chat and present in the audit log.

### P1-2 — Chat keeps working after the session is signed out

- **Original severity:** P1.
- **Root cause:** the chat server checks the person on every action but the session only once, when connecting.
- **Proposed correction:**
  1. Remember the session id on each chat connection.
  2. All session-ending paths go through one function that also publishes a "session ended" event; the chat server disconnects matching connections. Paths: sign out, end one session, sign out of other sessions, password change, password reset, email change, suspension, deactivation, role change, two-step setup (P1-5).
  3. Safety net: each connection re-checks its session once a minute and on every send, so a missed event cannot leave a connection open for long.
- **Affected files:** `src/lib/auth/session.ts`; `src/lib/realtime-events.ts`; `src/realtime/server.ts`; `src/app/(auth)/actions.ts`; `src/app/account/actions.ts`; `src/server/accounts.ts`.
- **Dependencies:** none.
- **Implementation risks:** disconnecting the user's own current tab on "sign out of other sessions". Mitigation: the event carries the session ids to end, never "all".
- **Required tests:** probe 12 reversed for each path; current session survives "sign out others".
- **Acceptance criteria:** within 5 seconds of any session-ending action, that session's chat connection is closed and a send is refused.

### P1-3 — Sign-in limits can be bypassed or used to lock everyone out

- **Original severity:** P1.
- **Root cause:** the visitor's address is read from a header the visitor controls; without it, all visitors share one counter.
- **Proposed correction:**
  1. `server.ts` determines the client address itself for every request and writes it into an internal header that it always overwrites: the connection's own address by default, or the address at the configured position of the forwarding chain when `TRUSTED_PROXY_HOPS` is set (1 for the documented Caddy setup).
  2. `clientIp()` reads only that internal header. The same value is used for the chat connection.
  3. The "unknown" shared counter disappears, because there is always an address.
  4. `docs/DEPLOYMENT.md`: the setting for Caddy and nginx.
- **Affected files:** `server.ts`; `src/lib/security.ts`; `src/lib/env.ts`; `.env.example`; `docs/DEPLOYMENT.md`; `tests/setup-mocks.ts`.
- **Dependencies:** none.
- **Implementation risks:** a wrong hop count behind a real proxy would make every visitor share the proxy's address. Mitigation: startup log line stating which source is used; documented check ("sign in from two networks, see two addresses in the audit log hashes").
- **Required tests:** unit tests for 0, 1 and 2 hops with spoofed chains; `scripts/audit/checks.ts` sections B and E rerun: B blocks after the limit, E no longer blocks a second network.
- **Acceptance criteria:** a made-up forwarding header from a direct client does not change the counter; two different networks never share a counter.

### P1-4 — An administrator can deactivate or reactivate owners and administrators

- **Original severity:** P1.
- **Root cause:** the rule exists in the page only.
- **Proposed correction (decision 6):** one server-side rule used by suspend, reactivate, deactivate and membership changes: only the owner may act on an owner or administrator account; nobody may act on their own account through the admin path. The last-owner protection stays.
- **Affected files:** `src/server/accounts.ts`; `src/app/admin/actions/community.ts`.
- **Dependencies:** none.
- **Implementation risks:** low. Self-deactivation from the account page must keep working (it uses a different path).
- **Required tests:** each of the four actions by an administrator on an owner and on another administrator is refused; owner is allowed; member self-deactivation still works.
- **Acceptance criteria:** every refused case returns "Only the owner can…" and changes nothing.

### P1-5 — Two-step verification can be set up without the password; older sessions survive

- **Original severity:** P1.
- **Root cause:** setup is not treated as a sensitive action.
- **Proposed correction:**
  1. Starting and confirming setup, regenerating recovery codes and turning it off all require a recent identity confirmation (sign-in itself counts for 10 minutes, so first-time forced setup is not interrupted).
  2. After setup is confirmed, all other sessions of that account are ended (through the P1-2 function).
  3. Recovery path: `scripts/create-admin.ts --reset-2fa <email>`, audited, usable only with server access.
- **Affected files:** `src/app/account/actions.ts`; `src/server/accounts.ts`; `scripts/create-admin.ts`; `docs/DEPLOYMENT.md`.
- **Dependencies:** P1-2.
- **Implementation risks:** an administrator whose 10 minutes ran out during forced setup is sent to "confirm it's you" and back; the return address must be the setup page (uses the P2-1 safe-redirect helper).
- **Required tests:** setup without recent confirmation redirects; other sessions ended after setup; command-line reset writes an audit entry and forces setup at next sign-in.
- **Acceptance criteria:** a session older than 10 minutes cannot attach an authenticator without the password; no session opened before setup remains valid.

### P1-6 — An administrator can delete compensation records

- **Original severity:** P1.
- **Root cause:** deletion cascades into financial records and is guarded by a weaker permission.
- **Proposed correction (decision 6):**
  1. Deleting a project and removing a participant record become owner-only (new permissions `projects.delete`, `participants.remove`, owner only).
  2. Migration M2: the database refuses to delete an assignment that has a compensation agreement. The owner must first remove or void the agreement in its own audited action.
  3. The audit entry for a deletion records what was removed (titles and counts, never amounts).
  4. The confirmation text states plainly what will be removed and that agreements block deletion.
- **Affected files:** `prisma/schema.prisma` (M2); `src/lib/auth/permissions.ts`; `src/app/admin/actions/projects.ts`; `src/app/admin/actions/participants.ts`; `src/server/admin/projects.ts`; `src/server/admin/participants.ts`; project and participant pages; `tests/phase1-unit.test.ts` (permission list).
- **Dependencies:** none.
- **Implementation risks:** other code paths that relied on the cascade (deleting an assignment, applicant erasure, retention) would now fail. Mitigation: each is reviewed and tested; erasure already refuses for participants.
- **Required tests:** administrator refused; owner refused while an agreement exists; owner succeeds after removing the agreement; retention and erasure tests still pass.
- **Acceptance criteria:** no agreement row can disappear except through an explicit, audited owner action.

### P1-7 — "Back up now" reports failure after success

- **Original severity:** P1.
- **Root cause:** the success redirect is issued inside the `try` block and caught as an error.
- **Proposed correction:** compute the result inside `try`/`catch`, redirect after it. Review the other admin actions for the same pattern.
- **Affected files:** `src/app/admin/actions/community.ts`.
- **Dependencies:** none.
- **Implementation risks:** none of note.
- **Required tests:** probe 10 reversed; a forced failure (unwritable folder) still shows the failure message and a failed job.
- **Acceptance criteria:** a successful manual backup shows "Backup written", and the job history shows success.

### P1-8 — Production settings are not checked at startup

- **Original severity:** P1.
- **Root cause:** settings are validated on first use, and only two of them.
- **Proposed correction:**
  1. `server.ts` validates settings before anything else and exits with a clear list of problems.
  2. In production, required: an https site address that is not local; email host and sender; organization contact address; backup encryption key (P2-22); two-step verification requirement on; `TRUSTED_PROXY_HOPS` set explicitly (P1-3).
  3. The health address returns "unavailable" when settings are invalid, without details.
  4. Launch checks from P0-1 and P2-20 run in the same place.
  5. `docs/DEPLOYMENT.md` corrected, including that the site address must be set when building.
- **Affected files:** `src/lib/env.ts`; `server.ts`; `src/app/api/health/route.ts`; `.env.example`; `docs/DEPLOYMENT.md`; `playwright.config.ts` and `scripts/perf-measure.ts` (they start production mode locally).
- **Dependencies:** P1-3, P2-22, P0-1, P2-20.
- **Implementation risks:** breaking the local production-mode test harness. Mitigation: the local-test switch remains but is honoured only for a local site address.
- **Required tests:** unit tests for each missing or invalid value; browser tests still start.
- **Acceptance criteria:** a production start with any required value missing exits non-zero and names the value.

### P1-9 — A coordinator who is suspended or loses access is never replaced

- **Original severity:** P1.
- **Root cause:** succession is tied to leaving a group, not to losing access.
- **Proposed correction:**
  1. When an account is suspended, or community access is paused or removed (including "suspend author" in moderation): in every group where that person is coordinator, the role passes to the longest-standing eligible member, who is notified; if nobody is eligible, the group is flagged for administrators. A system line records it (P1-1).
  2. **Paused** access or suspended account: the group membership row stays, but the person is not counted, not notified and not listed as active (P2-7). On reinstatement they return as an ordinary member; the role is not restored.
  3. **Removed** access: group memberships end, as already happens on deactivation.
  4. The succession routine demotes any stale coordinator rows, so a group can never show two.
- **Affected files:** `src/server/accounts.ts`; `src/server/community/groups.ts`; `src/server/community/reports.ts`; group overview page (coordinator notice).
- **Dependencies:** P2-5 (group lock), P2-7 (shared eligibility rule), P1-1 (system lines).
- **Implementation risks:** suspending someone who coordinates many groups runs several successions; done in one transaction per group so a failure in one does not block the suspension.
- **Required tests:** probes 1 and 2 reversed; reinstatement yields exactly one coordinator; no eligible member → flagged group.
- **Acceptance criteria:** immediately after suspension every affected group has exactly one eligible coordinator or is flagged; two coordinators can never occur.

### P1-10 — No version control

- **Original severity:** P1.
- Handled in Stage 0 (section 4, parts 0.1 to 0.4), where root cause, correction, affected files, dependencies, risks, tests and acceptance criteria are given.

---

## 6. Stage 2 — Medium-priority corrections

### P2-1 — Redirect to an outside website after "confirm it's you"

- **Original severity:** P2.
- **Root cause:** the address check rejects `//` but not `/\`.
- **Proposed correction:** one shared helper that resolves the address against the site's own origin and accepts it only if the origin matches. Used by sign-in, `/continue`, identity confirmation and every admin "return to" address.
- **Affected files:** new `src/lib/auth/safe-next.ts`; `src/app/(auth)/actions.ts`; `src/app/continue/page.tsx`; `src/app/account/actions.ts`; `src/app/admin/actions/*.ts`.
- **Dependencies:** none. **Risks:** a legitimate return address with a query string must still work.
- **Required tests:** unit tests for `//`, `/\`, encoded forms, control characters, absolute addresses; `checks.ts` section A rerun.
- **Acceptance criteria:** the crafted address lands on `/account`; no outside request is made.

### P2-2 — "Something went wrong" instead of "no permission"

- **Original severity:** P2.
- **Root cause:** a permission refusal is thrown as an ordinary error.
- **Proposed correction:** a signed-in member opening an admin page is sent to their own start page. An administrator opening a page they lack permission for sees a plain "You don't have permission for this page" inside the admin frame. Actions return the same sentence as a form message.
- **Affected files:** `src/lib/auth/guard.ts`; new `src/app/admin/(panel)/no-access/page.tsx`; `src/app/error.tsx` unchanged.
- **Dependencies:** none. **Risks:** tests that expect the thrown error must be updated.
- **Required tests:** member → redirect, status 200; administrator on an owner page → message; crawl shows no 500.
- **Acceptance criteria:** no permission refusal produces a 500 or an error-log entry at error level.

### P2-3 — Accepted but never given access; false "Approved" message

- **Original severity:** P2.
- **Root cause:** "already accepted" is derived from the application status alone, and nothing grants access later.
- **Proposed correction:** one function, "give access if this person has an accepted application and is eligible", called on approval, on re-approval, when an account is reactivated, when an email address is verified, and when an earlier application is linked. The success message is built from the real outcome: "can now enter", "will get access once their email is confirmed", or "account is suspended".
- **Affected files:** `src/server/admin/applications.ts`; `src/server/onboarding.ts`; `src/server/membership-application.ts`; `src/server/accounts.ts` (`reactivateUser`); `src/app/admin/actions/applications.ts`.
- **Dependencies:** none. **Risks:** must never restore access that an administrator deliberately removed; the function acts only when membership is "none".
- **Required tests:** accept while suspended → reactivate → access granted once; removed membership is not restored; messages match state.
- **Acceptance criteria:** no person with an accepted application and an active, verified account is left without access; the administrator's message always matches.

### P2-4 — Re-opening a declined application crashes when a new draft exists

- **Original severity:** P2.
- **Root cause:** the one-open-application rule is violated and the database error is not handled.
- **Proposed correction:** detect a newer application before the change, show "This applicant has started a new application", and hide the re-open choice on the page in that case. The database error is also caught as a second line of defence.
- **Affected files:** `src/server/admin/applications.ts`; application detail page.
- **Dependencies:** none. **Risks:** none of note.
- **Required tests:** the described sequence returns the message and changes nothing.
- **Acceptance criteria:** no error page in this sequence.

### P2-5 — Simultaneous leaves produce a database error

- **Original severity:** P2.
- **Root cause:** group membership changes do not lock the group row first.
- **Proposed correction:** a small helper that opens a transaction and locks the group row, used by join, leave, remove, transfer, admin assign, reopen and the P1-9 succession. One automatic retry if the database still reports a deadlock.
- **Affected files:** `src/server/community/groups.ts`; `src/server/community/access.ts`.
- **Dependencies:** none; required by P1-9 and P1-1.
- **Risks:** a lock held while sending notifications would slow things. Notifications stay outside the transaction, as now.
- **Required tests:** probes 3 and 4 reversed: 0 failed requests in 50 rounds each; member count and coordinator correct.
- **Acceptance criteria:** no deadlock error in the probes.

### P2-6 — Reopening an empty group is a dead end

- **Original severity:** P2.
- **Root cause:** reopening runs the succession routine, which archives a group without members.
- **Proposed correction:** reopening an empty group leaves it open and flagged for administrators. The first eligible person to join becomes coordinator and the flag clears. The admin page says so.
- **Affected files:** `src/server/community/groups.ts`; admin group page; `docs/ARCHITECTURE.md`.
- **Dependencies:** P2-5.
- **Risks:** an open group with nobody in it appears in "Explore". It is shown with a "needs a coordinator" note rather than hidden, so people can find and revive it.
- **Required tests:** probe 8 reversed.
- **Acceptance criteria:** a reopened empty group can be joined and gets a coordinator.

### P2-7 — People without community access remain active group members

- **Original severity:** P2.
- **Root cause:** several places test the account status only.
- **Proposed correction:** the single "active member" rule is used for notification recipients, group member counts and lists, coordinator eligibility, group creation, and the list of people who can be assigned to a project. Removal of access ends group memberships (P1-9).
- **Affected files:** `src/server/community/access.ts`; `notifications.ts`; `groups.ts`; `src/server/admin/projects.ts`; group members page.
- **Dependencies:** P1-9.
- **Risks:** member counts change for groups that contain such people. None exist in the real database today (integrity check).
- **Required tests:** paused person receives no group notification or email; not counted; not assignable; counted again after restoration.
- **Acceptance criteria:** the integrity check "active group memberships of people without community access" stays empty by construction.

### P2-8 — Supporter counter counts ineligible supporters

- **Original severity:** P2.
- **Root cause:** the displayed number and the deciding number are computed differently.
- **Proposed correction:** the stored counter becomes the eligible count. It is recalculated when someone supports or withdraws, and for the ideas a person supported when their eligibility changes. The same recalculation creates the group if the threshold is now met, and runs for open ideas when the threshold setting is changed.
- **Affected files:** `src/server/community/ideas.ts`; `src/server/accounts.ts`; `src/server/settings.ts`; idea page and cards.
- **Dependencies:** P2-7.
- **Risks:** lowering the threshold could create several groups at once. The settings page states how many ideas would qualify and asks for confirmation.
- **Required tests:** the audit scenario (A supports, A suspended, B supports) shows "1 of 2"; reinstating A creates the group; threshold change path.
- **Acceptance criteria:** the displayed number always equals the number used for the decision.

### P2-9 — Ideas can be rewritten after support

- **Original severity:** P2.
- **Root cause:** editing has no connection to support.
- **Proposed correction (decision 5):**
  1. **Revision history. New element:** table `IdeaRevision` (migration M4) storing the previous text, who changed it, when, and whether it was minor or material. Members see "Edited" with a link to the history.
  2. **Before any support:** editing is free; revisions are still recorded.
  3. **With support, no group yet:** when saving, the author states which it is.
     - *Minor correction* (wording, typos, clarity): support is kept. Supporters are notified with a link to the change and can withdraw.
     - *Material change* (business purpose, revenue model, scope, category): support is reset, former supporters are notified and asked to support again if they still agree. The page says so before saving.
  4. **After a group exists:** the idea accepts minor corrections only. The business direction now lives in the group's purpose.
  5. **Changing a group's direction:** the coordinator can change the purpose only together with a short "what changed and why" note. The system records it as a group decision (existing feature), posts an announcement and notifies all members; the previous purpose is kept in that record. The discussion itself happens in the group's existing discussion and chat. **No voting mechanism is added.**
  6. Misuse of "minor" is handled by transparency: the history is visible, supporters are notified, and the report button exists.
- **Affected files:** `prisma/schema.prisma` (M4); `src/server/community/ideas.ts`; `src/lib/validation/community.ts`; idea edit page and `idea-fields.tsx`; idea detail page (history); `src/server/community/groups.ts` (`updateGroupInfo`); `src/server/community/research.ts` (decision record); coordinator tools on the group page; community help page.
- **Dependencies:** P2-8 (counter), P1-1 (system lines optional for direction change).
- **Risks:** this is the largest item in the plan. Risk of over-building: kept to one table, one radio choice and one history view.
- **Required tests:** minor edit keeps support and notifies; material edit resets support and notifies; edit after group formed refuses a material change; purpose change without a note refused; purpose change creates decision, announcement and notifications; history shows each revision.
- **Acceptance criteria:** every change to a supported idea is recorded and visible; a material change never keeps earlier support; a group's purpose never changes without a recorded, announced decision.

### P2-10 — Meetings: wording and behaviour

- **Original severity:** P2.
- **Root cause:** meetings were built as shared links without a lifetime, and the wording predates the Google Meet decision.
- **Proposed correction (decision 2):**
  1. **Wording.** Every mention becomes "meetings through Google Meet": How It Works, the community help page, the meetings page, notifications, the meeting email text, admin labels, test names and documentation. One button, "Start a meeting"; the stored voice or video label is no longer asked for (existing records keep theirs).
  2. **Lifetime.** A meeting counts as ended four hours after it started; the daily job writes the end time. Any member can end a meeting older than one hour.
  3. **One at a time.** Migration M3 makes a second active meeting in the same group impossible.
  4. **Group state.** Archiving or suspending a group ends its meeting.
  5. **Verification** of creation, participation and access: existing tests plus new ones for points 2 to 4; non-members never receive the link.
- **Affected files:** `src/components/community/start-meeting.tsx`; `src/server/community/meetings.ts`; meetings page; `src/app/(site)/how-it-works/page.tsx`; `src/content/*`; community help page; notification and email text; `src/ops/scheduler.ts`; `prisma` (M3); `tests/e2e/phase1.spec.ts`.
- **Dependencies:** none.
- **Risks:** a long real meeting is shown as ended after four hours although the Google Meet call continues. The link stays in "Past meetings" for members, so nobody is locked out.
- **Required tests:** simultaneous starts → one meeting; expiry; end by any member after one hour; archive ends meeting; link refused for non-members.
- **Acceptance criteria:** no text promises built-in voice or video; no meeting is shown as "happening now" beyond four hours.
- **Needs an external service:** an actual Google Meet call between two people (founder check).

### P2-11 — Chat attachments visible or kept when they should not be

- **Original severity:** P2.
- **Root cause:** files and messages are handled separately.
- **Proposed correction:** group file lists show only attachments of sent messages; removing a file from the message box deletes it; removing a message (by its author, by moderation or by retention) removes its attachments; open chats are told when a message is removed; the daily job deletes unattached uploads older than 24 hours; a file can be attached only if it is still unattached at the moment of sending.
- **Affected files:** `src/components/community/chat.tsx`; `src/server/community/files.ts`; `src/realtime/chat-service.ts`; `src/server/community/reports.ts`; `src/ops/retention.ts`; `src/app/api/files/route.ts`.
- **Dependencies:** P1-1 (attachment boundary for administrators).
- **Risks:** deleting a file that a member meant to keep. Only unattached chat uploads are affected; research files are untouched.
- **Required tests:** unsent upload never listed; removed message's file returns "not found"; cleanup job; two simultaneous sends cannot share a file.
- **Acceptance criteria:** as in the audit.

### P2-12 — A notification clash can show an error after support was saved (suspected)

- **Original severity:** P2.
- **Root cause:** find-then-create on a unique key; follow-up actions share one failure path.
- **Proposed correction:** first write a stress test to reproduce it. Then make the notification write a single create-or-update, and run follow-up actions (notifications, audit, live update) independently so one failure is logged without hiding the others or the result.
- **Affected files:** `src/server/community/notifications.ts`; `src/server/community/ideas.ts`.
- **Dependencies:** none. **Risks:** none of note.
- **Required tests:** 20 simultaneous supports on one idea: no error, one group, all notices, one audit entry.
- **Acceptance criteria:** the stress test passes 20 runs in a row. If the fault cannot be reproduced, the hardening is still applied and the finding is closed as "not reproduced, hardened".

### P2-13 — Administrator role holds owner-level powers

- **Original severity:** P2.
- **Root cause:** permissions grew feature by feature.
- **Proposed correction (decision 6):**

  | Power | Owner | Administrator | Change |
  |---|---|---|---|
  | Appoint or remove administrators; ownership | Yes | No | none |
  | Organization settings, retention periods, security settings | Yes | No | none |
  | Compensation: view, record, authorize | Yes | No | none |
  | Backups, restore, run retention, erase a person | Yes | No | none |
  | Delete a project; remove a participant record | Yes | **No** | P1-6 |
  | Act on owner or administrator accounts | Yes | **No** | P1-4 |
  | Download all applications as a file | Yes | **No (proposed)** | see below |
  | Applications, members, moderation, groups, projects (edit), inquiries, email sending | Yes | Yes | none |
  | Public website content | Yes | Yes | none (audit recommendation withdrawn) |

  The bulk download is the one item decision 6 does not name. It is proposed as owner-only because it removes every applicant's personal details from the system in one step and the architecture document already calls exports owner-only. **To confirm at approval.** If the founder prefers administrators to keep it, the only change is that drafts are excluded (P2-14).
- **Affected files:** `src/lib/auth/permissions.ts`; export route; `tests/phase1-unit.test.ts`; `docs/ARCHITECTURE.md`.
- **Dependencies:** P1-4, P1-6.
- **Risks:** none; no administrator account exists today.
- **Required tests:** the permission test lists every owner-only power; route refuses an administrator.
- **Acceptance criteria:** the table above is true in code and in the documentation.

### P2-14 — Personal-data exports incomplete or too broad

- **Original severity:** P2.
- **Root cause:** the export follows the older participant link.
- **Proposed correction:** a person's own export finds their applications through their account and includes their own compensation agreements. The applications file never includes drafts and uses the submission date.
- **Affected files:** `src/server/privacy.ts`.
- **Dependencies:** none. **Risks:** none of note.
- **Required tests:** waitlisted applicant's export contains the application; file contains no draft; date column correct.
- **Acceptance criteria:** as in the audit.

### P2-15 — Email change may report success while rolled back (suspected)

- **Original severity:** P2.
- **Root cause:** an error is swallowed inside a transaction.
- **Proposed correction:** write the reproducing test first. Then check for a conflicting earlier application record before the update, show "That address is already in use", and remove the swallowed error.
- **Affected files:** `src/server/onboarding.ts`.
- **Dependencies:** none. **Risks:** none.
- **Required tests:** change to an address held by an earlier application → clear message, account unchanged, sessions kept.
- **Acceptance criteria:** the screen never claims a change that was not saved.

### P2-16 — The site reveals which addresses have accounts; anyone can lock an account

- **Original severity:** P2.
- **Root cause:** email is sent before answering; the lock has its own message and is per account only.
- **Proposed correction:**
  1. "Forgot password" and "resend confirmation" answer first and send the email afterwards, so both cases take the same time. Delivery is still logged.
  2. A locked account answers with the same "Invalid email or password".
  3. The lock is keyed to account plus network, so one outsider cannot lock a person who signs in from elsewhere. The per-account ceiling stays as a backstop.
  4. Wrong two-step codes count toward the same limits.
- **Affected files:** `src/server/accounts.ts`; `src/server/onboarding.ts`; `src/lib/auth/service.ts`.
- **Dependencies:** P1-3 (a trustworthy network address).
- **Risks:** an email failure after the answer is no longer visible to the visitor. It is already the case that the visitor is told nothing specific; the admin email log shows it.
- **Required tests:** timing difference under a small bound in the local test; identical messages; a second network can still sign in while the first is locked.
- **Acceptance criteria:** `checks.ts` sections C and D show no distinguishable difference.

### P2-17 — The admin area describes the same people in three places

- **Original severity:** P2.
- **Root cause:** each feature added its own list.
- **Proposed correction (simplification, not redesign; every function remains):**
  1. **One person page.** The existing member page shows the four facts with plain labels (Account, Email, Community access, Application) and links to the application and the project record. The role label "Member" is shown as "Account type: Member" so it cannot be read as "is a member".
  2. **Members list** shows approved members by default, with tabs: Members, Applicants, Staff, All. Its description matches what it lists.
  3. **Menu from 16 to 12 entries,** by moving, not removing:
     - Participants → a tab inside Projects ("People on projects").
     - Ideas → a tab inside "Moderation".
     - Backups → a tab inside "Privacy & data".
     - Administrators → the "Staff" tab of Members (owner only).
  4. **Overview.** A "Waiting for you" block first (applications received, open reports, groups ready for review, emails that failed, open inquiries), each linking to a list with the same number. Counters reduced to those that match a list. "New applications" becomes "Received".
- **Affected files:** `src/app/admin/(panel)/layout.tsx`, `admin-nav.tsx`, `page.tsx`; `members/`, `participants/`, `projects/`, `ideas/`, `reports/`, `backups/`, `privacy/`, `admins/` pages; `src/server/admin/applications.ts` (`getOverviewStats`); browser tests that click the menu.
- **Dependencies:** P2-2 (no-permission page), P2-13.
- **Risks:** the largest visual change in the plan. Old addresses must keep working (redirects), so bookmarks and email links do not break.
- **Required tests:** every old admin address still resolves; counters equal list totals; browser test of the menu; crawl of all admin pages.
- **Acceptance criteria:** one person's complete state is visible on one page; every counter equals the list it opens; no contradictory label.

### P2-18 — The organization's name comes from two places

- **Original severity:** P2.
- **Root cause:** editable content and a server setting both hold the name.
- **Proposed correction:** the server setting is the only source (an organization-wide setting, owner-controlled under decision 6). The content editor shows the name read-only. Remaining fixed strings are replaced. The email header gets a neutral name; the delivery webhook accepts both the old and new header names.
- **Affected files:** `src/config/brand.ts`; `src/lib/content/schema.ts`; `(site)/layout.tsx`, `privacy`, `terms`; `src/lib/email/index.ts`, `webhook.ts`; `src/app/admin/actions/community.ts`; `src/ops/backup.ts`; content admin page.
- **Dependencies:** none.
- **Risks:** a name saved earlier in content is no longer used; it is left in the database untouched.
- **Required tests:** changing the setting changes header, footer, emails and sign-in pages; a search of the source finds no fixed organization name outside defaults.
- **Acceptance criteria:** one change, one place, everywhere.

### P2-19 — Public revenue explanation leaves out fees and expenses

- **Original severity:** P2.
- **Root cause:** the policy was undecided.
- **Proposed correction (decision 3):** the Pay & Fairness page and the diagram state:
  - Revenue received from a customer for a project is disclosed to the participants of that project.
  - Project expenses, any organizational fee, and each person's compensation are agreed in writing before commercial work begins. There is no fixed organizational percentage.
  - Distribution follows actual contributions and those agreements. There are no undisclosed deductions, no mandatory investments, no membership fees and no guaranteed income.
  The same wording goes into the FAQ answer and `docs/legal/revenue-distribution-policy.md`, which is marked as reflecting this decision and still awaiting legal review. No amounts, percentages or examples are published.
- **Affected files:** `src/components/visuals/revenue-flow.tsx`; `src/content/*` (compensation, FAQ); `docs/legal/revenue-distribution-policy.md`; `docs/FINANCIAL-TRANSPARENCY.md`; `tests/unit.test.ts` (honesty guards).
- **Dependencies:** founder approval of the exact sentences (they will be presented before being applied).
- **Risks:** legal wording. Mitigation: kept factual, flagged for legal review.
- **Required tests:** the honesty tests gain checks that the page mentions disclosure and prior agreement and contains no percentage.
- **Acceptance criteria:** public wording matches decision 3 word for meaning.

### P2-20 — Placeholders and legal drafts visible publicly

- **Original severity:** P2.
- **Root cause:** founder information not yet supplied.
- **Proposed correction:**
  1. The founder supplies: legal name, jurisdiction, public contact address, and the legally reviewed texts for the bracketed passages (legal basis, processors, data location, liability, intellectual property, classification, rules version date).
  2. Until then nothing is invented. A "Before launch" list on the admin overview shows each remaining placeholder with the page it appears on.
  3. Production startup refuses to run while legal name, jurisdiction or contact address are empty (P1-8) and logs a prominent warning while any text placeholder remains.
- **Affected files:** `src/components/ui/primitives.tsx`; contact, privacy, terms, community-rules pages; admin overview; `src/ops/launch-checks.ts`.
- **Dependencies:** founder input; P1-8.
- **Risks:** none in code. The content itself cannot be completed by development.
- **Required tests:** the list finds every placeholder; startup check.
- **Acceptance criteria:** no bracketed placeholder on a production build.

### P2-21 — Local mail label applies in production

- **Original severity:** P2.
- **Root cause:** "local host" is treated as "test inbox".
- **Proposed correction:** the test-inbox status and wording apply only outside production. The admin page text uses the same guarded function as the public page.
- **Affected files:** `src/lib/email/status.ts`; `src/lib/email/index.ts`; `src/app/admin/(panel)/email/page.tsx`.
- **Dependencies:** none. **Risks:** none.
- **Required tests:** production mode with a local host → "Accepted by provider", retry available, no test-inbox text.
- **Acceptance criteria:** as in the audit.

### P2-22 — Backups weakly protected by default

- **Original severity:** P2.
- **Root cause:** safe defaults not enforced.
- **Proposed correction:**
  1. Backup encryption key required in production (P1-8).
  2. Backups page states where files are, whether they are encrypted, when the last successful run was, and that uploaded files are a separate folder that must be copied too.
  3. `docs/DEPLOYMENT.md`: off-site copy procedure for both (Stage 0.4, option C).
  4. First verify the suspected job-lock fault with a test; then run the lock, the job and the unlock on one dedicated connection.
  5. Not done: streaming (see section 2).
- **Affected files:** `src/lib/env.ts`; `src/ops/scheduler.ts`; `src/ops/backup.ts`; backups page; `docs/DEPLOYMENT.md`.
- **Dependencies:** P1-7, P1-8.
- **Risks:** a lost encryption key makes backups unreadable. The deployment guide says where to keep it.
- **Required tests:** lock released after a run; two schedulers → one run; production without key refused.
- **Acceptance criteria:** production backups are always encrypted; job history shows one run per day in a multi-day local test with a shortened interval.

### P2-23 — Founder's test records in the real database

- **Original severity:** P2.
- **Root cause:** testing took place in the database named for real use.
- **Proposed correction (decision 4):** nothing is deleted. The environments are defined and documented:

  | Environment | Database | Purpose |
  |---|---|---|
  | Development | `cowork` (existing, keeps all current records) | The founder's and developer's working copy |
  | Demonstration | `cowork_demo` | Fictional people for showing the site |
  | Automated tests | `cowork_test`, `cowork_e2e` | Wiped by the tests |
  | Production | new, empty, created at launch | One legitimate owner and default settings only |

  The development database is described as such in the README and `.env.example`, so it is never mistaken for production. The old WIN1252 copy and the `cowork_restore_test` scratch database are listed for the founder; they are removed only on explicit approval.
- **Affected files:** `README.md`; `.env.example`; `docs/DEPLOYMENT.md`; `scripts/dev-db.ts` (comments only).
- **Dependencies:** P0-1.
- **Risks:** none; documentation and procedure only.
- **Required tests:** the "first production start" checklist is executed once locally against a scratch database and yields exactly one account.
- **Acceptance criteria:** written environment table; verified clean-start procedure; no existing record changed.

### P2-24 — Upload size limit may be avoidable (suspected)

- **Original severity:** P2.
- **Root cause:** the limit is applied to a declared length that a request can omit.
- **Proposed correction:** reproduce first. Then refuse uploads without a declared length and stop reading at the limit.
- **Affected files:** `src/app/api/files/route.ts`; `src/server/community/files.ts`.
- **Dependencies:** none. **Risks:** some browsers or proxies send uploads without a length; verified with Edge and through the documented proxy setting.
- **Required tests:** oversized upload with and without a declared length is refused without the server's memory growing by the upload size.
- **Acceptance criteria:** as in the audit.

### P2-25 — Limits and caches live in one process's memory

- **Original severity:** P2.
- **Root cause:** deliberate choice for one small server.
- **Proposed correction:** keep the design. Clean expired counters periodically (attempt limits and chat limits). At startup, take a database-level lock that a second instance cannot take; the second instance logs a clear warning and exits in production.
- **Affected files:** `src/lib/rate-limit.ts`; `src/realtime/server.ts`; `server.ts`.
- **Dependencies:** none.
- **Risks:** a crashed instance must not block a restart; the lock is tied to the connection and vanishes with it.
- **Required tests:** counters are removed after their window; a second instance refuses to start.
- **Acceptance criteria:** memory use stays flat in a long local run; two instances cannot run against one database.

---

## 7. Stage 3 — Low-priority corrections and visual refinement

Objective: visually clean, professional, intuitive, consistent. No new pages except the two small ones named (site icon, loading placeholders).

### P3-1 — No site icon

- **Severity:** P3. **Root cause:** never added.
- **Correction:** an icon made from the existing logo mark (no outside image), plus the touch icon.
- **Files:** `src/app/icon.svg`, `src/app/apple-icon.png`. **Dependencies:** none. **Risks:** none.
- **Tests:** `/favicon.ico` or `/icon.svg` returns 200; crawl shows no console 404.
- **Acceptance:** the browser tab shows the mark.

### P3-2 — No loading indicators

- **Severity:** P3. **Root cause:** not built.
- **Correction:** one simple placeholder for each main area (community, admin, applicant pages), in the existing card style. Buttons already show "Saving…".
- **Files:** `loading.tsx` in `community/(portal)`, `admin/(panel)`, `(applicant)`. **Dependencies:** none.
- **Risks:** a flash on fast loads; the placeholder appears only after a short delay.
- **Tests:** browser test with an artificially slowed page shows the placeholder.
- **Acceptance:** a slow page never shows a blank area.

### P3-3 — Public pages repeat each other

- **Severity:** P3. **Root cause:** content grew page by page.
- **Correction:** prepare a cut list (which repeated blocks to remove from which page) and present it for approval. Apply only what is approved. No layout change, no new section.
- **Files:** `src/content/*`, `src/app/(site)/*`. **Dependencies:** P2-19, P2-10 wording done first.
- **Risks:** removing a statement that a legal or honesty test requires; the content tests run after every cut.
- **Tests:** honesty and FAQ tests; browser test of public pages; crawl.
- **Acceptance:** each fact has one main place; the founder approved every removal.

### P3-4 — Approved member sees "Application Not Started"

- **Severity:** P3. **Root cause:** the status page assumes every member applied.
- **Correction:** a person with community access and no application sees "You are a member" with one button to the community. Administrators are sent to the admin area.
- **Files:** `src/app/(applicant)/application/page.tsx`, `src/lib/auth/destination.ts`. **Dependencies:** none. **Risks:** none.
- **Tests:** member without application; owner.
- **Acceptance:** no "Start my application" for anyone who already has access.

### P3-5 — "Accepted" text under a "paused" notice

- **Severity:** P3. **Root cause:** two independent messages.
- **Correction:** the status page shows one state, chosen in a fixed order: account problem, access paused or removed, then application status.
- **Files:** `application/page.tsx`. **Dependencies:** P2-3 (messages). **Risks:** none.
- **Tests:** each combination of application status and access renders one message.
- **Acceptance:** no page shows two statements that contradict each other.

### P3-6 — Filter boxes cut off their text

- **Severity:** P3. **Root cause:** fixed widths.
- **Correction:** the dropdowns size to their longest option; the row wraps instead of squeezing.
- **Files:** `src/app/community/(portal)/page.tsx`, `groups/page.tsx`, `src/components/forms/fields.tsx`. **Dependencies:** none. **Risks:** none.
- **Tests:** screenshot comparison at 1366 and 390 px.
- **Acceptance:** full labels visible at both widths.

### P3-7 — Four places to talk

- **Severity:** P3. **Root cause:** each serves a different audience, but the labels do not say so.
- **Correction:** keep all four (see section 2). Each gets one explanatory line: "Chat: live, members only", "Discussions: open to the whole community", "Announcements: from the coordinator", "Comments: about the idea, before a group exists". Announcements are shown in one place only (Overview), with a link from Discussions.
- **Files:** `group-tabs.tsx`, discussions and overview pages, help page. **Dependencies:** none. **Risks:** none.
- **Tests:** browser test of labels.
- **Acceptance:** a member can tell from the page who will see what they write.

### P3-8 — Three accessibility issues

- **Severity:** P3. **Root cause:** missed in review.
- **Correction:** label for the chat file input; underline for the in-text links on the two admin pages. Add the crawl's accessibility check to the browser tests for every page pattern, so new issues are caught.
- **Files:** `chat.tsx`, `admin/(panel)/inquiries/page.tsx`, `privacy/page.tsx`, `tests/e2e/phase1.spec.ts`. **Dependencies:** none. **Risks:** none.
- **Tests:** axe on all crawled patterns: 0 serious or critical.
- **Acceptance:** as stated. A real screen-reader pass remains outside this plan (needs a person).

### P3-9 — Admin lists cramped on a phone

- **Severity:** P3. **Root cause:** desktop-first layout.
- **Correction:** on small screens the filters collapse behind a "Filters" control and the table shows name, status and one action; the rest is on the detail page.
- **Files:** `admin/(panel)/applications/page.tsx`, `members/page.tsx`, `src/components/admin/ui.tsx`. **Dependencies:** P2-17.
- **Risks:** none.
- **Tests:** screenshot at 390 px; first result visible without scrolling.
- **Acceptance:** as stated.

### P3-10 — Email page order and duplicated sentence

- **Severity:** P3. **Root cause:** order of sections.
- **Correction:** order becomes settings summary, delivery log, templates (collapsed). The duplicated sentence in the "Application declined" description is fixed.
- **Files:** `admin/(panel)/email/page.tsx`, `src/lib/email/templates.ts`. **Dependencies:** P2-21 (same page). **Risks:** none.
- **Tests:** browser check.
- **Acceptance:** the log is visible on opening the page.

### P3-11 — Lists limited to the latest 100 to 200

- **Severity:** P3. **Root cause:** not built.
- **Correction:** an "Older" link (page by page) on the audit log, inquiries and email log; one filter each (action type, status, status). Nothing more.
- **Files:** the three admin pages and their queries. **Dependencies:** P2-17 (menu changes first). **Risks:** none.
- **Tests:** a record older than the first page can be reached.
- **Acceptance:** as stated.

### P3-12 — Notification order and dead links

- **Severity:** P3. **Root cause:** sorted by last change.
- **Correction:** sort by creation time. A notification whose target was removed opens a short "This is no longer available" page instead of "not found".
- **Files:** `src/server/community/notifications.ts`, notifications page, `not-found.tsx` for the community area. **Dependencies:** none. **Risks:** none.
- **Tests:** marking read does not reorder; removed idea → friendly page.
- **Acceptance:** as stated.

### P3-13 — New member sees all history as unread

- **Severity:** P3. **Root cause:** no starting point at joining.
- **Correction:** joining marks the chat as read up to that moment. Also replaces the one-query-per-group unread count on "My Groups" with a single query.
- **Files:** `src/server/community/groups.ts`, `group-page.ts`. **Dependencies:** P1-1. **Risks:** none.
- **Tests:** unread is 0 right after joining and 1 after the next message.
- **Acceptance:** as stated.

### P3-14 — One-click actions that cannot be undone

- **Severity:** P3. **Root cause:** no confirmation step.
- **Correction:** "Close idea", "Make coordinator" and "Remove member" ask for confirmation in the existing expand-to-confirm style. A removed member is notified. An administrator can lift a removal on the admin group page (audited), so "can never rejoin" is no longer permanent.
- **Files:** idea page, group members page, coordinator tools, `groups.ts`, admin group page. **Dependencies:** P1-1 (system line for removal).
- **Risks:** none.
- **Tests:** each action needs the confirmation; removal notifies; lifted removal allows rejoining.
- **Acceptance:** as stated.

### P3-15 — Actions that fail silently

- **Severity:** P3. **Root cause:** errors are ignored.
- **Correction:** each of the listed actions returns a short message shown in the existing banner. A bad group id shows "Group not found" instead of an error page.
- **Files:** `src/app/community/actions.ts`. **Dependencies:** P3-18 (message codes). **Risks:** none.
- **Tests:** a forced failure of each action shows a message.
- **Acceptance:** as stated.

### P3-16 — Leftovers from the earlier invitation flow

- **Severity:** P3. **Root cause:** the flow was replaced.
- **Correction:** dependency check first (search and tests) for each item. Expected result:
  - **Remove:** the unused `confirmEmailChange`; the unused `sendInvitationAction` and the member-page link "Send a new invitation"; the `/invite` page that only redirects; the unused `finance.view` permission; the unreachable `IDEA_ATTACHMENT` branch.
  - **Keep:** activation links, the activation page and the "Account activation invitation" template, because administrator invitations use them. The template description is corrected to say so.
  - `sendInvitation` itself is kept only if administrator invitations call it; if kept, it refuses suspended and deactivated accounts.
- **Files:** `src/server/accounts.ts`, `members/[id]/page.tsx`, `applications/[id]/invite/`, `permissions.ts`, `files.ts`, `templates.ts`. **Dependencies:** none.
- **Risks:** removing something still used. Mitigated by the check and the full test run after each removal.
- **Tests:** all existing tests; type check finds no dangling reference.
- **Acceptance:** no dead link; no unused exported function among those listed.

### P3-17 — Confirmation link signs in without the second step; address in the URL

- **Severity:** P3. **Root cause:** convenience.
- **Correction:** if the account has two-step verification, confirming the email leads to the sign-in page instead of signing in. The "check your email" page takes the address from a short-lived cookie instead of the page address.
- **Files:** `src/app/(auth)/actions.ts`, `verify-email/page.tsx`. **Dependencies:** P1-2 (session handling). **Risks:** the cookie must not break the "resend" and "correct address" forms.
- **Tests:** existing verification tests plus the two-step case.
- **Acceptance:** no email address appears in any page address.

### P3-18 — Banners show any text from the address

- **Severity:** P3. **Root cause:** messages passed as free text in the URL.
- **Correction:** messages are sent as short codes from a fixed list and translated to text on the page. Unknown codes show nothing.
- **Files:** a small shared message list; `application/page.tsx`, `account/security/page.tsx`, admin pages and their actions. **Dependencies:** done together with P3-15 and P2-2.
- **Risks:** many call sites; done mechanically with tests on each page.
- **Tests:** a made-up message in the address is not displayed.
- **Acceptance:** as stated.

### P3-19 — Small sign-in hardening gaps

- **Severity:** P3. **Root cause:** inconsistent rules.
- **Correction:** one shared email rule for sign-up, address change and administrator invitation; a limit on wrong current-password attempts when changing a password; administrator sessions end after 60 minutes without activity (setting, owner-controlled).
- **Files:** `src/lib/validation/*`, `src/server/accounts.ts`, `src/lib/auth/session-core.ts`, `env.ts`. **Dependencies:** P1-3.
- **Risks:** an idle timeout could interrupt long form work; saving a form counts as activity.
- **Tests:** unit tests for each.
- **Acceptance:** as stated.

### P3-20 — Advisories in build tooling

- **Severity:** P3. **Root cause:** upstream packages.
- **Correction:** check for a fixed Prisma release at the start of Stage 3 and update within the same major version if one exists; otherwise record the review (not reachable by visitors) and recheck before launch. `npm audit fix --force` is not used.
- **Files:** `package.json`, `package-lock.json`. **Dependencies:** none. **Risks:** a Prisma update can change generated code; the full test suite runs before and after.
- **Tests:** full suite.
- **Acceptance:** `npm audit` is clean, or the remaining items are written down with the reason.

### P3-21 — Documentation out of date

- **Severity:** P3. **Root cause:** documents not updated with code.
- **Correction:** correct the four known lines, and update each document touched by this plan in the same commit as its code change (architecture: administrators and chat, coordinator succession, permissions; onboarding: scrypt; deployment: startup checks, proxy setting, first production start, backups).
- **Files:** `docs/*.md`, `README.md`, the comment in `groups.ts`. **Dependencies:** every code change that a document describes. **Risks:** none.
- **Tests:** a final read-through in Stage 4 against the behaviour.
- **Acceptance:** no statement in the documents contradicts the code.

### P3-22 — One browser test failed once under load

- **Severity:** P3. **Root cause:** not established.
- **Correction:** run the browser tests 10 times in a row with a deliberate background load, with tracing on. If it recurs, fix the cause (most likely a click before the page became interactive); if not, record it as not reproduced. The P2-16 change (answer first, send afterwards) also shortens this exact step.
- **Files:** `tests/e2e/phase1.spec.ts`, possibly `action-form.tsx`. **Dependencies:** P2-16. **Risks:** none; if a real cause is found it is fixed as its own small change.
- **Tests:** the 10 runs.
- **Acceptance:** 10 consecutive passes under load.

### P3-23 — No overview of compensation agreements

- **Severity:** P3. **Root cause:** not built; agreements are reachable only inside each project.
- **Decision in this plan:** **deferred, no change.** It would be a new screen, and decision 3 is met by the existing per-project records. See section 2.
- **Files:** none. **Dependencies:** none. **Risks:** the owner must open each project to see its agreements; acceptable while no real project exists.
- **Tests:** none.
- **Acceptance:** the founder confirms the deferral, or asks for it explicitly later.

### Housekeeping items noted in the audit without an ID

| Item | Correction |
|---|---|
| The Privacy admin page writes a job record on every view | Preview no longer writes a record |
| Test-database safety check matches "test" anywhere in the connection text | Check the database name only |
| Inline scripts allowed by the security header; HSTS preload announced from the first deployment | Leave the header as required by the framework; send HSTS without "preload" until the domain is settled |
| A recipient address can appear in an error log line | Log the failure kind and delivery id only |
| Old WIN1252 copy and `cowork_restore_test` scratch database | Listed for the founder; removed only on approval |
| Comment counters never decrease after a deletion | Recalculate on deletion |

---

## 8. Stage 4 — Comprehensive final verification

### 8.1 Retest of every finding

- Each of the 59 findings is re-checked against its acceptance criterion and recorded in a table: ID, method (test name, probe, browser check), result, evidence.
- The 12 probes in `tests/audit-probe.test.ts` are rewritten as ordinary tests that assert the corrected behaviour and join the normal test run.
- `scripts/audit/checks.ts` (redirect, limits, timing, lock messages) is rerun.
- `scripts/audit/integrity.ts` is rerun on the development database and must report the same or better.

### 8.2 Existing essential functionality

| Check | Pass condition |
|---|---|
| Type check and lint | 0 errors |
| Unit and integration tests | All pass (134 existing plus the new ones) |
| Browser tests on a production build | All pass, 3 consecutive runs |
| Page crawl as five users, desktop and phone | No error page, no console error, no overflow, 0 serious accessibility issues |
| Performance measurement (`npm run perf:measure`) | Query counts not worse than the recorded "after" figures by more than a small margin; reasons noted where a correction adds a query |

### 8.3 The complete experience, role by role

A written walkthrough with screenshots for each:

| Role | Path |
|---|---|
| Visitor | Every public page; wording about meetings and revenue; contact form |
| Applicant | Register, confirm, apply, status, interview, waitlist, decline, re-apply, approval, sign-in, password recovery, email outage |
| Approved member | Navigate, profile, propose idea, minor and material edit, comment, support, notifications, discover, join, leave |
| Group member and coordinator | Chat between two sessions, system lines, meeting start and expiry, notes, tasks, file upload, decision, purpose change, coordinator transfer, coordinator suspended |
| Administrator (not owner) | Applications, members, moderation, content; each owner-only action refused with a clear message; joins a group and sees no earlier chat |
| Owner | Everything above plus settings, administrators, compensation, backup now, restore into a scratch database, retention preview |

The items the audit could not exercise in a browser (profile editing, file upload, recording a decision, coordinator transfer, content saving, administrator invitation, running retention, deleting a project) are included here explicitly.

### 8.4 Locally verified versus needing production or outside services

| Area | Verified locally in Stage 4 | Needs production infrastructure or an outside service |
|---|---|---|
| Sign-in, sessions, permissions, chat | Yes | Secure cookies and WebSockets through a real HTTPS proxy |
| Client-address handling | Unit tests and a local proxy simulation | The real proxy's hop count |
| Email | Every template to the local test inbox; failure handling | Real delivery, bounces, Resend webhook |
| Meetings | Link creation, access, expiry | A real Google Meet call |
| Backups | Create, encrypt, restore, job lock | Off-site copy |
| Startup checks | Each refused configuration | The real production values |
| Legal texts | Placeholders listed | Legal review and the founder's facts |
| Accessibility | Automated checks | A real screen reader; physical phones |
| Load | Small local stress tests | Many simultaneous real users |

### 8.5 Final report

`docs/CORRECTIVE-IMPLEMENTATION-REPORT.md`: the retest table, what was changed per finding, what was deliberately not changed, and what remains for launch.

---

## 9. Points that need the founder's explicit approval or input

| # | Point | When |
|---|---|---|
| 1 | This plan as a whole | Before Stage 0 |
| 2 | External backup option (A, B or C in 0.4) | End of Stage 0 |
| 3 | Each database migration M1 to M4 (after its backup is verified) | Stages 1 and 2 |
| 4 | Whether the bulk applications download becomes owner-only (P2-13) | Before Stage 2 |
| 5 | Exact sentences for the revenue explanation (P2-19) | Stage 2 |
| 6 | Legal name, jurisdiction, contact address, reviewed legal passages (P2-20) | Any time before launch |
| 7 | Cut list for public pages (P3-3) | Stage 3 |
| 8 | Deferral of the compensation overview (P3-23) | With this plan |
| 9 | Removing the old WIN1252 copy and the scratch restore database | Optional, any time |

**Existing rows that could be touched, each only with approval:**

- M3: if two active meetings exist in one group, the older is marked ended. (None exist in the development database today.)
- P2-8: supporter counters are recalculated to the eligible count. (No value changes today; all supporters are eligible.)
- P2-18: nothing is deleted; a stored display name in content simply stops being used.

---

## 10. Coverage: all 59 findings

Size is a rough indication of work: S (hours), M (about a day), L (several days).

| ID | Severity | Stage | Size | Short description of the correction |
|---|---|---|---|---|
| P0-1 | P0 | 1 | S | Clean production start; block test-domain staff in production |
| P1-1 | P1 | 1 | L | Visible membership changes; no earlier chat for administrators |
| P1-2 | P1 | 1 | M | End chat connections with their session |
| P1-3 | P1 | 1 | M | Client address from the server, not from the visitor |
| P1-4 | P1 | 1 | S | Owner-only actions on staff accounts |
| P1-5 | P1 | 1 | S | Two-step setup needs recent confirmation; other sessions ended |
| P1-6 | P1 | 1 | M | Owner-only deletion; agreements block deletion |
| P1-7 | P1 | 1 | S | Backup button reports correctly |
| P1-8 | P1 | 1 | M | Settings checked at startup |
| P1-9 | P1 | 1 | M | Coordinator replaced on suspension or loss of access |
| P1-10 | P1 | 0 | S | Version control, exclusions, verified backup |
| P2-1 | P2 | 2 | S | One safe-redirect helper |
| P2-2 | P2 | 2 | S | "No permission" page instead of an error |
| P2-3 | P2 | 2 | M | Access granted whenever eligibility is reached; truthful message |
| P2-4 | P2 | 2 | S | Clear message when a newer application exists |
| P2-5 | P2 | 2 (done early) | S | Group lock for membership changes |
| P2-6 | P2 | 2 | S | Reopened empty group can be joined |
| P2-7 | P2 | 2 | M | One "active member" rule everywhere |
| P2-8 | P2 | 2 | M | Counter shows eligible supporters; re-evaluation |
| P2-9 | P2 | 2 | L | Revision history; minor or material; group direction changes recorded |
| P2-10 | P2 | 2 | M | Google Meet wording; one button; expiry; one active meeting |
| P2-11 | P2 | 2 | M | Attachments follow their messages |
| P2-12 | P2 | 2 | S | Notification write hardened; follow-up actions independent |
| P2-13 | P2 | 2 | S | Permission table per decision 6 |
| P2-14 | P2 | 2 | S | Complete self-export; no drafts in the file |
| P2-15 | P2 | 2 | S | Email change conflict handled |
| P2-16 | P2 | 2 | M | Same time and same message for known and unknown addresses |
| P2-17 | P2 | 2 | L | One person page; menu 16 → 12; "Waiting for you" |
| P2-18 | P2 | 2 | S | One source for the organization's name |
| P2-19 | P2 | 2 | S | Revenue wording per decision 3 |
| P2-20 | P2 | 2 | S | "Before launch" list; startup check; founder supplies facts |
| P2-21 | P2 | 2 | S | Test-inbox label only outside production |
| P2-22 | P2 | 2 | M | Encryption required; job lock fixed; off-site procedure |
| P2-23 | P2 | 2 | S | Environments documented; clean production procedure |
| P2-24 | P2 | 2 | S | Upload limit enforced while reading |
| P2-25 | P2 | 2 | S | Counter cleanup; single-instance lock |
| P3-1 | P3 | 3 | S | Site icon |
| P3-2 | P3 | 3 | S | Loading placeholders |
| P3-3 | P3 | 3 | M | Remove approved repeated blocks |
| P3-4 | P3 | 3 | S | Member state on the status page |
| P3-5 | P3 | 3 | S | One status message at a time |
| P3-6 | P3 | 3 | S | Dropdown widths |
| P3-7 | P3 | 3 | S | Labels for the four places to talk (no merging) |
| P3-8 | P3 | 3 | S | Three accessibility fixes; wider automated check |
| P3-9 | P3 | 3 | S | Admin lists on a phone |
| P3-10 | P3 | 3 | S | Email page order; sentence |
| P3-11 | P3 | 3 | M | Paging and one filter on three lists |
| P3-12 | P3 | 3 | S | Notification order; friendly page for removed targets |
| P3-13 | P3 | 3 | S | Read state at joining |
| P3-14 | P3 | 3 | M | Confirmations; removal notice; lift a removal |
| P3-15 | P3 | 3 | S | Messages for failed actions |
| P3-16 | P3 | 3 | S | Remove proven-unused leftovers |
| P3-17 | P3 | 3 | S | Confirmation link and two-step; no address in the URL |
| P3-18 | P3 | 3 | M | Message codes instead of free text |
| P3-19 | P3 | 3 | S | Shared email rule; password-change limit; idle timeout |
| P3-20 | P3 | 3 | S | Prisma update if a fix exists |
| P3-21 | P3 | 3 (and with each change) | S | Documents corrected |
| P3-22 | P3 | 3 | S | Investigate the one-time test failure |
| P3-23 | P3 | — | — | Deferred, no change |

Counts: 1 P0, 10 P1, 25 P2, 23 P3 = 59. All are addressed: 58 with a correction (P2-13 narrowed after one recommendation was withdrawn) and 1 deferred (P3-23).

---

Implementation has not begun. It will begin with Stage 0 only after the founder approves this plan.
