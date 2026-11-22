# Stage 2 Report — Medium-Priority Corrections

Date: 22 November 2026. Plan: `docs/CORRECTIVE-IMPLEMENTATION-PLAN.md`, section 6.

**Result: all 24 remaining medium findings are corrected and verified** (P2-5 was done in Stage 1). Stage 3 has not started.

## 1. Verification summary

| Check | Result |
|---|---|
| Type check | 0 errors |
| Lint | 0 errors, 0 warnings |
| Automated tests | **274 passed** (195 from before + 79 new), 12 skipped (old audit probes, by design). Run three times in a row without a failure |
| Browser tests on a production build | **21 passed** |
| Page crawl as five kinds of user (140 pages, desktop and phone) | 138 loaded, 0 error pages, 0 pages with sideways overflow, 2 timeouts (see section 5) |
| Development database after the two migrations | Identical to the rehearsed copy: 47 tables, 238 rows, 0 differences |

## 2. Your two answers at the start of this stage

| Question | Your answer | Applied in |
|---|---|---|
| Should downloading all applications as a file be owner-only? | Owner-only | P2-13 |
| Use the proposed revenue wording? | Yes, as proposed | P2-19 |

## 3. What was corrected

| Finding | Correction | Tests |
|---|---|---|
| **P2-1** Redirect to an outside site after "confirm it's you" | One shared check for every return address; only paths inside this site are followed | 3 |
| **P2-2** "Something went wrong" instead of "no permission" | A non-administrator is sent to their own page; an administrator without the permission sees a plain "You don't have permission" page | existing tests updated; crawl |
| **P2-3** Accepted but never given access; false "Approved" message | Access is granted at every point the obstacle can disappear (approving again, reactivating the account, confirming the email, linking an earlier application). It never restores access an administrator removed. The message states the person's real situation (six cases) | 6 |
| **P2-4** Re-opening a declined application crashed | Refused with a clear message when the person already started a new one; the choice is hidden | 2 |
| **P2-6** Reopened empty group was a dead end | It stays open and flagged; the first eligible person who joins becomes coordinator | 1 |
| **P2-7** People without community access counted as active group members | One "active member" rule for recipients, counts, lists, coordinators, group creation and project assignment | 3 |
| **P2-8** Supporter counter counted ineligible supporters | The stored number is the eligible number. Ideas are re-checked when a supporter's access changes or the threshold changes | 3 |
| **P2-9** Ideas could be rewritten after support | Revision history visible to members. Minor correction keeps support; material change resets it; supporters are notified either way. A group's purpose changes only with a note, recorded as a decision, announced and sent to all members | 12 |
| **P2-10** Meetings | One "Start Meeting" button, Google Meet wording everywhere, automatic end after 4 hours, one meeting per group (enforced by the database), ended when a group is archived or suspended | 7 + 2 wording |
| **P2-11** Chat attachments | Unsent files are private, deleted on removal and after 24 hours; removed or purged messages take their files along; two messages cannot share one file | 6 |
| **P2-12** Notification clash after simultaneous support | Hardened; follow-up steps fail independently | 2 (96 simultaneous supports) |
| **P2-13** Administrator role too powerful | Bulk download is owner-only. Public content stays with administrators (your decision 6) | 1 |
| **P2-14** Data exports | Own export includes the application for non-accepted people and the person's own agreements; no drafts in the file; submission date shown | 3 |
| **P2-15** Email change conflict | Refused with a clear answer; the account is unchanged | 2 |
| **P2-16** Sign-in revealed accounts; anyone could lock anyone | Same answer and same waiting time for every address; a lock looks like a wrong password and is tied to account plus network | 4 + 2 |
| **P2-17** Admin area | Menu 16 → 12 (no page removed, no address changed); four clear member lists; person page with the four facts and one plain sentence; "Waiting for you" first; counters equal their lists | 8 |
| **P2-18** Organization name from two places | One source; the content editor shows it read-only | 1 |
| **P2-19** Revenue explanation | Your approved wording on the page, in the diagram, in the FAQ and in the policy draft | 2 |
| **P2-20** Placeholders | Every public placeholder is listed for the owner ("Before launch", 10 open today); a production start requires legal name and jurisdiction | 2 + 2 |
| **P2-21** Test-mail label in production | Applies only outside production | 1 |
| **P2-22** Backups | Job lock on one dedicated connection; Backups page says what is and is not protected; encryption required in production (Stage 1) | 3 |
| **P2-23** Test records and environments | Nothing deleted; environments documented; clean production start (Stage 1) | procedure test from Stage 1 |
| **P2-24** Upload size limit | Enforced while reading; uploads without a declared size refused | 3 |
| **P2-25** In-memory limits | Chat counters cleaned; a second instance on the same database is refused in production | 1 |

