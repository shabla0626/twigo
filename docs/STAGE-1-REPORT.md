# Stage 1 Report — Critical and High-Priority Corrections

Date: 22 November 2026. Plan: `docs/CORRECTIVE-IMPLEMENTATION-PLAN.md`, section 5.

**Result: all 11 findings of this stage are corrected and verified** (1 critical, 10 high; P1-10 was done in Stage 0). One medium finding, P2-5, was done early because P1-9 depends on it. Stage 2 has not started.

## 1. Verification summary

| Check | Result |
|---|---|
| Type check | 0 errors |
| Lint | 0 errors, 0 warnings |
| Automated tests | **195 passed** (134 existing + 61 new), 12 skipped (the old audit probes, by design) |
| Browser tests on a production build | **21 passed** (run twice: after the last finding, and again after the two follow-up fixes in section 4) |
| Two-browser check of the chat change on the demo site | Passed (section 4) |
| Spoofed-address sign-in check | Before: 0 of 25 blocked. Now: blocked as soon as the limit of 20 is reached |
| Three real production starts with wrong settings | All refused with a clear reason |
| Development database after the two migrations | Identical to the rehearsed copy: 46 tables, 238 rows, 0 differences |

**One irregularity.** In one of five full test runs, the existing test "simultaneous endorsements create exactly one group" failed once. It passed in 9 runs on its own, in the 4 other full runs, and in 40 stress rounds written to catch it. I could not capture its error. It matches the audit's suspected finding P2-12 (a notification clash after simultaneous endorsements), which is scheduled for Stage 2 and will get a permanent stress test there. It is not caused by a file changed in this stage as far as I can tell, but I cannot prove that.

## 2. What was corrected

| Finding | Correction | Evidence |
|---|---|---|
| **P0-1** Placeholder owner without two-step verification | Production starts from an empty database with one owner; a production start is refused while an active owner or administrator has a test address, or no owner exists. The command-line admin tool no longer changes an existing account silently (`--promote` required). The development database was not touched | 6 tests; a real production start against the development database was refused: "1 administrator account(s) use a test address (owner at @example.test)" |
| **P1-1** Administrators could read any group chat unseen | Every join, leave, removal and coordinator change is a line in the group chat and (joins, leaves) an audit entry. Staff are labelled "Administrator". For an owner or administrator the chat begins when they joined: no earlier history, no pushes of earlier messages when edited, no quotes of them, no reply to or report of them, no download of their attachments. Looking at reported chat messages is audited. The admin review page shows proposal notes only | 12 tests; two-browser check; screenshots |
| **P1-2** Chat kept working after sign-out | Sessions are ended in one place, which tells the chat server; matching connections close and the browser goes to the sign-in page. The session is also re-checked before every chat action and once a minute | 5 tests, including a missed-signal case |
| **P1-3** Attempt limits could be bypassed or lock everyone out | The server works out each visitor's address itself; headers sent by the visitor are never used. New setting `TRUSTED_PROXY_HOPS` for hosting behind a proxy | 6 tests; browser check |
| **P1-4** An administrator could deactivate or reactivate the owner | One server-side rule for suspend, reactivate, deactivate and community access: only the owner may act on staff accounts. Nobody can change their own account from the admin area | 4 tests |
| **P1-5** Two-step verification could be set up without the password | Setup needs a recent identity confirmation and ends all other sessions. Recovery for a lost authenticator: `npm run admin:create -- --email <address> --reset-2fa` (audited) | 4 tests |
| **P1-6** An administrator could delete compensation records | Deleting a project or participant record is owner-only and refused while a compensation agreement exists; the database enforces it too. Removing an agreement is its own owner action with typed confirmation, audited without amounts | 6 tests, including a direct database attempt |
| **P1-7** "Back up now" said "failed" after success | The result is decided before the redirect | 2 tests (success and real failure) |
| **P1-8** Production settings not checked at startup | The server checks all settings before it serves anything and exits with a plain list; the health address reports unhealthy when settings are invalid | 6 tests; three refused real starts |
| **P1-9** A suspended coordinator was never replaced | On suspension or paused access the longest-standing eligible member becomes coordinator at once (or the group is flagged). Removed access ends group memberships. A returning person is an ordinary member. Two coordinators can no longer occur | 5 tests |
| **P1-10** No version control | Done in Stage 0 | `docs/STAGE-0-REPORT.md` |
| **P2-5** (early) Simultaneous leaves failed with a deadlock | Every membership change locks the group first | 2 tests: 16 simultaneous pairs, 0 failures (before: every pair failed once) |

## 3. Database changes (approved and applied)

