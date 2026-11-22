# Stage 3 Report — Low-Priority Corrections and Housekeeping

Date: 22 November 2026. Plan: `docs/CORRECTIVE-IMPLEMENTATION-PLAN.md`, section 7.

**Result: 19 of the 23 low findings are corrected and verified, together with the six housekeeping items. The observation left open in Stage 2 is explained.** The other four, stated plainly:

- **P3-3** (repeated blocks on public pages): nothing removed; the cut list in section 6 waits for your approval.
- **P3-20** (advisories in build tooling): reviewed; no fixed release exists yet (section 4).
- **P3-22** (a browser test that failed once): investigated; the last 15 runs in a row passed, but two earlier failures are unexplained (section 3, point 5).
- **P3-23** (overview of compensation agreements): stays deferred, as planned.

Stage 4 has not started.

## 1. Verification summary

| Check | Result |
|---|---|
| Type check | 0 errors |
| Lint | 0 errors, 0 warnings |
| Automated tests | **328 passed** (274 from before + 54 new), 12 skipped (old audit probes, by design) |
| Browser tests on a production build | **21 passed.** For P3-22 the whole suite was then run 19 more times (section 3, point 5) |
| Page crawl as five kinds of user (desktop and phone) | 142 pages loaded, 0 error pages, 0 console errors, 0 serious accessibility issues, 0 pages with sideways overflow, 0 timeouts (there were 2 in Stage 2) |
| Click-through in a real browser (new dialogs opened and cancelled, banners, icon) | 15 of 15 checks passed (`scripts/audit/stage3-check.ts`; changes no data) |
| Database | No migration in this stage. The development database was not touched |

## 2. What was corrected

| Finding | Correction | Tests |
|---|---|---|
| **P3-1** No site icon | Icon files drawn from the existing logo mark (no outside image) | 1 + browser check |
| **P3-2** No loading indicators | A plain placeholder for the member area, the admin area and the applicant pages; it appears only when a page takes longer than a moment | 1 |
| **P3-4** A member without an application was offered "Start my application" | Shown "You Are a Member" with a button to the community; no offer to apply | 4 (with P3-5) |
| **P3-5** "You can enter" shown under "access paused" | The page now chooses ONE headline and ONE explanation in a fixed order, so two statements can never contradict each other | see P3-4 |
| **P3-6** Filter boxes cut off their text | Boxes on Ideas and Groups are as wide as their text | 1 + screenshot |
| **P3-7** Four places to talk | Nothing merged (as decided in the plan). Each place now says in one line who can read it: chat (members of this group only), discussions and announcements (every approved member), idea comments (every approved member) | 1 |
| **P3-8** Three accessibility issues | Name for the chat file button; the two admin links are underlined | 1 + automated accessibility check in the crawl |
| **P3-9** Admin lists cramped on a phone | On a phone, the less-used application filters are folded behind "Show filters"; the search box stays visible | 1 + screenshot |
| **P3-10** Email log under 15 templates; a sentence twice | The delivery log comes first, templates are folded below it; the sentence appears once | 1 |
| **P3-11** Only the latest 100 to 200 records reachable | Audit log, inquiries and email log are paged (50 per page, "Newer / Older") with one filter each | 5 |
| **P3-12** Notifications jumped when read; dead links | Reading no longer changes the order; a new event for the same subject still moves it to the top. A link to something that was removed ends on a plain page inside the member area | 3 |
| **P3-13** New group member saw the whole history as unread | Only messages written after joining count. My Groups asks the database once for all groups instead of once per group | 2 |
| **P3-14** One-click actions that cannot be undone | "Close idea", "Make coordinator" and "Remove" ask first and say what cannot be undone. A removed member is notified. On the admin group page the organization can "Allow to join again"; the person is not put back automatically, the group sees a line in its chat, and it is audited | 5 |
| **P3-15** Actions failed without a message | Every one-click action (delete note, task, link, file, comment, discussion; task status; end meeting; close idea) shows the reason under the button when it is refused. An unknown group is "Group not found." | 3 |
| **P3-16** Leftovers of the earlier invitation flow | Removed: an unused function, an unused action, the dead "Send a new invitation" link, the redirect page behind it, the unused `finance.view` permission, and the never-used idea-attachment paths. The account activation flow stays (administrator invitations use it) | 3 |
| **P3-17** Confirmation link signed in without the second step; address in the page address | An account with two-step verification, and every staff account, is confirmed and then sent to the normal sign-in. After sign-up the address travels in a short-lived cookie only the server can read | 4 |
| **P3-18** Banners showed any text from the address | A page shows a message only if it is a fixed code or if this site itself wrote and signed it in the last five minutes | 6 |
| **P3-19** Small sign-in gaps | One email rule for every form and tool; password-change attempts limited to 5 per 15 minutes; an owner or administrator who does nothing for 60 minutes must sign in again | 6 |
| **P3-20** Advisories in build tooling | Reviewed, no change possible yet (section 4) | — |
| **P3-21** Documentation out of date | Corrected: password hashing, the removed invitation step, the administrator idle sign-out, the staging checklist | — |
| **Observation from Stage 2** Background requests that "never finish" | Cause established: not a defect of the site (section 3, point 6). The crawl no longer waits on them | — |
| **P3-22** One browser test failed once under load | Investigated; the original failure did not come back, but the suite is not yet proven fully steady (section 3, point 5) | — |