## 4. Database changes (approved and applied)

| Change | What it does | Rows changed |
|---|---|---|
| M3 `20261122230000_one_active_meeting_per_group` | A group can have only one meeting in progress | None (no meeting existed) |
| M4 `20261122240000_idea_revisions` | New table for the history of idea edits; one new notification type | None (new, empty table) |

Same procedure as in Stage 1: backup, restore into a copy, compare, rehearse, your approval, fresh backup, apply, compare again. Rollback: restore `backups/cowork-20261122-220229-before-m3-m4-final.cwbak.gz` into a new database, or run the "to undo" lines at the top of each migration file.

## 5. Problems found during this stage, and what was done

1. **The cause of the intermittent test failure is found.** Notification emails are sent in the background after an action returns. A test that ended while such an email was still being written could collide with the next test clearing the database, which ended in "deadlock detected". This is what failed once in Stage 1 and once in this stage. The background emails are now tracked and the test reset waits for them. Three full runs since then passed. The site itself was not affected: this could only happen when tables are emptied.
2. **Two mistakes of mine were caught by the new tests before they were committed.**
   - The email-change conflict check missed earlier applications without an account.
   - The meeting expiry compared stored times with the database clock in a way that depends on the database's time zone.
3. **Six existing tests were changed on purpose,** because the intended behaviour changed: the lock test (now two tests for the new lock), two permission tests and two browser tests that expected an error where a redirect is now correct, and one attachment test (an unsent file is now private to its uploader).
4. **A new observation, not one of the 59 findings.** When moving between pages, the browser asks for the home page in the background (a speed-up built into the framework). In the test browser these requests are sometimes reported as never finishing, which is why two crawl visits timed out. The pages themselves load normally (under one second), and the same behaviour was visible before any corrective work began. The cause is not established. It is added to Stage 3 as an item to investigate.
5. **One new accessibility issue came from my own change** (links in the "Before launch" list were distinguishable only by colour). Fixed in the source before the final test run.

## 6. Differences from the plan

| Point | What happened | Why |
|---|---|---|
| One commit per finding | Six commits for 24 findings, grouped by the files they share | Most findings in this stage touch the same files (ideas, groups, notifications, accounts). Each commit lists its finding IDs |
| P2-8, threshold change | No confirmation step; the settings page warns that a lower number creates groups at once, and reports how many were created | A warning plus an exact result is simpler than a two-step form |
| P2-16 | The per-account ceiling was raised from 10 to 50 attempts per 15 minutes | With the new per-network lock, a low ceiling was the remaining way for one outsider to block a person. It stays as a backstop against guessing from many networks |
| P2-17 | Pages were grouped with tabs instead of being moved | No address changes, so no bookmark or email link can break |
| P2-18 | The email header that carries the delivery id was renamed; the old name is still accepted | Reports for emails sent before the change still match |
| P2-20 | A production start requires legal name and jurisdiction; the remaining legal passages only produce a warning | Those passages need text from a lawyer, which a setting cannot supply |
| P2-22 | Streaming backups was not done | As planned (section 2 of the plan) |

## 7. Not verified in this stage

- Real email delivery (still no provider), a real Google Meet call, behaviour behind a real proxy.
- The new forms were tested through their server code and the page crawl; these were **not clicked through in a browser**: the minor/material choice on the idea edit page, the "why" note for a group's purpose, "Remove this agreement", the member list filters, the tab bars.
- The six Stage 2 screenshots come from the crawl of the demo site (`docs/corrective-screenshots/stage2-*.png`).

## 8. For you to do

**Restart your dev server on port 3000** (Ctrl+C in its terminal, then `npm run dev`). It still runs older code, and its database now has the new table.

## 9. Next

Stage 3 (22 low findings, six housekeeping items, and the new observation from section 5) starts only after approval. One point needs your word during it: the list of repeated blocks to remove from the public pages (P3-3), which I will present before removing anything.
