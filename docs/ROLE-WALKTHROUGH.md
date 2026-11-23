# Role-by-Role Walkthrough (Stage 4)

Date: 23 November 2026. Plan: `docs/CORRECTIVE-IMPLEMENTATION-PLAN.md`, section 8.3.

This is the complete experience of the site, checked role by role in a real browser (Microsoft Edge) on a production build. It was run against a **throw-away copy** of the demonstration data (`cowork_walk_demo`), with its own local mail catcher and backup folder. The development database and the normal demonstration database were not touched.

**Result: 52 of 52 steps passed** in the final run (`scripts/audit/walkthrough.ts`, started with `bash scripts/audit/walkthrough-run.sh <folder>`). Every step and screenshot is listed in [`walkthrough-screenshots/walkthrough-results.md`](walkthrough-screenshots/walkthrough-results.md). The run also restored the owner's backup into a scratch database and verified it table by table.

The browser tests (`tests/e2e/phase1.spec.ts`, 21 tests) already cover large parts of these paths. The walkthrough covers what they do not. Where a path is covered by a browser test, this is stated.

## 1. Visitor

| What | How it was checked | Screenshot |
|---|---|---|
| Every public page opens (Home, How It Works, About, Pay & Fairness, Participation, Founding Contributors, FAQ, For Businesses, Community Rules, Privacy, Terms) | Walkthrough; also browser test "public pages and mobile layouts", which also checks accessibility and phone layout of every public page | `01-visitor-home.png` |
| Meetings described as Google Meet; no built-in voice or video promised anywhere | Walkthrough (text of Home, How It Works, FAQ, About) | — |
| Revenue wording matches decision 3; no percentage published | Walkthrough | `02-visitor-pay-and-fairness.png` |
| Contact form sends a message, which the owner then sees | Walkthrough (the owner step "sees the contact message") | `03-visitor-contact-sent.png` |

## 2. Applicant

| What | How it was checked | Screenshot |
|---|---|---|
| Create account, confirm email, reach the application | Browser test A | — |
| Same address twice: no second account, nothing revealed | Browser test A2 | — |
| Draft saved, resumed after signing in again, submitted once | Browser test B | — |
| Person with an account but no application is offered the application | Walkthrough | `04-applicant-not-started.png` |
| Fill in and submit | Walkthrough | `05-applicant-received.png` |
| Interview requested: the applicant sees the details | Walkthrough | `06-applicant-interview.png` |
| Waitlisted, then declined: visible, community closed | Walkthrough; browser test D | `07-applicant-declined.png` |
| Re-applies after a decline | Walkthrough | `08-applicant-re-applied.png` |
| Approval: the same account opens the community, acceptance email captured | Walkthrough; browser tests C and C2 | `09-applicant-approved-enters.png` |
| Password recovery; email outage | Browser tests E and F | — |

## 3. Approved member