### Housekeeping items

| Item | Correction | Tests |
|---|---|---|
| Privacy page wrote a job record on every view | A preview leaves no record; real runs are recorded as before | 1 |
| Test-database safety check | Only a database whose **name** ends in `_test` may be emptied by the tests | 1 |
| Security header | Sent without "preload" until the domain is final | 1 |
| Recipient address in an error log line | A failed email logs the kind of failure, a short code and the delivery id only | 1 |
| Comment counters never decreased | The number equals the readable comments after a deletion or a moderation removal; older wrong numbers correct themselves at the next deletion | 3 |
| Old databases | Listed in section 7; nothing removed | — |

## 3. Problems found during this stage, and what was done

1. **Three more pages displayed address text that the audit had not listed** (group members, group meetings, and — through a shared helper — every admin page). They were found by searching the whole source while fixing P3-18 and are covered by the same correction. A test now scans the source so that this cannot come back unnoticed.
2. **Two result messages were never displayed at all.** After "Remove member" and "Make coordinator" the site sent a message to a page that did not show it. Both are shown now.
3. **Both invitation functions could bring back a suspended or deactivated account** (the audit named one). Both now refuse.
4. **A mistake of mine that the browser tests caught.** For P3-8 I first gave the hidden file field of the chat the name "Attach a file to your message". The page then had two controls answering to "Message", and the chat test failed. Corrected properly: the hidden field is no longer a control of its own (the visible "Attach a file" button opens it), which is also better for keyboard and screen-reader users. The suite passed after that.
5. **P3-22, honestly.** The browser suite was run 19 times in a row on the same build, mostly with other heavy work running on purpose (the full automated suite, the page crawl, a second server starting and stopping).
   - **17 runs passed, and the last 15 in a row passed.** The plan's criterion (10 consecutive passes) is met.
   - **Two early runs failed**, each in a different test (the application draft, and meetings), each once, and each quickly, not by waiting too long. Both happened while I was starting a second server or running a diagnostic browser at the same time. I could not make either happen again in 15 further runs with the same kind of load.
   - **Their cause is not established.** The evidence of those two runs was overwritten by the next run, because the first version of my repeat script did not keep it. That was my mistake; the script (`scripts/audit/e2e-repeat.sh`) now keeps the traces and screenshots of every failed run.
   - The failure from the audit (password recovery, test F) did not occur in any of the 19 runs. Since Stage 1 the page answers before the email is sent, so that step no longer depends on how busy the machine is.
   - One automated test (backup and restore) ran into its 30-second limit once under this load. It creates a database and applies every migration; its limit is now 3 minutes. No logic was changed.
   - Recommendation: repeat the 10-run check during Stage 4, now that evidence is kept.
6. **The observation from Stage 2 is explained.** On a repeat visit, the browser answers the background requests for the three static public pages (home, privacy, terms) from its own cache and refreshes them quietly afterwards. The test tooling is never told that this refresh has ended, so it believed the page was still loading. The server answers these requests in a few thousandths of a second, and nothing is wrong for a visitor. The crawl now waits for the page itself instead (`scripts/audit/crawl.ts`), and the two timeouts are gone. The diagnostic is kept as `scripts/audit/rsc.ts`.
7. **Three checks of my own click-through script failed at first** although the site was right: the script looked before the page had finished updating, and once it read the page's internal data instead of the visible text. The script was corrected; nothing in the site was changed for this.

## 4. P3-20, the dependency advisories

`npm audit --omit=dev` still reports 4 high advisories. All four are in two packages (`deepmerge-ts`, `effect`) that only Prisma's command-line tool uses when it reads its configuration. They do not run when the website serves a visitor.

- The project uses Prisma 6.19.3, which is the newest release of version 6. It still requires exactly the affected versions, so there is no fixed release to move to within version 6.
- Newer major versions exist (7, and release candidates of 8). Moving to a new major version is a breaking change that needs its own testing; it is not part of this stage.
- `npm audit fix --force` would *downgrade* Prisma to 6.12. It was not run, as the plan requires.

