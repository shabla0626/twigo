# Member experience: usability review and simplification

Date: 2026-11-21 · Scope: the member community (`/community`), account settings, the admin navigation and (second pass) the public website.
Business rules, permissions, data and the backend were left as they were (see "What did not change").

Screenshots of the improved screens are in [`screenshots/`](screenshots/). They come from a local **demo database**
with fictional members (`npm run demo:seed`, then the "demo" server on http://127.0.0.1:3100). The black "N" badge in
the corner of the screenshots is the Next.js development indicator; it does not appear on the live site.

## 1. Assessment of the original interface

The review was done on the running site, signed in as a member who belongs to no group (Tom) and as a group
coordinator (Maya), on desktop (1280–1366 px) and phone (375 px) sizes.

| Screen | What was too complicated | Clicks for the main task (before → after) |
|---|---|---|
| Navigation | 7 sidebar items with equal weight; "Community Home" and "Business Ideas" showed almost the same thing; profile, settings and notifications competed with the main areas | — |
| Member home | 4 side panels (notifications, my groups, "ideas gaining support", "active group discussions" from groups the member is not in) repeating the feed | — |
| Idea feed / cards | No way to support an idea from the card; category and status badges first, title second | Support an idea: 2 → **1** |
| Idea form | The two questions that matter most (problem, how it makes money) were hidden behind "Add more detail" with 6 other fields; no examples | — |
| Idea page | On phones the Support box came **after the whole discussion**; "endorsement", "threshold" wording | — |
| Group directory | Search + 2 dropdowns + 3 sort pills; no Join button on cards | Join a group: 2 → **1** (from the card) |
| Group page | Large header, 7 tabs (4 locked for non-members) that scrolled sideways on phones; on phones the chat input was pushed below the screen | — |
| Leave group | Left the group immediately on one click, with no confirmation | — |
| Meetings | A "Type" dropdown instead of clear Start buttons; a technical side panel | — |
| Research | 9 topic sections each with its own open "add note" form; files and links on a separate tab | — |
| Account settings | No indication of the current section; no clear way back | — |
| Admin | 16 menu items in one flat list; one long sideways-scrolling strip on phones | — |
| Login, notifications, profile | Already simple; only touched by the new header | — |

## 2. Main problems identified

1. **Too many equal choices.** Seven menu items made the three things members actually do (find ideas, find groups, work in their groups) hard to see.
2. **The landing page repeated itself.** The feed plus four side panels answered the same questions twice.
3. **Supporting an idea took extra steps and jargon.** "Endorse", "threshold" and "endorsements needed" are not everyday words.
4. **Group pages were crowded, especially on phones.** Seven tabs, a tall header, and a chat whose message box was off-screen.
5. **Risky actions had no safety net.** "Leave group" acted immediately.
6. **Forms showed everything at once.** The research page showed nine forms; the idea form hid its key questions.

## 3. Changes made

**Navigation (Priority 1)**
- Main navigation is now exactly three areas: **Business Ideas**, **Explore Groups**, **My Groups** (sidebar on desktop, bottom bar on phones).
- A group page counts as *My Groups* when you belong to it, otherwise *Explore Groups*.
- Notifications moved to a bell in the header. My Profile, Account Settings, **Help** (new page), Admin panel and Sign out are in the account menu.
- The Business Ideas feed is the landing page after sign-in (`/community`). Old `/community/ideas` links redirect there.

**Ideas (Priority 2)**
- Landing page: a short welcome line, a prominent **Propose a Business Idea** button, a "meeting happening now" banner for your groups, one row of search and filters, and the feed. One side column (wide screens only) shows My Groups, new groups you can join and new notifications. On phones your groups appear as a row of chips above the feed.
- Idea cards show title, author, date, short description, a plain status ("Needs 1 more supporter", "Research group formed"), supporters, comments and a **Support** button (or "You support this" / "View group").
- Member-facing wording uses **support / supporters** instead of endorse / endorsements. The rule itself is unchanged: 2 distinct active members other than the author (configurable).
- Idea form: title, **What is the idea?**, **What problem or opportunity does it address?** (optional), **How might it make money?** (optional) and the area. Examples are shown in the fields. Everything else is under "Add more details (optional)".
- Idea page: on phones the Support box now comes right after the idea, before the discussion. The text explains that a group means "ready to investigate", not "proven".
- Notifications: "Your idea … has attracted enough support. A research group has been created." The note explains that success is not proven.

**Groups (Priority 3 and 4)**
- Explore Groups: one search row (search, category, stage, order). Cards show the name, the original idea (when different), a short description, members, the stage, and **Join group** / **View** / **Open group**.
- My Groups: cards show unread chat messages and a "Meeting now" badge.
- Group page: a compact header (name, stage, members, Join/Leave) and **5 tabs with icons**: Overview, Chat, Meetings, Research, Discussions. All five fit on a phone without sideways scrolling. Chat shows an unread dot and Meetings a green "live" dot.
- **Overview** answers what, who, where and what's next: the purpose, the original idea, a "meeting happening now" banner, **Next steps** (open tasks plus Open chat / Start a meeting / Add research buttons), the latest announcement, a stage indicator ("Step 2 of 6: Researching"), the member list and coordinator tools in one collapsed section.
- **Leave group** now asks "Leave this group?" first and confirms that the account stays active. On phones the button sits on the Overview tab to keep the chat on screen.
- **Chat** now fits the screen on phones, with the message box visible above the bottom bar. The header reads "Group chat" instead of "# general".
- **Meetings**: three numbered steps: (1) Open Google Meet, (2) paste the link, (3) **Start Video Meeting** or **Start Voice Meeting**. A live meeting shows a large **Join Meeting** button and **End meeting**, and explains where mute, camera and leave are in Google Meet. Past meetings and privacy notes are collapsed.
- **Research** (Shared Research): one "Add a research note" form with a Topic list, notes grouped by topic, and a "Not sure what to research?" guide. The To-do list, **Files & links** (moved here from the old Files tab) and Decisions sit on the same page.
- **Discussions**: announcements first (the coordinator posts them here), then discussions with a collapsed "Start a discussion" form.
- Members management stays at `…/members`, linked from Overview. The old `…/files` links redirect to Research.

**Secondary areas (Priority 5)**
- Account settings: the current section is highlighted, "Security" is renamed "Password & sign-in", and there is a "← Back to the community" link.
- Admin menu: grouped into People, Community, Business, Website & email and System. On phones it folds into one "Menu" button. Permissions are unchanged.

## 4. Files changed

- **Navigation and layout:** `src/app/community/(portal)/layout.tsx`, `src/components/community/portal-nav.tsx`, `src/components/community/icons.tsx`.
- **Ideas:** `src/app/community/(portal)/page.tsx` (feed), `ideas/page.tsx` (redirect), `ideas/new/page.tsx`, `ideas/[id]/page.tsx`, `ideas/[id]/edit/page.tsx`, `src/components/community/cards.tsx`, `src/components/community/idea-fields.tsx`.
- **Groups:** `src/app/community/(portal)/groups/page.tsx`, `groups/mine/page.tsx`, `groups/[slug]/layout.tsx`, `page.tsx`, `discussions/page.tsx`, `meetings/page.tsx`, `research/page.tsx`, `members/page.tsx`, `files/page.tsx` (redirect).
- **Group components:** `src/components/community/group-tabs.tsx`, `leave-group.tsx` (new), `start-meeting.tsx` (new), `chat.tsx` (size, header, placeholder), `members-only.tsx`.
- **Help and welcome:** `src/app/community/(portal)/help/page.tsx` (new), `src/app/community/welcome/page.tsx`.
- **Account and admin:** `src/app/account/layout.tsx`, `src/app/account/account-nav.tsx` (new), `src/app/admin/(panel)/layout.tsx`, `src/app/admin/(panel)/admin-nav.tsx`.
- **Small server-side changes (no logic changes):**
  - `src/app/community/actions.ts`: pages refresh after changes to files, links, tasks and announcements.
  - `src/server/community/ideas.ts`: notification and error wording.
  - `src/server/community/groups.ts`: group cards also load the idea title.
  - `src/lib/validation/community.ts`: plainer validation messages.
- **Tests and tooling:**
  - `tests/e2e/phase1.spec.ts`: updated, plus a new navigation test.
  - `scripts/seed-demo.ts`, `scripts/demo-config.ts`, `scripts/demo-screenshots.ts`.
  - `package.json` (`demo:seed`), `.claude/launch.json` ("demo" server).
  - `.gitignore`, `tsconfig.json`, `eslint.config.mjs`.

## 5. What did not change

- **Database and data:** the schema is the same and no migrations were added; existing records are untouched.
- **Business rules:** the support (endorsement) rule, its concurrency safety and configurability, group creation, joining and leaving, and coordinator succession all work as before.
- **Security and privacy:** permission checks (members-only areas, the coordinator and admin permission split), 2FA, file authorization, the meeting privacy rules (no recording, link shown only to members) and the absence of hidden admin access to chat.
- **Infrastructure:** the real-time chat (Socket.IO), email and Google Meet integration were not replaced, and no new services or costs were added.

## 6. Verification results (run on 2026-11-21)

| Check | Result |
|---|---|
| TypeScript (`npm run typecheck`) | 0 errors |
| Lint (`npm run lint`) | 0 problems |
| Unit and integration tests (`npm test`, real PostgreSQL) | **103 passed** |
| Browser tests (`npm run test:e2e`, Microsoft Edge, fresh production build, separate sessions per person) | **15 passed** |

The browser tests cover the requested journeys with real separate accounts:

| Journey | Covered by | Verified |
|---|---|---|
| A. Propose an idea | test 5 | Member opens Business Ideas → **Propose a Business Idea** → fills title, "What is the idea?", "How might it make money?", area → sees it published |
| B. Support an idea | tests 6–8 | Second member sees "Needs 2 more supporters", opens the idea, **Support this idea** → "1 of 2 supporters needed"; no group yet |
| C. Create a group | tests 9–13 | Third member presses **Support** directly on the card → exactly one group, with author, supporters and coordinator |
| D. Join a group | tests 20–26 | Non-member finds the group in Explore Groups; chat, meetings and research stay members-only until **Join group** |
| E. Communicate | tests 14–18 | Real-time chat between two sessions, saved after reload; **Start Voice Meeting** and **Start Video Meeting**; another member sees "meeting is happening now" and **Join Meeting** opens the Google Meet link; **End meeting** |
| F. Conduct research | test 19 | A note is added under a topic, a task is added, and the task appears under "Next steps" on Overview |
| G. Leave a group | tests 20–26 | **Leave group** → confirmation → left. An open chat tab loses access immediately, private areas close, and the account stays active |
| Navigation | new test | Exactly three main areas; the right one is highlighted (a member's own group counts as My Groups); account menu shows Profile, Settings and Help; old `/community/ideas` and `…/files` links redirect |
| Admin, security, moderation | tests 2–3, 27, 28, security | 2FA sign-in, invitations, reports and audit log, members refused from `/admin`, applications and projects still work |

**Accessibility:** automated WCAG 2 A/AA scans (axe) with no serious or critical issues on these pages:
- community home, idea page, a meeting in progress, Shared Research, Help, Explore Groups, group members, admin audit log;
- the public pages.

These scans found and fixed three problems:
- the upload field had no label (it was already missing on the old Files tab);
- the admin menu headings were too faint;
- one line of text on group cards was too faint.

**Phone layout (390 × 844):** no sideways scrolling on any of these pages:
- Business Ideas, Propose, Explore Groups, My Groups, Help;
- the group's Overview, Meetings, Research and Chat tabs.

The test also confirms the chat message box is fully visible above the bottom navigation.

**Desktop and phone screenshots:** checked by eye against the demo data (see `screenshots/`).

## 7. Remaining issues and incomplete work

**Not done or not possible here**
- **Mute, unmute, camera and leave controls are inside Google Meet, not this site**, because meetings use Google Meet (your decision). The site explains where those buttons are. In-app voice and video would need a separate project with its own costs.
- **"Upcoming meetings" are not shown, only meetings happening now.** The platform has no meeting scheduling yet. Adding it would be a new feature, which this task excluded.
- **Not redesigned (beyond the new header and menu):** the profile, member-profile and notifications pages, and the content of the admin pages. They were reviewed and judged acceptable.
- **Public website:** the About, Who Can Participate, Pay & Fairness, Founding Contributors, FAQ, Contact and For Businesses pages kept their content. They only got the new header and footer (see section 8).

**Worth watching**
- **Chat vs. Discussions:** members may still confuse the two. Each tab explains the difference, but real use will tell.
- **"Support" vs. "endorsement":** the member side now says "support". The admin pages, the database and the configuration setting still say "endorsement". This is intentional (internal terms stay internal), but staff should know both words mean the same thing.
- **Choosing an area is still required** when proposing an idea ("Other" is available).
- **On phones, the "who is online" list in the chat appears below the chat.**

**Not verified**
- **No testing with real members.** All checks were automated tests plus my own review. A short session watching 2–3 non-technical people use the site would be the best next check.
- **Not tested with a real screen reader** (only the automated scans).

## 8. Public website (second pass, approved by the founder)

**Before**
- **Header:** 8 menu links, plus Sign in and Apply. On phones, the menu listed all 8.
- **Home page:** 12 sections, about 1,000 words and 8,570 px tall on desktop. It had two different "how it works" step lists:
  - the old application → matching → payment process;
  - the newer member community process.

  Decorative widgets (a "live" world clock and a revenue-flow diagram) added length without helping visitors decide.
- **How It Works:** 10 numbered steps that described the older top-down matching model, then the member-community model again underneath.
- **Phones:** the header was 14 px wider than a 375 px screen. An older styling bug meant "Sign in" never hid on phones as intended.

**Changes**
- **Header:** 4 links (How It Works, About, Pay & Fairness, FAQ), Sign in and **Apply to join**. On phones: the 4 links, a collapsed "More pages", Apply and Sign in.
- **Footer:** every page, grouped under Joining, Organization (including "For Businesses", the customer inquiry page) and Policies.
- **Home page:** 9 sections, 633 words, 5,783 px tall. One four-step journey replaces both process lists: Apply and join → Share and support ideas → Research together → Agree before any paid work.
  - The "not an investment club or recruitment scheme" message moved into the mission section.
  - The world clock, revenue-flow diagram and duplicated icon strip were removed.
  - The FAQ preview shows 3 questions instead of 5.
  - **All photos are still used, at their original paths.**
- **How It Works:** three plain parts that match how the platform now works:
  1. Apply and join
  2. Share ideas and research them together
  3. Agree in writing, deliver and get paid

  10 steps → 10 shorter steps, 647 → 441 words, and the duplicate community block removed. The "three things that are always true" section stays.
- **Wording:**
  - "Apply to join" replaces "Apply to participate" and "Apply as a founding contributor".
  - "Pay & Fairness" is the menu label for the compensation page.
  - "For Businesses" is the label for Work With Us.
- **Unchanged:** the honest statements (no fees, no guaranteed income, founding stage, no invented results) and every legal page.

**Verification**
- All 15 browser tests and 103 unit and integration tests pass.
- The accessibility scan now covers all 12 public pages (it used to cover 5), with no serious issues.
- A new test confirms:
  - the 4 header links and the grouped footer;
  - that every public page fits a 375 px phone screen without sideways scrolling;
  - that the phone menu's "More pages" works.
- Screenshots: `public-desktop-01-home.png`, `public-desktop-02-how-it-works.png`, `public-phone-01-home.png`, `public-phone-02-menu.png`.

**Files changed:**
- `src/components/site/nav.ts`, `header.tsx`, `mobile-nav.tsx`, `footer.tsx`, `community-model.tsx` (now `JourneySteps`), `blocks.tsx`;
- `src/app/(site)/page.tsx`, `how-it-works/page.tsx`, `compensation/page.tsx` (label), `apply/page.tsx` (title);
- `tests/e2e/phase1.spec.ts`, `scripts/demo-screenshots.ts`.

**Not changed:** the content of the About, Participation, Compensation, Founding Contributors, FAQ, Contact and For Businesses pages. They are single-topic pages that are now easier to reach, and could be shortened in a later pass if you want.
