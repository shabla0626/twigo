# Corrective Implementation Report

Date: 23 November 2026. Covers Stages 0 to 4 of `docs/CORRECTIVE-IMPLEMENTATION-PLAN.md`, which answered the 59 findings of `docs/FINAL-PRODUCT-AUDIT.md`.

## 1. Result

- **57 of the 59 findings are corrected and meet their acceptance criterion.** The two others are as planned:
  - **P3-20** (warnings about Prisma's command-line tool) was reviewed; no corrected release exists yet.
  - **P3-23** (one page with all compensation agreements) stays deferred.
- **Every claim in the retest table (section 3) is checked against the actual test results.** A script reads the result files and confirms that each of the 150 cited automated tests exists and passed. A hand check is marked as such.
- **The final verification found three more problems, outside the 59.** All three are corrected and covered by tests (section 4). The most important: **file uploads would have been refused on the real website.**
- **Nothing was published, purchased or deployed.** No real email was sent. The development database kept all its records; it changed only through the four migrations you approved.

## 2. Verification summary (plan, section 8.2)

| Check | Pass condition | Result |
|---|---|---|
| Type check and lint | 0 errors | **0 errors, 0 warnings** (whole project) |
| Automated tests | All pass | **348 passed, 0 failed, 0 skipped** (130 groups of tests). At the audit: 134 |
| Browser tests on a production build | All pass, 3 consecutive runs | **21 of 21**, in **12 consecutive runs** (after the cause of the occasional failure was found and fixed, section 4) |
| Page crawl as five kinds of user, desktop and phone | No error page, console error, overflow or serious accessibility issue | **141 pages: 0 error pages, 0 console errors, 0 sideways overflow, 0 serious accessibility issues** (after the badge fix in section 4) |
| Role-by-role walkthrough in a real browser | Every path of section 8.3 | **52 of 52 steps** (`docs/ROLE-WALKTHROUGH.md`) |
| The twelve audit scenarios | Rewritten as ordinary tests | **12 of 12 pass** (`tests/regression-probes.test.ts`) |
| Audit check script (`scripts/audit/checks.ts`) | Redirect, limits, timing, lock messages | **All as intended** (section 3, P1-3, P2-1, P2-16) |
| Integrity check of the development database (read-only) | Same as at the audit, or better | **Same or better.** Every consistency check is empty, including the new rule "active group members without community access" (P2-7). Two expected rows remain: the placeholder owner, kept by your decision 4 (P0-1), and one old accepted application whose owner has not created an account yet |
| Performance (`npm run perf:measure`) | Query counts not much worse than the recorded "after" figures; reasons stated | **Response times unchanged (within ±5 ms).** Queries 131 → 145 across 21 pages; every addition comes from a correction (section 5) |
| Restore of a backup | Backup made by the owner restores and verifies | **Restored and verified table by table** (encrypted backup from the walkthrough) |

## 3. Retest of every finding

Method: **T** automated test, **E** browser test on a production build, **W** walkthrough step. Each was checked against the result files of the final run. Plain text marks a hand check or a diagnostic script, with its result.

| ID | Finding | Acceptance criterion | Evidence | Result |
|---|---|---|---|---|
| P0-1 | Placeholder owner without two-step verification | A production start with a test-domain administrator stops with a clear message; a fresh production database holds exactly one account. | test `corrective-launch`: "an active owner or administrator with a test address stops the start"<br>test `corrective-launch`: "the clean production start (one real owner created from the command line) passes"<br>test `corrective-launch`: "an empty database is refused until the owner has been created"<br>Development database unchanged by decision 4: the placeholder owner is still there (integrity check), and a production start against it was refused in Stage 1 | Met |
| P1-1 | Administrators could read group chats unseen | No administrator reads a message from before joining; every membership change is visible in the chat and audited. | test `corrective-chat`: "an owner who joins sees the chat only from that moment"<br>test `corrective-chat`: "joining and leaving each write a line into the chat and an audit entry"<br>test `corrective-chat`: "an owner or administrator is named as such"<br>test `regression-probes`: "11. an owner joins a group"<br>walkthrough: "joins a group as an ordinary member and sees no earlier chat" | Met |
| P1-2 | Chat connection outlived its session | Within 5 seconds of a session ending, its chat connection closes and sending is refused. | test `corrective-realtime`: "signing out closes the connection"<br>test `corrective-realtime`: "changing the password closes the connections"<br>test `corrective-realtime`: "safety net"<br>test `regression-probes`: "12. a session signed out elsewhere" | Met |
| P1-3 | Sign-in limit could be bypassed or abused | A made-up forwarding header does not change the counter; two networks never share a counter. | test `corrective-unit`: "without a trusted proxy the network connection is used"<br>test `corrective-unit`: "behind one proxy the entry written by that proxy is used"<br>test `corrective-unit`: "application code reads only the internal header"<br>test `corrective-stage2c`: "a locked sign-in answers exactly like a wrong password"<br>scripts/audit/checks.ts section B rerun in Stage 4: 25 wrong sign-ins with 25 different made-up forwarding headers were counted as one network and blocked after 20 | Met |
| P1-4 | Administrator could act on owner accounts | Every refused case answers "Only the owner can…" and changes nothing. | test `corrective`: "refuses an administrator who tries to suspend, deactivate or reactivate"<br>test `corrective`: "refuses an administrator who tries to change an owner's community access"<br>test `corrective`: "still lets administrators manage ordinary members" | Met |
| P1-5 | Two-step setup without password; old sessions stayed | An old session cannot attach an authenticator without the password; no older session survives setup. | test `corrective-accounts`: "a session whose password confirmation is old is sent to confirm identity"<br>test `corrective-accounts`: "right after signing in it works, and every other session of the account is ended"<br>walkthrough: "must set up two-step verification before the admin area opens" | Met |
| P1-6 | Administrator could delete compensation records | No agreement disappears except through an explicit, audited owner action. | test `corrective-projects`: "an administrator is refused by the delete actions"<br>test `corrective-projects`: "the database itself refuses"<br>test `corrective-projects`: "the owner removes the agreement in its own audited step"<br>walkthrough: "deleting the project is refused while an agreement exists" | Met |
| P1-7 | "Back up now" reported failure after success | A successful manual backup says "Backup written" and the job history shows success. | test `corrective`: "shows success and records a successful job"<br>test `corrective`: "shows failure and records a failed job"<br>test `regression-probes`: "10. the owner presses Back up now"<br>walkthrough: "Back up now writes a backup" | Met |
| P1-8 | Production settings not checked at startup | A production start with a missing value exits and names the value. | test `corrective-launch`: "names every missing or wrong value in plain words"<br>test `corrective-launch`: "lists all problems at once"<br>test `corrective-launch`: "the local test switch works only with a local site address" | Met |
| P1-9 | Suspended coordinator never replaced | Right after suspension every group has exactly one eligible coordinator or is flagged; never two. | test `corrective`: "suspending the coordinator account promotes the longest-standing eligible member"<br>test `corrective`: "with nobody eligible the group is flagged"<br>test `corrective`: "a later leave never creates a second coordinator"<br>test `regression-probes`: "1. the only coordinator's account is suspended"<br>test `regression-probes`: "2. the only coordinator's community access is removed"<br>walkthrough: "the coordinator's account is suspended: another member takes over at once" | Met |
| P1-10 | No version control, no copy outside the project folder | Local git history with tags per stage; verified code bundle and database backup. | git repository on main with tags audit-baseline-2026-11-22, stage-1-complete, stage-2-complete, stage-3-complete, stage-3-final and stage-4-complete; code bundle verified with git bundle verify; database backup restored into a scratch database and compared (Stage 0, repeated before every migration). The second copy outside this computer still needs the founder's choice | Met (manual check) |
| P2-1 | Redirect to an outside site after confirming identity | A crafted address lands on /account; no outside request. | test `corrective-stage2`: "refuses everything that could leave the site"<br>test `corrective-stage2`: "after confirming identity, a crafted address lands on the account page"<br>scripts/audit/checks.ts section A rerun in Stage 4: the crafted address landed on /account, no outside request | Met |
| P2-2 | "Something went wrong" for a permission refusal | No permission refusal produces an error page. | browser test "D. waitlisted and declined applicants…"<br>browser test "security: unauthenticated and member access…"<br>test `corrective-projects`: "an administrator is refused by the delete actions"<br>walkthrough: "owner-only areas are refused with a plain message" | Met |
| P2-3 | Accepted but never given access; false message | Nobody with an accepted application and an active, confirmed account is left without access; the message matches. | test `corrective-stage2b`: "accepted while the account was suspended"<br>test `corrective-stage2b`: "approving again gives access when it was missing"<br>test `corrective-stage2b`: "accepted before the email address was confirmed"<br>test `corrective-stage2b`: "every situation has its own message"<br>walkthrough: "Omar's application is approved" | Met |
| P2-4 | Re-opening a declined application crashed | No error page in that sequence. | test `corrective-stage2`: "gives a clear answer instead of failing"<br>test `corrective-stage2`: "re-opening still works when there is no newer application"<br>walkthrough: "re-applies after the decline" | Met |
| P2-5 | Simultaneous leaves: database error | No deadlock error in the scenarios. | test `corrective`: "the last two members can leave at the same moment"<br>test `corrective`: "the coordinator and a member can leave at the same moment"<br>test `regression-probes`: "3. the last two members leave at the same moment"<br>test `regression-probes`: "4. coordinator and one member leave at the same moment" | Met |
| P2-6 | Reopened empty group was a dead end | A reopened empty group can be joined and gets a coordinator. | test `corrective-stage2b`: "reopening keeps it open"<br>test `regression-probes`: "8. an archived group with no members is reopened" | Met |
| P2-7 | People without access counted as active group members | Integrity check "active group memberships of people without community access" stays empty. | test `corrective-stage2`: "is not counted and not notified while paused"<br>test `corrective-stage2`: "the same applies to a suspended account"<br>test `corrective-stage2`: "cannot be given new project work"<br>integrity check on the development database in Stage 4: 0 rows | Met |
| P2-8 | Supporter counter counted ineligible people | The number shown is the number used for the decision. | test `corrective-stage2`: "a suspended supporter is not counted"<br>test `corrective-stage2`: "pausing community access and withdrawing support lower the number"<br>test `corrective-stage2`: "lowering the threshold creates groups" | Met |
| P2-9 | Ideas could be rewritten after support | Every change is recorded and visible; a material change never keeps support; a group's purpose changes only with a recorded, announced decision. | test `corrective-ideas`: "a minor correction keeps the support"<br>test `corrective-ideas`: "a material change resets the support"<br>test `corrective-ideas`: "a change of direction is recorded as a decision"<br>walkthrough: "a minor correction keeps support"<br>walkthrough: "a material change resets support"<br>walkthrough: "changes the group's purpose with a reason" | Met |
| P2-10 | Meetings: wording and behaviour | No text promises built-in voice or video; no meeting shows as in progress after four hours. | test `corrective-stage2-unit`: "no page promises voice or video built into the site"<br>test `corrective-meetings`: "a meeting nobody ended stops being 'in progress' after the limit"<br>test `corrective-meetings`: "a group has one meeting at a time"<br>browser test "16–18. members start and join meetings…"<br>walkthrough: "meetings are described as Google Meet"<br>walkthrough: "starts a meeting, a member sees it" | Met |
| P2-11 | Chat attachments visible and kept when they should not be | Unsent files are private and cleaned up; removed messages take their files. | test `corrective-stage2c`: "a file that was chosen but never sent"<br>test `corrective-stage2c`: "uploads that were never sent are deleted after a day"<br>test `corrective-stage2c`: "a message removed by moderation takes its attachments"<br>walkthrough: "sends a file in the chat" | Met |
| P2-12 | Notification clash after simultaneous support | The stress test passes repeatedly (closed as "not reproduced, hardened" if the fault never appears). | test `corrective-stage2`: "12 rounds of eight members supporting one idea"<br>test `corrective-stage2`: "two notices with the same subject" | Met |
| P2-13 | Administrator role too powerful | The owner-only table is true in code and documentation. | test `corrective-stage2`: "downloading all applications is owner-only"<br>test `corrective-projects`: "deleting projects and participant records is an owner-only permission"<br>walkthrough: "owner-only areas are refused with a plain message" | Met |
| P2-14 | Data exports incomplete or too broad | Own export includes the application and own agreements; no drafts in the applications file. | test `corrective-stage2`: "a person who was not accepted still gets their application"<br>test `corrective-stage2`: "an accepted person's export includes their own compensation agreements"<br>test `corrective-stage2`: "the applications file never contains unfinished drafts" | Met |
| P2-15 | Email change confirmed on screen but rolled back | The screen never claims a change that was not saved. | test `corrective-stage2`: "is refused with a clear answer; the account is unchanged"<br>test `corrective-stage2`: "a normal change updates the account and its application record together" | Met |
| P2-16 | Sign-in revealed accounts; anyone could lock anyone | checks.ts sections C and D show no distinguishable difference. | test `corrective-stage2c`: "forgot password: the same answer for every address"<br>test `corrective-stage2c`: "a locked sign-in answers exactly like a wrong password"<br>scripts/audit/checks.ts sections C and D rerun in Stage 4: reset-request times 129–132 ms for both kinds of address; six wrong sign-ins answer identically for a real and an unknown address, including at the lock | Met |
| P2-17 | Admin area described people in three overlapping places | One person's state on one page; counters equal their lists; no contradictory label. | test `corrective-admin`: "every account is in exactly one of the three lists"<br>test `corrective-admin`: "the overview counter 'Members with community access' equals the list"<br>test `corrective-admin`: "has twelve entries instead of sixteen" | Met |
| P2-18 | Organization name came from two places | One change, one place, everywhere. | test `corrective-stage2-unit`: "no source file outside the defaults contains the name" | Met |
| P2-19 | Revenue explanation left out what the organization keeps | Public wording matches decision 3. | test `corrective-stage2-unit`: "states disclosure, prior written agreement"<br>test `corrective-stage2-unit`: "publishes no percentage and no amount"<br>walkthrough: "revenue wording matches the founder's decision" | Met |
| P2-20 | Placeholders and unreviewed legal drafts public | Every placeholder is listed for the owner; production refuses to start without legal name and jurisdiction. | test `corrective-stage2-unit`: "the list matches the placeholders that are really in the public pages"<br>test `corrective-launch`: "names every missing or wrong value"<br>10 placeholders remain by design until the founder supplies the facts; they are listed on the admin overview under "Before launch" | Met |
| P2-21 | Local mail relay labelled "test only" in production | The label applies only outside production. | test `corrective-stage2`: "a mail server on the same machine is a real relay in production"<br>browser test "C. the administrator reviews, approves and notifies…" | Met |
| P2-22 | Backups weakly protected | Production backups are always encrypted; the job lock allows one run at a time. | test `corrective-launch`: "names every missing or wrong value"<br>test `corrective-stage2c`: "a second run is refused while the first is running"<br>test `corrective-stage2c`: "a job that fails still releases the lock"<br>walkthrough: "Back up now writes a backup"<br>the walkthrough's encrypted backup (.cwbak.gz.enc) was restored into a scratch database and verified table by table | Met |
| P2-23 | Real database holds the founder's test records | Written environment table; verified clean-start procedure; no existing record changed. | test `corrective-launch`: "the clean production start"<br>README and DEPLOYMENT.md list the four environments; integrity check in Stage 4 shows the development database with the same 5 accounts as at the audit | Met |
| P2-24 | Upload size limit avoidable | Limit enforced while reading; uploads without a size refused. | test `corrective-stage2c`: "refuses an upload that does not state its size"<br>test `corrective-stage2c`: "stops reading when the body is larger than it claimed"<br>test `corrective-stage2c`: "a normal small upload still works" | Met |
| P2-25 | Limits and caches in one process's memory | Memory stays flat; two instances cannot run against one database. | test `corrective-stage2c`: "a second instance cannot take the instance lock" | Met |
| P3-1 | No site icon | /favicon.ico returns 200; no console 404. | test `corrective-stage3`: "the site has an icon"<br>production build: /favicon.ico, /icon.svg, /apple-icon.png return 200; crawl shows 0 console errors | Met |
| P3-2 | No loading indicators | A slow page shows a placeholder. | test `corrective-stage3`: "each signed-in area has a loading placeholder"<br>browser check on a slowed connection in Stage 4: the placeholder is shown while the page loads and gone when it arrives (scripts/audit/slow-loading.ts) | Met |
| P3-3 | Public pages repeat each other | Each fact in one main place (founder-approved cut list). | test `corrective-stage3`: "1. Home no longer repeats three FAQ questions"<br>test `corrective-stage3`: "2. About no longer has"<br>test `corrective-stage3`: "3. Founding Contributors no longer has"<br>test `corrective-stage3`: "7. the closing banner stays"<br>browser test "public pages and mobile layouts…" | Met |
| P3-4 | Member without application offered to apply | No "start application" offer for members. | test `corrective-stage3`: "a member who never applied is told they are a member" | Met |
| P3-5 | "You can enter" under "access paused" | One consistent message. | test `corrective-stage3`: "paused or removed access is the only message"<br>test `corrective-stage3`: "an accepted person is told they can enter only when they really can" | Met |
| P3-6 | Filter boxes cut off their text | Full labels visible. | test `corrective-stage3`: "filter boxes are as wide as their text"<br>screenshot docs/corrective-screenshots/stage3-02 | Met |
| P3-7 | Four places to talk | Each place says who can read it (nothing merged, as planned). | test `corrective-stage3`: "each place to talk says who can read it" | Met |
| P3-8 | Three accessibility issues | Automated accessibility check: 0 serious issues on all crawled pages. | test `corrective-stage3`: "the chat offers ONE named control"<br>browser test "public pages and mobile layouts…"<br>crawl of 141 pages in Stage 4: 0 serious or critical accessibility issues, after correcting the contrast of the unread badges (found by this crawl) | Met |
| P3-9 | Admin lists cramped on a phone | Results visible without scrolling past filters. | test `corrective-stage3`: "on a phone the less-used application filters are folded away"<br>screenshot docs/corrective-screenshots/stage3-01 | Met |
| P3-10 | Email log under the templates; a sentence twice | Log visible on opening the page. | test `corrective-stage3`: "the email page shows the delivery log before the templates" | Met |
| P3-11 | Only the latest 100–200 records reachable | Any record can be reached. | test `corrective-stage3`: "walking through the pages returns every audit entry exactly once"<br>test `corrective-stage3`: "the three pages use paging" | Met |
| P3-12 | Notifications jumped; dead links | Order stable; no dead links. | test `corrective-stage3`: "reading a notification does not move it"<br>test `corrective-stage3`: "a link to something that was removed ends on a plain page" | Met |
| P3-13 | New member saw the whole history as unread | Badge counts only messages after joining. | test `corrective-stage3`: "only messages written after joining count as unread" | Met |
| P3-14 | One-click actions that cannot be undone | Each asks first; removal is notified; an administrator can lift it. | test `corrective-stage3b`: "Close idea, Make coordinator and Remove member ask first"<br>test `corrective-stage3b`: "a removed member is told"<br>test `corrective-stage3b`: "the organization can lift a removal"<br>walkthrough: "hands the coordinator role over (asks first)" | Met |
| P3-15 | Actions failed silently | Every failed action shows a message. | test `corrective-stage3b`: "each one-click action explains a refusal"<br>test `corrective-stage3b`: "the source has no swallowed errors left" | Met |
| P3-16 | Leftovers of the earlier invitation flow | No unused path or dead link remains. | test `corrective-stage3c`: "the unused pieces are gone"<br>test `corrective-stage3c`: "an invitation can never bring back a suspended or deactivated account"<br>walkthrough: "the owner invites an administrator; the invitation is activated" | Met |
| P3-17 | Confirmation link skipped two-step; address in the URL | Covered by a test. | test `corrective-stage3c`: "an account with two-step verification is confirmed but must sign in"<br>test `corrective-stage3c`: "after sign-up the address is not part of the page address" | Met |
| P3-18 | Banners showed any text from the address | Unknown text is not displayed. | test `corrective-stage3b`: "free text from an address is never displayed"<br>test `corrective-stage3b`: "no page displays address text directly" | Met |
| P3-19 | Small sign-in hardening gaps | One email rule; limited password-change attempts; idle timeout. | test `corrective-stage3c`: "every form and tool accepts exactly the same addresses"<br>test `corrective-stage3c`: "after five wrong attempts"<br>test `corrective-stage3c`: "an owner or administrator session unused for an hour ends" | Met |
| P3-20 | Advisories in build tooling | npm audit clean or reviewed. | reviewed in Stage 3 and again in Stage 4: the 4 advisories are in Prisma's command-line tooling; no fixed release of Prisma 6 exists; never "npm audit fix --force" | Reviewed, no change possible |
| P3-21 | Documentation out of date | Docs match behaviour. | corrected in Stage 3 (ONBOARDING, README, DEPLOYMENT, ARCHITECTURE); Stage 4 adds the upload rule | Met (manual check) |
| P3-22 | One browser test failed once under load | 10 consecutive passes. | cause found in Stage 4 (the accessibility check could run in the one frame where the page title is not yet set) and the check corrected; then 10 consecutive passes of the whole browser suite, plus 2 more runs afterwards | Met (manual check) |
| P3-23 | No overview of compensation agreements | Owner sees all agreements on one page (founder to decide). | deferred as planned; agreements remain visible per project to the owner only | Deferred (planned) |

## 4. Found during the final verification (not among the 59)

| # | Problem | Since | Correction | Test |
|---|---|---|---|---|
| S4-1 | **Uploads from the site's real address were refused** ("Invalid origin."): group files, chat attachments and profile photos. The upload check compared the browser's address with the name the server uses for itself (`localhost`), which never matches behind a real domain. The audit never clicked an upload, and the automated tests used the one address where it happened to work | Before the audit | The upload check now compares with the site's public address (`SITE_URL`), the same rule the live chat uses (`src/lib/origin.ts`). The deployment guide now says that `SITE_URL` must be written exactly as people reach the site | `tests/stage4-uploads.test.ts`; walkthrough steps "uploads a profile photo", "sends a file in the chat", "uploads a file" |
| S4-2 | **Red unread badges were hard to read** (white on light red, contrast 3.7 to 1; the minimum is 4.5). They only appear when there are unread messages, so earlier crawls on used demo data missed them | Before the audit | Darker red (rose-700) on all five badges | `tests/stage4-checks.test.ts`; crawl |
| S4-3 | **The cause of the occasional browser-test failure (P3-22).** After a form that leads to another page, the framework sets the new page title one frame after the content (measured: about 8 ms). An accessibility check that ran in exactly that frame reported "page has no title". Visitors cannot notice this | Framework behaviour | The accessibility check in the browser tests now waits for the title. Nothing in the site was changed for this | 12 consecutive full runs since (`scripts/audit/e2e-repeat.sh` now keeps the evidence of any failed run, which is how this was found) |

## 5. Performance: where the added queries come from

| Page | Queries (recorded after the performance pass of 22 November → now) | Why |
|---|---|---|
| Admin, Members | 3 → 7 | The four member lists show their counts (P2-17) |
| Idea page | 6 → 7 | The idea's revision history (P2-9) |
| Admin, Email | 4 → 5 | Count for the "Newer / Older" paging (P3-11) |
| Group pages (overview, chat, meetings, discussions) | +1 each | The person's joining time: history, unread count and files start there (P1-1, P3-13) |
| Group, Research | 18 → 21 | The joining time and role for the file list, so nobody sees files from before they joined, and unsent chat files stay private (P1-1, P2-11) |

Median response times stayed within ±5 ms of the earlier figures on every page (`docs/performance/stage4.json`).

## 6. What was changed, stage by stage

The details are in each stage report; this is only the overview.

| Stage | Findings | Report |
|---|---|---|
| 0 | P1-10: local version control, verified backup, rollback notes | `docs/STAGE-0-REPORT.md` |
| 1 | P0-1, P1-1 to P1-9, P2-5; migrations M1, M2 | `docs/STAGE-1-REPORT.md` |
| 2 | The remaining 24 medium findings; migrations M3, M4 | `docs/STAGE-2-REPORT.md` |
| 3 | 20 low findings and six housekeeping items, including your approved cut list for the public pages | `docs/STAGE-3-REPORT.md` |
| 4 | Final verification; S4-1 to S4-3; the twelve audit scenarios as tests | this report, `docs/ROLE-WALKTHROUGH.md` |

In figures: 27 commits after the audit snapshot (tag `audit-baseline-2026-11-22`). 150 files of application code changed (including the database schema and its migrations). Four database migrations were applied with your approval, after a backup and a rehearsal on a copy each time. Tests grew from 134 to 348.

## 7. Deliberately not changed

| Point | Why |
|---|---|
| The placeholder owner in the development database (P0-1) | Your decision 4: nothing deleted. A production start is refused while such an account is active, and production starts from an empty database |
| Discussions not merged into chat (P3-7) | Kept as planned; each place now says who can read it |
| Public content editing stays with administrators (P2-13) | Your decision 6 |
| Overview of all compensation agreements (P3-23) | Deferred as planned; yours to decide |
| Prisma not moved to a new major version (P3-20) | A breaking change that needs its own testing. `npm audit fix --force` would downgrade Prisma and was never run |
| Backups not streamed (P2-22) | As planned (section 2 of the plan) |
| The contact form refuses messages sent within 3 seconds | A deliberate check against robots. Its answer ("We could not verify this submission") is vague; see section 9 |

## 8. Verified on this computer versus needing the real environment (plan, section 8.4)

| Area | Verified locally | Still needs production or an outside service |
|---|---|---|
| Sign-in, sessions, permissions, chat | Yes: automated tests, browser tests, walkthrough | Secure cookies and live chat through a real HTTPS proxy |
| Visitor address (sign-in limits) | Unit tests; check script | The real proxy's hop count (`TRUSTED_PROXY_HOPS`) |
| Uploads | Yes, after S4-1 | `SITE_URL` must match the real address exactly |
| Email | Every message to the local test inbox; failure handling | Real delivery, bounces, delivery reports (needs an email provider account) |
| Meetings | Link, access, end, automatic end after four hours | A real Google Meet call |
| Backups | Create, encrypt, restore, job lock | A copy kept away from this computer |
| Startup checks | Each refused configuration | The real production values |
| Legal texts | All 10 placeholders listed for the owner | Legal review and your facts |
| Accessibility | Automated checks on every page | A real screen reader; real phones |
| Load | Small local stress tests | Many simultaneous real users |

## 9. What remains before launch (your decisions or actions)

1. **Legal facts** (legal name, jurisdiction, contact address) and a lawyer's review of the policy drafts. Ten placeholders are listed on the admin overview under "Before launch". A production start refuses to run without legal name and jurisdiction.
2. **A copy of backups and code away from this computer.** I recommend an external drive. An outside service needs your approval.
3. **Hosting, domain and an email provider.** Each needs your approval, and may cost money.
4. **After deployment:** a real email to a real inbox, a real Google Meet call, chat and uploads through HTTPS, and one check with a screen reader and a phone.
5. **Optional:**
   - Remove the old `cowork_win1252_20261122` copy.
   - Decide on the compensation overview (P3-23).
   - Plan the move to the next stable Prisma version.
   - Reword the contact form's "too fast" answer to "Please take a moment and send it again."

## 10. For you to do now

**Restart your dev server on port 3000** (Ctrl+C in its terminal, then `npm run dev`). It is still running older code.