Recommendation: leave as is for launch; plan the move to the next stable major version as a separate, tested task.

## 5. Differences from the plan

| Point | What happened | Why |
|---|---|---|
| P3-18 "fixed message codes" | Signed messages instead of a table of codes; the existing short codes remain | About 70 places write messages, many with the exact reason from the server ("This project has 1 compensation agreement…"). A table would have meant rewriting every reason as a code. A signature gives the same guarantee (unknown text is never displayed) and keeps each sentence next to the code that produces it |
| P3-13 | "Unread" starts at the joining time by comparison, not by writing a "read" marker at joining | Same result, and it also corrects the badge for people who joined before this change |
| P3-16 | The older applicant invitation function was kept | It is still needed to retry an old invitation email, and existing tests of the activation flow use it. It can no longer touch a blocked account |
| P3-19 | The idle limit is fixed at 60 minutes, not a setting | One less setting to get wrong. A background connection (open chat) does not count as activity, so an administrator who only reads a chat for an hour signs in again at the next click |
| Commits | Four grouped commits | Same reason as in Stage 2: the findings share files |

## 6. P3-3: repeated blocks on the public pages (needs your approval)

Nothing was removed. These are the blocks that say what another page already says. Each line names where the same fact remains.

| # | Page | Block | Why it is a repeat | Where the fact stays |
|---|---|---|---|---|
| 1 | Home | "Common questions" (three questions) | The same three questions are on the FAQ page | FAQ page; the menu and the footer link to it |
| 2 | About | "The value of cooperation" | Says again what "Why we exist" on the same page and the mission on Home say | About, "Why we exist"; Home, "Our mission" |
| 3 | Founding contributors | "People we welcome" (illustrative photographs) | Same message as "Who can participate" on Home and "Everyone can contribute" on Participation | Home; Participation |
| 4 | How It Works | "Three things that are always true" | No guarantee, written agreement first, no fees: all three are on Pay & Fairness and in the closing banner | Pay & Fairness; the closing banner |
| 5 | Pay & Fairness | Notice "Before any project begins" | Same as part 3 of How It Works and the list directly above it | How It Works, part 3; the commitments list |
| 6 | Participation | Heading and intro of "Everyone can contribute" | Same as the third card of "Who can participate" on Home. The note "About training" in it is unique and would stay | Home; the training note stays on Participation |
| 7 | About, Pay & Fairness, Participation, FAQ | The closing banner ("Help build something worthwhile…") | The same banner closes all seven pages, and every page has "Join" in its header | It stays on Home, How It Works and Founding Contributors |

My recommendation: 1, 2, 3 and 7. They remove the most length with no loss of information. I would keep 4 and 5 (they are trust statements at the point where a reader needs them) and leave 6 as it is (small gain). The transparency note at the bottom of Home also repeats "Honestly, today" on About; I recommend keeping it.

## 7. Old databases (nothing removed)

| Database | What it is | Recommendation |
|---|---|---|
| `cowork` | Development database with your test data | Keep |
| `cowork_demo`, `cowork_e2e`, `cowork_test` | Demonstration data, browser tests, automated tests | Keep (recreated by their scripts) |
| `cowork_win1252_20261122` | The copy kept from before the character-set correction | Can be removed once you are sure nothing from before 22 November is missing. Tell me and I remove it |
| `cowork_restore_test` | Scratch database of the automated backup-and-restore test. It is replaced at every test run | Keep (removing it is pointless: the next test run creates it again) |

## 8. Not verified in this stage

- Real email delivery (still no provider), a real Google Meet call, behaviour behind a real proxy, a real production start with real settings.
- "Remove member", "Make coordinator" and "Close idea" were opened and cancelled in a browser, and their effect was tested through the server code. They were **not confirmed in a browser** on purpose, so that the demonstration data stays as it is.
- "Allow to join again" on the admin group page, the paging links, and the folded filters were tested through the server code and seen in screenshots; they were not clicked in a browser.
- The idle sign-out for administrators was tested by setting the time in the database, not by waiting an hour.
- The two early browser-test failures (section 3, point 5) are unexplained.
- Screenshots: `docs/corrective-screenshots/stage3-*.png` (eight, from the demo site).

## 9. For you to do

**Restart your dev server on port 3000** (Ctrl+C in its terminal, then `npm run dev`). It still runs older code.

## 10. Next

Stage 4 (final verification of all 59 findings, the role-by-role walkthrough and the final report) starts only after your approval.