| Change | What it does | Rows changed |
|---|---|---|
| M1 `20261122210000_chat_system_messages` | Adds `kind` (USER or SYSTEM) to chat messages, default USER | None; the 3 existing messages are USER |
| M2 `20261122220000_compensation_blocks_deletion` | The agreement's link to its assignment changes from "delete along" to "refuse" | None; the 1 existing agreement is intact |

Procedure followed: backup, restore into a check copy, compare (identical), rehearse both changes on the copy, ask for approval, fresh backup, apply, compare again (identical to the rehearsed copy). Both were also applied to the demonstration database; the test databases apply them automatically.

Rollback: restore `backups/cowork-20261122-203926-before-m1-m2-final.cwbak.gz` into a new database (`docs/DEPLOYMENT.md`, section 11), or run the "to undo" statements written at the top of each migration file.

## 4. Browser evidence (demo site, fictional accounts)

Files in `docs/corrective-screenshots/`:

| File | Shows |
|---|---|
| `stage1-01-member-sees-administrator-join.png` | A member's open chat shows "Demo Owner (administrator) joined the group" without reloading |
| `stage1-02-administrator-sees-chat-only-from-joining.png` | The owner's chat starts at the join line; the group's earlier messages are absent and "Load earlier messages" is not offered |
| `stage1-03-member-list-labels-administrator.png` | The member list labels the owner "Administrator" |
| `stage1-04-member-sees-administrator-leave.png` | The member sees "Demo Owner (administrator) left the group" live |

The check: a member writes a note in the group chat; the owner then joins. Result: the member sees 10 messages, the join line and their note; the owner sees only the join line, and not the note.

**Two things I found while reviewing this evidence, and fixed:**

- The member list beside the chat did not show the "Administrator" label (the overview and members pages did). It does now.
- The unread badge counted messages from before the administrator joined. It showed a number for messages they cannot open, which revealed that earlier messages exist. It now starts at the joining time (one more test).

My first set of screenshots was also misleading: it came from a second run in which the owner was already a member, so a note written during that run was rightly visible. I changed the check to always start with the owner outside the group and retook all four screenshots.

## 5. Differences from the plan

| Point | What happened | Why |
|---|---|---|
| One commit per finding | Three commits cover two findings each: P1-7 with P1-4, P2-5 with P1-9, P1-8 with P0-1 | Each pair changes the same lines of the same files; splitting them would have produced commits that do not work on their own. Each can still be reverted as a pair |
| P1-6 | A small owner action "Remove this agreement" was added | Without it, nothing could ever remove an agreement once deletion no longer does it silently; the acceptance criterion asks for "an explicit, audited owner action" |
| P1-1, audit of report viewing | Recorded at most once an hour per administrator, and only when reported chat messages are on the page | An entry on every page view would bury the audit log |
| P1-8 | The complete production check runs when the server starts, not during `npm run build` | A build on the development computer would otherwise fail for values that only a real site has. The secrets are still checked during the build, as before |
| P1-8 | The old switch `SKIP_PROD_ENV_CHECK` is replaced by `LOCAL_PRODUCTION_TEST=1` | The new one works only while the site address is a local one, so it cannot weaken a real deployment |
| P1-9 | Founding members share one joining time, so "longest-standing" now uses the membership id as tie-breaker | Without it the choice between them was arbitrary |

## 6. Not verified in this stage

- Behaviour behind a real reverse proxy (the correct `TRUSTED_PROXY_HOPS` value) and secure cookies on a real domain. Covered locally by unit tests only.
- A real production start with real settings (only refused starts and local-test starts were exercised).
- The "Remove this agreement" form and the changed delete forms were tested through their server actions, not clicked in a browser.
- The command-line recovery option was tested through its function, not typed at a real prompt.

## 7. For you to do

**Restart your dev server on port 3000.** It is still running code from before this stage, and its database now has the new column. Stop it with Ctrl+C in its terminal and run `npm run dev` again.

The development database still contains the placeholder owner account without two-step verification. That is intended (decision 4: development data is preserved); it can no longer reach production because of the startup check.

## 8. Commits of this stage

```
P1-7, P1-4   truthful backup button; owner-only actions on staff accounts
P2-5, P1-9   group lock; coordinator replaced when access is lost
P1-2         a chat connection ends together with its session
P1-3         attempt limits use an address the visitor cannot choose
P1-5         two-step verification setup needs recent identity confirmation
P1-8, P0-1   production start is checked; no test administrators in production
P1-1         no hidden access to group chat; membership changes are visible
P1-6         deleting is owner-only; compensation agreements block deletion
```

## 9. Next

Stage 2 (the remaining 24 medium findings) starts only after approval. Three points from the plan need your word before or during it: whether the bulk applications download becomes owner-only (P2-13), the exact sentences for the revenue explanation (P2-19), and the two further database changes M3 and M4.