| What | How it was checked | Screenshot |
|---|---|---|
| Moves between the three main areas | Walkthrough; browser test "navigation" | — |
| Edits the profile | Walkthrough (not exercised by the audit) | `10-member-profile-saved.png` |
| Uploads a profile photo | Walkthrough. **This found a defect**, see section 7 | `11-member-profile-photo.png` |
| Proposes an idea | Walkthrough; browser test 5 | `12-member-idea-published.png` |
| Minor correction keeps support and is recorded | Walkthrough | `13-member-minor-edit.png` |
| Material change resets support; the supporter is told | Walkthrough | `14-member-supporter-notified.png` |
| Comments; the author is notified | Walkthrough | `15-member-notifications.png` |
| Supports an idea | Walkthrough (Grace supports Tom's idea); browser tests 6–13 | — |
| Discovers a group, joins it, leaves it after confirming | Walkthrough; browser tests 20–26 | `16-member-joined-group.png` |

## 4. Group member and coordinator

| What | How it was checked | Screenshot |
|---|---|---|
| Live chat between two sessions | Walkthrough; browser tests 14–15 | — |
| File sent in the chat, received by the other member | Walkthrough (needed the upload fix in section 7) | `17-group-chat-attachment.png` |
| Joining and leaving appear in the chat as lines | Walkthrough | `18-group-chat-with-system-line.png` |
| Meeting started, seen by another member, ended | Walkthrough; browser tests 16–18 | `19-group-meeting-visible-to-member.png` |
| Meeting ends by itself after four hours | Automated tests (`tests/corrective-meetings.test.ts`); waiting four hours in a browser is not practical | — |
| Note and task added, task marked done | Walkthrough; browser test 19 | `20-group-research.png` |
| File uploaded to the group | Walkthrough (needed the upload fix in section 7) | — |
| Decision recorded | Walkthrough (not exercised by the audit) | `21-group-decision.png` |
| Purpose changed with a reason; announced to members | Walkthrough | `22-group-purpose-change-announced.png` |
| Coordinator role handed over, after a confirmation | Walkthrough (not exercised by the audit) | `23-group-new-coordinator.png` |
| Coordinator's account suspended: the longest-standing member takes over at once | Walkthrough | `24-group-succession.png` |

## 5. Administrator (not owner)

| What | How it was checked | Screenshot |
|---|---|---|
| Invited by the owner, activates the account from the emailed link | Walkthrough (not exercised by the audit) | `25-administrator-activated.png` |
| Must turn on two-step verification before the admin area opens | Walkthrough | `26-administrator-two-step-on.png` |
| Applications, members, moderation and public content open; content saved | Walkthrough; moderation decision in browser test 27 | `27-administrator-content-saved.png` |
| Owner-only areas (settings, backups, administrators) refused with a plain "no permission" page | Walkthrough; owner-only actions (deleting projects, removing agreements) refused in automated tests | `28-administrator-no-access.png` |
| Joins a group as an ordinary member: sees no earlier chat; the group sees "(administrator) joined" | Walkthrough | `29-administrator-admin-sees-no-earlier-chat.png` |

## 6. Owner

| What | How it was checked | Screenshot |
|---|---|---|
| Sees the visitor's contact message | Walkthrough | — |
| Saves organization settings | Walkthrough | `30-owner-settings.png` |
| Creates a project, assigns a participant, records a compensation agreement | Walkthrough | `31-owner-compensation.png` |
| Deleting the project is refused while an agreement exists; after removing the agreement it works | Walkthrough (not exercised by the audit) | `32-owner-project-deleted.png` |
| Back up now | Walkthrough | `33-owner-backup-written.png` |
| Restore that backup into a scratch database | `walkthrough-run.sh` (command line: there is no restore button, by design) | — |
| Retention preview and run | Walkthrough (not exercised by the audit) | `34-owner-retention.png` |

## 7. What the walkthrough found

1. **Uploads from the site's real address were refused** with "Invalid origin." This affected group files, chat attachments and profile photos. It was already in the code before the audit; the audit never clicked an upload, and the automated tests used the one address where it happened to work. **Corrected** (details in the final report).
2. **The contact form refuses a message sent less than 3 seconds after the page opened.** This is a deliberate check against robots, not a defect; a person typing takes longer. The answer it gives ("We could not verify this submission") is vague; see "Remaining suggestions" in the final report.
3. **Loading placeholder (P3-2)**: on a deliberately slow connection the placeholder appears while the next page is on its way and disappears when it arrives (`scripts/audit/slow-loading.ts`, screenshot `35-member-loading-placeholder-on-slow-connection.png`).

## 8. Honest notes on how the walkthrough was made

- The first run passed 37 of 50 steps. Except for the upload defect, every failure was a mistake in my script: a tick box not ticked, collapsed sections not opened, a check that looked before the page had answered, a wrong expectation about how an image attachment is shown. Each was corrected in the script, never in the site.
- One run had page-load timeouts in three browser sessions that did not occur in any other run. The pages loaded normally when checked directly. The cause was not established; they did not occur in the two later runs (the last one passed 52 of 52; the one before failed only on my wrong attachment check).
- Screenshots come from the final run.
