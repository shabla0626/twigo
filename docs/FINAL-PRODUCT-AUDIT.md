# Final Product Audit

Audit date: 22 November 2026. Scope: the whole existing project (source code, database schema, running website, tests, configuration, documentation).

Nothing in the product was changed during this audit. No feature was added, no page was redesigned, no business rule was modified, and no real data was edited or deleted. The only files added are this report, the screenshots in `docs/audit-screenshots/`, and temporary diagnostic tools (`scripts/audit/`, `tests/audit-probe.test.ts`), listed in section 10.4.

**How to read the evidence labels.** Every finding carries one of these:

| Label | Meaning |
|---|---|
| **Confirmed by test** | I ran a check against the isolated test database and saw the behaviour. |
| **Confirmed in browser** | I saw it in a real browser session on the demo site (fictional accounts only). |
| **Confirmed in code** | The code clearly does this, but I did not execute the scenario. |
| **Suspected** | The code suggests it; it was not reproduced. Treat as "needs checking". |

Priority classes: **P0** critical (blocks correct operation, compromises security, or loses data), **P1** high (important function broken or incomplete), **P2** medium (significant usability or quality problem), **P3** low (minor).

---

## 1. Executive summary

**The core product works.** A visitor can understand the organization, create an account, confirm their email, apply, be approved, enter the community, propose an idea, get two supporters, and land in exactly one automatically created research group with working real-time chat, shared notes, tasks and meeting links. This full path was run end to end in real browser sessions (21 of 21 browser tests pass on a production build) and is backed by 134 passing automated tests. Of 140 pages visited as five different kinds of user, 137 loaded correctly, 1 showed an error page (a member opening the admin area, P2-2) and 2 timed out once and loaded normally when retried. No page overflows on a phone screen.

**It is not ready to go live.** The audit found 1 critical, 10 high, 25 medium and 23 low issues. None of them is a reason to redesign anything. Most are small, well-defined corrections. They fall into five groups:

1. **Privacy and access gaps (highest priority).**
   - An administrator can join any research group with one click and read its entire private chat, with no notice to members and no record (P1-1). This contradicts the rule that administrators have no hidden access to private conversations.
   - A chat connection keeps working after its session is signed out (P1-2).
   - The limit on sign-in attempts can be bypassed, or turned into a site-wide lockout (P1-3).
   - A lower-level administrator can deactivate the owner (P1-4), and can delete private compensation records (P1-6).
2. **Launch blockers that are not code.**
   - The real database still contains a placeholder owner account without two-step verification (P0-1), plus the founder's own test records (P2-23).
   - The project has no version control and no copy outside this computer (P1-10).
   - Production settings are not checked at startup (P1-8).
   - Legal placeholders are visible on public pages (P2-20).
3. **Consistency of rules.** A suspended coordinator is never replaced (P1-9). People whose community access was removed still count as group members (P2-7). Several rare situations end in an error page or a dead end (P2-3, P2-4, P2-5, P2-6).
4. **Things that look more complete than they are.**
   - Voice and video are Google Meet links, not built into the site (P2-10). This was a founder decision, but the public wording overstates it.
   - The "Back up now" button reports failure even when the backup succeeded (P1-7).
5. **Simplification.** The admin area has 16 menu items and three overlapping "people" lists (P2-17). Groups have four separate places to talk. Some leftover code and one unused email template remain from the earlier invitation flow.

**What could not be verified here** (it needs real external services): real email delivery through Resend, real Google Meet calls, behaviour on a real domain with HTTPS, and legal adequacy of the policy texts. Details are in section 10.5.

**Recommended order:** first protect the work (version control, backup), then fix the P0 and P1 items, then the rule-consistency items, then simplify. The full plan is in section 12.

---

## 2. Current project architecture

| Part | What it is |
|---|---|
| Application | One Node.js process (`server.ts`) running Next.js 16 (App Router, React 19, TypeScript strict, Tailwind 4), Socket.IO for live chat, and a scheduler for daily retention and backup jobs. |
| Database | PostgreSQL through Prisma 6 (46 tables, 31 enums, 5 migrations). All working databases are UTF-8. |
| Sign-in | Database sessions (cookie holds a random token; only its hash is stored). Passwords hashed with scrypt; older bcrypt hashes upgraded at sign-in. Two-step verification (TOTP) required for owners and administrators. |
| Membership model | Four separate facts per person: account status, email confirmed, community membership, application status. Community access = active account + confirmed email + approved membership (or an administrator role). |
| Email | SMTP through nodemailer. Local test inbox in development. Resend is prepared but not connected. |
| Files | Private folder on disk; type checked by content; images re-encoded; downloads only through an access-checked route. |
| Meetings | Members paste a Google Meet link. Nothing is recorded. No audio or video runs inside the site. |
| Size | 73 pages, 7 API routes, 215 source files, about 20,400 lines. |
| Tests | 134 automated tests (Vitest, separate test database), 21 browser tests (Playwright, production build, separate database), accessibility checks with axe. |

**Roles:** OWNER (everything), ADMIN (explicit limited list), MEMBER. Inside a group: COORDINATOR or MEMBER.

**Design assumption that matters for hosting:** the site must run as exactly one always-on process. Sign-in limits, the settings cache and chat presence live in that process's memory.

---

## 3. Inventory of implemented functionality

"Verified" means it was exercised during this audit, by browser test (B), automated test (T) or page crawl (C).

### 3.1 Public website

| Function | State | Verified |
|---|---|---|
| Home, How It Works, About, Pay & Fairness, FAQ, Who Can Participate, Founding Contributors, For Businesses, Contact | Working | B, C |
| Privacy Notice, Terms, Community Rules | Working, but drafts with visible placeholders (P2-20) | C |
| Contact and business inquiry forms (spam protection, server-side checks) | Working | T, earlier manual check |
| Phone layout, no sideways scrolling | Working | B, C |
| Search-engine files (robots, sitemap, share image) | Working. No site icon (P3-1) | C |

### 3.2 Joining

| Function | State | Verified |
|---|---|---|
| Create account, duplicate-address protection | Working | B, T |
| Email confirmation (single-use link, resend, correct a typo) | Working | B, T |
| 3-step application with saved draft, review, single submission | Working | B, T |
| Status page (received, under review, interview, waitlisted, declined, accepted) | Working | B, T |
| Withdraw and re-apply | Working | T |
| Password recovery | Working | B, T |
| Email outage handling (nothing lost, clear message, resend) | Working | B |
| Earlier account-less applications linked only after the address is proven | Working | T |

### 3.3 Member community

| Function | State | Verified |
|---|---|---|
| Three-area navigation (Business Ideas, Explore Groups, My Groups), help page | Working | B, C |
| Profile | Page loads; editing not exercised in a browser in this audit | C |
| Propose, edit, close an idea; comments; report | Working. Editing is allowed too late (P2-9) | B (propose, comment), T |
| Support an idea; group created automatically at 2 supporters | Working, exactly one group even with simultaneous clicks | B, T |
| Notifications (in-app, optional email copy, preferences) | Working. Recipients include people who lost access (P2-7) | T, C |
| Discover, join, leave, rejoin groups | Working. Simultaneous leaves can error (P2-5) | B, T |

### 3.4 Research groups

| Function | State | Verified |
|---|---|---|
| Overview, members, stage (6 steps), announcements | Working | B, C |
| Text chat: live between separate sessions, kept after reload, resend-safe | **Genuinely working** | B, T |
| Voice and video | **Link sharing only.** The site stores a Google Meet link and notifies members. The call itself happens in Google Meet. | B (link flow only) |
| Shared research notes, to-do list | Working | B |
| Files and links | Upload rules and access tested at service level; the upload button was not exercised in a browser in this audit | T |
| Decisions, discussions | Pages load; creating a decision was not exercised in a browser in this audit | C |
| Coordinator tools (transfer, remove member, set stage, announcements) | Working when the coordinator leaves normally; broken when the coordinator is suspended (P1-9) | T |
| Private areas closed to non-members | Working | B, T |

### 3.5 Administration

| Function | State | Verified |
|---|---|---|
| Applications: list, filters, detail, notes, decisions, approve and notify, email applicant | Working | B, T |
| Members: list, detail, suspend, reactivate, deactivate, pause or remove community access | Working. Permission gap (P1-4) | T (service level) |
| Participants (project staffing records) | Working. Overlaps Members (P2-17) | B |
| Administrators (invite, roles) | Page loads; inviting not exercised | C |
| Reports and moderation, idea moderation | Working | B |
| Research groups (archive, suspend, assign coordinator, approve as project) | Working. Reopen is a dead end for empty groups (P2-6) | T |
| Projects, roles, milestones, assignments, private compensation agreement | Working. Deletion removes agreements (P1-6). No overview of all agreements | B (basic), T |
| Customer inquiries | Working, list only | C |
| Email: settings display, connection check, test email, templates, delivery log, retry | Working locally. Real delivery not verified | T, C |
| Website content editor | Page loads; saving not exercised in this audit | C, T |
| Settings (support threshold, retention periods) | Page loads; saving covered by tests | C, T |
| Privacy and retention (preview, run) | Working | T |
| Backups (list, job history, back up now) | Backup works; the button reports failure (P1-7). Restore tested into a separate database | T |
| Audit log | Working, latest 200 entries only | C |

### 3.6 Deliberately not present (by founder decision)

Payments, wallets, investment or capital features; in-site audio or video; recording of meetings; direct member-to-member private messages; public member directory.

---

## 4. Missing and incomplete functionality

| # | Item | Kind | Issue |
|---|---|---|---|
| 1 | In-site voice and video | Not built (Google Meet links instead, by decision). Public wording overstates it | P2-10 |
| 2 | Real email delivery | Prepared, never connected to a real provider | Section 9 |
| 3 | Replacement of a coordinator who is suspended or loses access | Missing | P1-9 |
| 4 | Recovery of a group that lost all members | Documented but does not work | P2-6 |
| 5 | A way for the owner to reset a locked-out administrator's two-step verification | Missing | P1-5 |
| 6 | Overview of all compensation agreements | Missing (reachable only inside each project) | P3-23 |
| 7 | Loading indicators between pages | Missing everywhere | P3-2 |
| 8 | Friendly "you don't have permission" page | Missing (generic error shown) | P2-2 |
| 9 | Paging and filters for audit log, inquiries, email log | Missing (latest 100 or 200 only) | P3-11 |
| 10 | Startup check of production settings | Incomplete | P1-8 |
| 11 | Off-site copy of backups and uploaded files | Manual, undocumented in the admin area | P2-22 |
| 12 | Site icon | Missing | P3-1 |

**Visual features that do not do what they appear to do:**

- "Start Video Meeting" and "Start Voice Meeting" do the same thing (store a label next to the same link).
- "Back up now" says "Backup failed" after a successful backup.
- "Reopen" on an empty archived group does nothing visible (the group is archived again immediately).
- "Send a new invitation" on a member page links to a page that only redirects back.

---

## 5. Findings from the five user perspectives

### A. First-time visitor

Tested: all 12 public pages on desktop and phone width, as a signed-out visitor.

**Can an ordinary visitor understand it?**

| Question | Answered on the site? |
|---|---|
| What the organization is | Yes, on the home page and About. |
| Why it exists | Yes ("Accomplish together what is hard to accomplish alone"). |
| How members cooperate | Yes, in four steps on the home page and ten on How It Works. |
| How revenue may be generated | Partly. "Real products and services for real customers" is clear, but there is no example of what such a service could be. |
| How compensation works | Mostly. The order (customer pays → costs → agreed shares) is clear. What the organization itself keeps is not mentioned (P2-19). |
| How to join | Yes. One "Join" button everywhere, three visible steps. |
| Whether payment or investment is required | Yes, stated very clearly and repeatedly: never. |

**Trust and professionalism.** The site is honest: it says there is one founder, no team and no clients yet, and it does not invent testimonials, staff or addresses. That honesty is a strength.

**Problems found:**

- Bracketed placeholders are visible on Contact, Privacy and Terms, for example "[Official contact email to be confirmed]" (P2-20, screenshot 09).
- How It Works promises "chat, voice and video meetings" in each group; the site provides Google Meet links (P2-10).
- The same information is spread over seven pages (Home, How It Works, About, Pay & Fairness, Who Can Participate, Founding Contributors, FAQ) with repeated statements and the same closing banner on each. The home page is about 5,800 pixels tall on a desktop and about 10,000 on a phone. Shortening is a simplification candidate, not a defect (P3-3).
- No site icon, so the browser tab shows a blank icon (P3-1).

### B. New applicant

Tested end to end in browser sessions: registration, email confirmation, 3-step application with draft and resume, status page, interview request, waitlist, decline, approval with notification, sign-in after approval, community access, password recovery, and an email outage in the middle of registration. All passed.

The applicant never met an unnecessary step in the normal path. Problems exist only in unusual situations:

- If an application is accepted while the person's account is suspended, they are never given access, and pressing Approve again shows a false success message (P2-3).
- If an administrator re-opens a declined application after the applicant has started a new one, the administrator gets an error page (P2-4).
- A person whose access was paused sees "you can enter the member community" directly under the "paused" notice (P3-5).
- The time the site takes to answer "forgot password" reveals whether an address has an account, and the lockout message does the same (P2-16).

### C. Ordinary approved member

Tested: navigation, idea list and detail, proposing an idea, comments, support, notifications, group discovery, joining, leaving, the help page (browser tests and a 40-page crawl as a member). All pages loaded without errors.

The community is understandable without instructions: three menu items, one clear main button ("Propose a Business Idea"), plain labels.

Problems found:

- The supporter counter can show "2 of 2 supporters" while no group exists, when one supporter was suspended (P2-8).
- An idea can be completely rewritten after people supported it (P2-9).
- A member who opens `/admin` sees "Something went wrong" (P2-2, screenshot 01).
- An approved member with no application on file (only possible for accounts created by the seed script or directly by an administrator) sees "Application Not Started" with a "Start my application" button (P3-4, screenshot 02).
- Filter boxes on the ideas page cut off their own text on desktop ("All categori", "Newest firs") (P3-6).
- There are four places to talk: idea comments, group chat, group discussions and announcements (P3-7).

### D. Research group member and coordinator

Tested with independent browser sessions: member A publishes an idea; B supports (no group yet); C supports; **exactly one group** exists with A as coordinator and B, C as members; A and B chat live in separate sessions and the messages survive a reload; meetings are started and joined; a research note and a task are created; member D discovers the group, joins, sees private areas, leaves and loses access. All passed. The automated tests additionally confirm one group under six simultaneous supports.

**Genuinely working communication:** text chat.

**Interface only:** voice and video. The site shares a Google Meet link; the browser's camera and microphone are in fact disabled for the site itself by its security headers.

Problems found:

- Suspending the only coordinator leaves the group without a working coordinator, and later produces two coordinators (P1-9).
- A chat connection keeps sending and receiving after the session is signed out elsewhere (P1-2).
- An administrator can join, read everything and leave unseen (P1-1, screenshot 03).
- Two members leaving at the same moment: one gets a database error (P2-5).
- Meetings never end by themselves, so "happening now" can stay forever (P2-10).
- Unsent chat attachments are visible to the group and never cleaned up; attachments outlive removed messages (P2-11).
- A new member sees the whole chat history as unread (P3-13).
- Not exercised in a browser in this audit: file upload button, recording a decision, coordinator transfer. They are covered at service level by automated tests (files, succession) or by code reading only (decisions).

### E. Administrator and founder

Tested: sign-in with two-step verification, all 20 admin pages, application review and approval, moderation of a report, projects (browser tests and crawl). All pages loaded.

**Can a single founder manage the organization efficiently?** Yes for the daily path (review an application, approve, notify), which is clear and well explained on one page. Less so elsewhere:

- 16 menu items in 5 sections. Three of them (Applications, Members, Participants) describe the same people from different angles, and one person can carry four different statuses (P2-17, screenshot 04).
- The Overview shows 11 counters but no list of "things waiting for you" (screenshot 05).
- The email page puts the delivery log, the part used most, below 15 templates (screenshot 07).
- On a phone, the application filters fill the screen before any result (screenshot 08).

Security and correctness problems in the admin area: P1-4, P1-5, P1-6, P1-7, P1-8, P2-13, P2-18, P2-21, P2-22.

---

## 6. Business logic and data integrity findings

### 6.1 State of the real database (read-only check)

Checked with `scripts/audit/integrity.ts` (23 read-only checks).

| Check | Result |
|---|---|
| Encoding | UTF-8 (the old WIN1252 copy still exists as a rollback) |
| Duplicate accounts or addresses differing only by case | None |
| More than one open application per person | None |
| Active membership without confirmed email or without profile | None |
| Ideas marked "group formed" without a group, or the reverse | None |
| Groups without an active coordinator, wrong member counts, missing chat channel | None |
| Support given by an idea's own author | None |
| Live sessions of suspended accounts | None |
| Migrations | 5 applied, none unfinished |

Two things need attention: one owner account has no two-step verification and a placeholder address (P0-1), and the database holds the founder's own test records (P2-23).

### 6.2 Rules verified as correct

- **One person, one account.** Addresses are stored lower-case and unique; simultaneous sign-ups with the same address create one account (T).
- **Email verification.** Links are single-use, expire, are bound to the address they were sent to, and only their hashes are stored (T).
- **Duplicate application prevention.** Enforced in the database itself; simultaneous submissions produce one application (T).
- **Membership approval.** One transaction; approving twice creates nothing twice; two administrators deciding at the same moment produce one consistent result (T, probe 5).
- **Support eligibility.** The author cannot support; suspended or unapproved people cannot; duplicates are ignored (T).
- **Automatic group creation.** Exactly one group under simultaneous supports; a database constraint backs this up (T, B).
- **Sessions.** Suspension ends existing sessions; a paused member can sign in but has no community access (probe 7).
- **Data preservation.** Retention never touches compensation, projects or audit records (T).

### 6.3 Rules that break in realistic situations

| Situation | What happens | Issue |
|---|---|---|
| The only coordinator is suspended or loses community access | Stays coordinator; nobody can do coordinator tasks; later a second coordinator appears | P1-9 |
| A person's community access is paused or removed | Still an active group member, still counted, still notified, still assignable to projects | P2-7 |
| Two members leave one group at the same moment | One request fails with "deadlock detected" (18 of 36 in the probe). Final data stays consistent | P2-5 |
| Everyone leaves a group; an administrator reopens it | Archived again immediately; nobody can join | P2-6 |
| An administrator supports an idea | Counts toward the threshold; the administrator becomes a founding member with chat access | P1-1 |
| A supporter is suspended, another supports | Counter shows the threshold reached but no group forms; nothing re-checks later | P2-8 |
| Application accepted while the account is not active | Membership is never granted; re-approving reports success falsely | P2-3 |
| A project or participant with a compensation agreement is deleted | The agreement is deleted with it, by a role that may not even view it | P1-6 |

---

## 7. UI and UX findings

**Overall:** the visual design is consistent and calm. One accent colour, one type family, the same card and button styles everywhere, clear headings, readable text sizes. Forms have visible labels, helper text and per-field errors. Empty states exist and say what to do next. No redesign is needed.

| Area | Finding | Issue |
|---|---|---|
| Visual consistency | Consistent across public site, community and admin | none |
| Typography, contrast | Automated contrast checks pass on all crawled pages | none |
| Images | Local photographs, labelled as illustrative | none |
| Navigation | Community: 3 items, clear. Admin: 16 items, overlapping | P2-17 |
| Information hierarchy | Admin overview is counters only; email log below templates | P2-17, P3-10 |
| Buttons | Two meeting buttons do the same thing; some one-click actions cannot be undone | P2-10, P3-14 |
| Forms | Filter dropdowns clip their text on desktop | P3-6 |
| Error messages | Generic "Something went wrong" for a permission problem; several actions fail silently | P2-2, P3-15 |
| Loading states | None between pages. Unnoticeable locally; visible on a slower connection | P3-2 |
| Empty states | Present and helpful | none |
| Success messages | Present. One is false ("Backup failed" on success), one is false in a rare case ("Approved") | P1-7, P2-3 |
| Accessibility | Automated checks (axe, WCAG 2 A and AA): 3 issues on 140 pages | P3-8 |
| Desktop | Works at 1366 px on every page | none |
| Mobile | No sideways scrolling on any of the 140 pages at 390 px. Admin lists are cramped | P3-9 |
| Unnecessary content | Public pages repeat each other; four places to talk in a group; unused email template | P3-3, P3-7, P3-16 |

Not covered: testing with a real screen reader, and testing on physical phones (browser emulation only).

---

## 8. Security findings

### 8.1 Verified as solid

- **Passwords.** scrypt with a per-password salt; constant-time comparison; older bcrypt hashes are accepted and upgraded only after a correct password (T). The recent change introduced no regression.
- **Sessions.** `__Host-` cookie, HttpOnly, SameSite=Lax, Secure in production; token stored only as a hash; revoked on password change, reset, suspension and role change.
- **Two-step verification.** Required for owners and administrators before the admin area opens (T); secrets encrypted; recovery codes hashed and single-use.
- **Server-side authorization.** Every admin page and action calls a permission check; every community action checks membership on the server; group-only areas are checked in services, routes and the chat server.
- **Tokens.** Verification, reset and invitation links are random, hashed in storage, single-use, expiring.
- **Files.** Type detected from content; SVG and HTML refused; images re-encoded; random storage names; downloads access-checked and sandboxed.
- **Chat content.** Rendered as plain text; no injection path found.
- **Private pages.** Never cached, never indexed, no referrer leaks.
- **Recent performance changes.** Per-request caching is scoped to one request and one user; every cached group loader sits behind a membership check; the 60-second settings cache holds only the support threshold and retention numbers (no security setting).
- **Development-only features.** The local test inbox starts only in development; its link is hidden in production. One label problem remains (P2-21).
- **No secrets in the browser,** no payment or investment code anywhere.

### 8.2 Problems

P0-1, P1-1, P1-2, P1-3, P1-4, P1-5, P1-6, P2-1, P2-13, P2-14, P2-16, P2-24 and several P3 items. Full details are in section 12.

---

## 9. Production readiness findings

**Not ready.** The table separates what was tested locally from what needs a real service.

| Area | Tested locally | Needs a real external service or a founder decision |
|---|---|---|
| Hosting | Production build runs and passes all browser tests | An always-on Node host with a persistent disk. Must be one instance |
| Database | UTF-8, migrations, backup and restore | A production PostgreSQL created as UTF-8 |
| Domain and HTTPS | Not testable locally | Domain, TLS proxy forwarding WebSockets, correct client-address forwarding (P1-3) |
| Email | Every template sent to the local test inbox; failure handling; webhook signature checks | Resend account, verified sending domain, API key, webhook secret. **Real delivery has never been observed** |
| Meetings | Link flow | Google Meet accounts for the people who start meetings |
| Backups | Create, verify, restore | Encryption key, off-site storage, copy of uploaded files (P2-22) |
| Legal | Drafts exist and are labelled as drafts | Legal entity, jurisdiction, contact address, reviewed Privacy Notice, Terms and revenue policy (P2-19, P2-20) |
| Monitoring | Health endpoint exists | Uptime monitor and log alerts. Health does not detect bad settings (P1-8) |
| Code safety | None | Version control and an off-machine copy (P1-10) |

**Environment variables.** Present in `.env`: database, site address, secrets, organization name, SMTP host and port, sender, admin notification address, retention, jobs switch. Empty today: legal name, jurisdiction. `.env` is correctly excluded from version control patterns, but there is no repository.

**Dependency check.** `npm audit` reports 4 high-severity advisories, all inside Prisma's command-line tooling (configuration loading), not in code that handles visitor input (P3-20).

---

## 10. Automated and manual test results

### 10.1 Automated checks (all run during this audit)

| Check | Result |
|---|---|
| TypeScript (`tsc --noEmit`) | 0 errors |
| Lint (`eslint .`) | 0 errors, 0 warnings |
| Unit and integration tests (Vitest, 7 files) | **134 passed**, 0 failed |
| Production build | Succeeded (built as part of the browser tests) |
| Browser tests (Playwright, Edge, production build) | **21 passed**, 0 failed, on the final run |
| Accessibility (axe, WCAG 2 A and AA) inside the browser tests | Passed on the pages those tests check |
| Dependency audit | 4 high, in build tooling only |

**One irregularity, reported honestly.** On the first browser-test run, test F (password recovery) failed: the confirmation message did not appear within 30 seconds, and the 12 tests after it did not run. At that moment three code reviews, a page crawl and a second test suite were running on the same computer. A second attempt failed to start because my own diagnostic file had a type error (my mistake, corrected). The third run, on a quiet machine, passed 21 of 21. The cause of the first failure was not established; it is listed as P3-22.

### 10.2 Page crawl (manual verification tool)

A production build connected to the demo database, visited as five users at desktop (1366 px) and phone (390 px) width.

| User | Pages | Result |
|---|---|---|
| Visitor (signed out) | 19 | All loaded. Private addresses redirect to sign-in |
| Account without application | 8 | All loaded. Community redirects to the application |
| Applicant (application received) | 8 | All loaded. Community redirects to the status page |
| Approved member | 40 | 39 loaded. `/admin` returns an error page (P2-2) |
| Owner | 65 | All loaded |
| **Total** | **140** | 137 OK, 1 error page, 2 timeouts that could not be reproduced |

- Sideways overflow at phone width: none.
- Serious accessibility issues: 3 (P3-8).
- Browser console errors: a missing site icon (P3-1) and the admin error above.

### 10.3 Failure-scenario probes (isolated test database)

`tests/audit-probe.test.ts`, 12 scenarios. Results are quoted in the issues they support.

| # | Scenario | Result |
|---|---|---|
| 1 | Only coordinator's account suspended | Stays coordinator; no replacement (P1-9) |
| 2 | Only coordinator's community access removed | Stays coordinator and counted; chat access correctly refused; still notified; two coordinators later (P1-9, P2-7) |
| 3 | Last two members leave simultaneously | 12 of 24 requests failed with a deadlock; data consistent (P2-5) |
| 4 | Coordinator and a member leave simultaneously | 6 of 12 requests failed with a deadlock; data consistent (P2-5) |
| 5 | Two administrators decide one application simultaneously | One wins, the other is refused cleanly. Correct |
| 6 | Accepted application later declined | Refused. Correct |
| 7 | Session opened before suspension or pause | Suspension ends it; pause removes community access. Correct |
| 8 | Empty archived group reopened | Still archived; joining refused (P2-6) |
| 9 | Administrator supports an idea | Counts; group created with the administrator inside (P1-1) |
| 10 | Owner presses "Back up now" | Backup file written; owner shown "Backup failed"; job recorded as failed (P1-7) |
| 11 | Administrator joins, reads chat, leaves | Allowed; 0 notifications; 0 audit entries; no trace (P1-1) |
| 12 | Session signed out while chat is open | Connection stays; can still send, receive and page history (P1-2) |

### 10.4 Targeted browser checks (demo site, fictional accounts)

| Check | Result |
|---|---|
| Redirect after "confirm it's you" with a crafted address | Browser was sent to an outside website (P2-1) |
| Member opens `/admin` | Status 500, "Something went wrong" (P2-2) |
| 25 wrong sign-ins, each with a different made-up forwarding header | 0 blocked (P1-3) |
| Wrong sign-ins with no forwarding header | Blocked at the 17th attempt of this check, when the shared counter reached its limit of 20 (the crawl's own sign-ins had already used part of it). A different person with the correct password was then also blocked (P1-3) |
| "Forgot password" answer time | 238–253 ms for an address with an account, 135–138 ms without (P2-16) |
| Messages after repeated wrong passwords | Existing account: "Account temporarily locked". Unknown address: "Invalid email or password" (P2-16) |

**Temporary diagnostic files added by this audit** (safe to delete after review):

- `scripts/audit/` — `crawl.ts`, `outline.ts`, `checks.ts`, `integrity.ts`, `q.ts`, `net404.ts`, `reqlog.ts`, `reqtime.ts`
- `tests/audit-probe.test.ts` — skipped in the normal test run; runs only with `AUDIT_PROBES=1`
- `docs/audit-screenshots/`

Test data: only the isolated `cowork_test`, `cowork_e2e` and `cowork_demo` databases were written to. No email left this computer.

### 10.5 Not verified

- Real email delivery, bounces and the Resend delivery webhook (no account exists).
- Real Google Meet calls.
- Behaviour on a real domain: HTTPS, secure cookies, proxy headers, WebSocket through a proxy.
- More than a handful of simultaneous users; behaviour with a database on another machine.
- Real screen-reader use; physical phones.
- Legal adequacy of any policy text.
- Every item labelled "Confirmed in code" or "Suspected" in section 12.
- In a browser: profile editing, file upload button, recording a decision, coordinator transfer, website content saving, administrator invitation, running retention, and deleting a project.

---

## 11. Screenshots of significant problems

All in `docs/audit-screenshots/`.

| File | Shows | Issue |
|---|---|---|
| `01-member-opens-admin-generic-error.png` | A member opening the admin area sees "Something went wrong" | P2-2 |
| `02-approved-member-sees-application-not-started.png` | An approved member is offered "Start my application" | P3-4 |
| `03-administrator-can-join-any-group-in-one-click.png` | The owner, not a member, is offered "Join group" on a private chat | P1-1 |
| `04-admin-person-page-member-and-not-a-member.png` | One person labelled "Member" and "Not a member" on the same page | P2-17 |
| `05-admin-overview-eleven-counters.png` | Admin overview: 11 counters, no to-do list | P2-17 |
| `06-meetings-are-google-meet-links.png` | Meetings are a three-step paste of a Google Meet link; two buttons do the same | P2-10 |
| `07-admin-email-page-log-below-fifteen-templates.png` | Delivery log placed under 15 templates; local test address in the page text | P2-21, P3-10 |
| `08-phone-admin-applications-filters-first.png` | On a phone, filters fill the screen before results | P3-9 |
| `09-public-contact-placeholder.png` | Public contact page with a bracketed placeholder | P2-20 |

---

## 12. Prioritized corrective action plan

### 12.1 Suggested order of work

| Step | What | Issues |
|---|---|---|
| 0 | Protect the work: put the project under version control and keep a copy off this computer. Make a verified database backup | P1-10 |
| 1 | Close the privacy and access gaps | P1-1, P1-2, P1-3, P1-4, P1-5, P1-6, P2-1 |
| 2 | Make the rules consistent | P1-9, P2-3, P2-4, P2-5, P2-6, P2-7, P2-8, P2-9 |
| 3 | Make operations trustworthy | P1-7, P1-8, P2-21, P2-22 |
| 4 | Correct messages and wording | P2-2, P2-10, P2-16, P2-18, P2-19, P2-20 |
| 5 | Simplify and remove leftovers | P2-17, P3 items |
| 6 | Launch preparation with the founder | P0-1, P2-23, section 9 |

### 12.2 Decisions needed from the founder before work starts

1. **Administrators and private chat (P1-1).** Options: (a) administrators cannot join groups at all; (b) they can join, but every join and leave is announced in the chat and recorded. Should an administrator's support for an idea count toward creating a group?
2. **Meetings (P2-10).** Keep Google Meet links and correct the public wording, or plan in-site calls later (a new feature, outside this stage).
3. **What the organization keeps from revenue (P2-19).** The public explanation needs one sentence that matches the adopted policy.
4. **Test data in the real database (P2-23, P0-1).** Clean selected records, or start the production database empty.
5. **Editing an idea after support (P2-9).** Lock it, or allow it and notify supporters.
6. **Which administrator powers stay owner-only (P2-13).**

### 12.3 P0 — Critical

#### P0-1. A placeholder owner account without two-step verification is active in the real database

- **Evidence label:** Confirmed by read-only database check.
- **Location:** real database `cowork`, table `User`; password source `.env.devadmin.local`.
- **Evidence:** two OWNER accounts exist. One uses a placeholder address at `example.test`, has no two-step verification, and last signed in on 22 November 2026. A local file (`.env.devadmin.local`) holds an administrator password that appears to belong to it; I did not open the value.
- **Steps to reproduce:** `npx tsx scripts/audit/integrity.ts cowork`, section "admins without two-step verification".
- **Root cause:** a development account created early was never removed.
- **Impact:** harmless while the site runs only on this computer. If this database is taken live as it is, anyone who learns that password can sign in, set up their own authenticator (see P1-5) and become a full owner.
- **Recommended resolution:** before any deployment, deactivate or remove this account (a data change, so it needs the founder's approval). Add a production startup check that refuses to run while an active owner has a reserved test address or no two-step verification.
- **Acceptance criteria:** the integrity check lists no owner or administrator without two-step verification; a production start with such an account fails with a clear message.

### 12.4 P1 — High

#### P1-1. Administrators can read any group's private chat without anyone knowing

- **Evidence label:** Confirmed by test (probes 9 and 11) and in browser (screenshot 03).
- **Location:** `src/lib/auth/session-core.ts:27-30` (administrators get community access); `src/server/community/groups.ts:142-159` (`joinGroup`: no role check, no notice, no audit); `src/realtime/server.ts:111-141` (full history on join); `src/server/community/ideas.ts:119` (administrators count as supporters).
- **Evidence:** an owner joined a group, read a message written before joining, and left. Result: 0 notifications to members, 0 audit entries, member list unchanged afterwards.
- **Steps to reproduce:** as an administrator open any group, press "Join group", open Chat, scroll back, press "Leave group".
- **Root cause:** administrators are treated as ordinary community participants, and joining a group is silent for everyone.
- **Impact:** contradicts the founder's rule that administrators have no hidden access to private conversations, and the statement in `docs/ARCHITECTURE.md` that they cannot browse private chats. Members would reasonably feel watched if they learned of it.
- **Recommended resolution:** per founder decision 1. Either refuse staff roles in `joinGroup`, or post a visible "X joined / X left" line in the chat for every join and leave and write an audit entry. Decide whether administrator support counts toward the threshold.
- **Acceptance criteria:** no administrator can read a chat message without a lasting, member-visible signal and an audit entry; a test proves it.

#### P1-2. A chat connection keeps working after its session is signed out

- **Evidence label:** Confirmed by test (probe 12).
- **Location:** `src/realtime/server.ts:93-104` (session checked only when connecting); `src/app/(auth)/actions.ts:57-63`, `src/app/account/actions.ts:88-100`, `changePassword` in `src/server/accounts.ts` (no disconnect signal).
- **Evidence:** after the session was revoked, the open connection stayed connected, a new message was accepted, live messages from others were still received, and older history could be loaded.
- **Steps to reproduce:** open a group chat in browser B. In browser A, use "Sign out of other sessions" or change the password. Browser B still chats.
- **Root cause:** the chat server re-checks the person on every action, but never the session.
- **Impact:** a forgotten or stolen session keeps reading and writing private chat until the tab is closed.
- **Recommended resolution:** remember the session on the connection; disconnect matching connections when a session is revoked (sign-out, sign-out-others, password change).
- **Acceptance criteria:** within a few seconds of any of those actions the connection is closed and sending is refused; a test covers it.

#### P1-3. The limit on sign-in attempts can be bypassed, or used to lock everyone out

- **Evidence label:** Confirmed in browser (checks B and E).
- **Location:** `src/lib/security.ts:11-16`; used by sign-in, registration, password reset, verification resend and the contact form. `server.ts:21` listens on all network interfaces in production.
- **Evidence:** 25 wrong sign-ins, each sent with a different made-up `X-Forwarded-For` header: none blocked. With no header at all: every visitor shares one counter of 20 attempts per 15 minutes. Once it was full, a different person with the correct password was blocked too.
- **Steps to reproduce:** `AUDIT_URL=<demo url> npx tsx scripts/audit/checks.ts` (sections B and E).
- **Root cause:** the visitor's address is taken from a header the visitor controls; when the header is absent, all visitors share one counter named "unknown".
- **Impact:** unlimited password guessing per network, unlimited sign-up and contact-form spam (each sending email), or a trivial way to stop everyone signing in for 15 minutes. With Caddy configured as documented the header is overwritten, so the documented setup is mostly safe; any other setup is not.
- **Recommended resolution:** a setting for the number of trusted proxies; take the address from the right position or from the connection itself; listen on 127.0.0.1 by default behind a proxy; never share one counter for "unknown".
- **Acceptance criteria:** a made-up header from a direct client does not change the counter; requests without the header are counted per connection address; documented proxy examples still work.

#### P1-4. A lower-level administrator can deactivate or reactivate owners and other administrators

- **Evidence label:** Confirmed in code (not executed).
- **Location:** `src/server/accounts.ts:365-390` (`reactivateUser`, `deactivateUser`); `src/app/admin/actions/community.ts:40-53`.
- **Evidence:** `suspendUser` contains "Only the owner can suspend administrators". The two neighbouring functions have no such check. The page hides the buttons, but the server does not refuse.
- **Steps to reproduce:** as ADMIN, submit the member-status action with an owner's id and `action=deactivate` (works while more than one owner is active), or `action=reactivate` on an administrator the owner suspended.
- **Root cause:** the rule is enforced only in the page, not on the server.
- **Impact:** an administrator can lock the owner out or undo the owner's disciplinary action. No ADMIN account exists today, so there is no present exposure.
- **Recommended resolution:** apply the same owner-only rule in both functions and in `setMembership`.
- **Acceptance criteria:** an ADMIN is refused for every status action on an OWNER or ADMIN; a test covers each branch.

#### P1-5. Two-step verification can be set up without re-entering the password, and older sessions stay valid

- **Evidence label:** Confirmed in code (not executed).
- **Location:** `src/app/account/actions.ts:108-121`; `src/server/accounts.ts:264-277`; `src/lib/auth/guard.ts:53`.
- **Evidence:** the setup actions check only that someone is signed in. After setup, other sessions are not ended. The admin guard checks that the account has two-step verification, not that this session passed it. No owner tool exists to reset another administrator's two-step verification.
- **Steps to reproduce:** with a session of an account that has no two-step verification, start and confirm setup without being asked for the password.
- **Root cause:** setup is not treated as a sensitive action.
- **Impact:** whoever holds a session of such an account can attach their own authenticator and lock the real owner out permanently. Together with P0-1 this is the most direct route to a takeover.
- **Recommended resolution:** require recent password confirmation for setup; end other sessions after setup; add an owner-only, audited reset for administrators; consider checking the second step per session.
- **Acceptance criteria:** setup without recent confirmation is redirected to "confirm it's you"; other sessions are signed out afterwards; tests cover both.

#### P1-6. A lower-level administrator can delete private compensation records

- **Evidence label:** Confirmed in code and schema (not executed).
- **Location:** `src/app/admin/actions/projects.ts:56-63`; `src/app/admin/actions/participants.ts:19-26`; `prisma/schema.prisma` (ProjectAssignment and CompensationAgreement use cascade deletion).
- **Evidence:** deleting a project or removing a participant deletes their assignments and compensation agreements. Both actions need only `projects.manage` or `participants.manage`, which ADMIN holds, while ADMIN may not even view compensation. The audit entry says only "project.deleted".
- **Steps to reproduce:** as OWNER record an agreement; as ADMIN delete the project (type DELETE).
- **Root cause:** hard deletion cascades into financial records and is guarded by a weaker permission than the records themselves.
- **Impact:** financial and contract records can disappear without the owner knowing. Such records usually must be kept.
- **Recommended resolution:** refuse deletion while an agreement exists (or archive instead of deleting); require the compensation permission for anything that removes an agreement; record what was removed.
- **Acceptance criteria:** no agreement row can disappear except through an audited owner action; a test covers both paths.

#### P1-7. "Back up now" reports failure although the backup was written

- **Evidence label:** Confirmed by test (probe 10).
- **Location:** `src/app/admin/actions/community.ts:248-260`.
- **Evidence:** the backup file was created; the owner was shown "Backup failed. See the job history."; the job was recorded as failed with the text of the success redirect as its "error".
- **Steps to reproduce:** as OWNER press "Back up now" on `/admin/backups`.
- **Root cause:** the success redirect is issued inside the `try` block, so the `catch` block treats it as an error.
- **Impact:** the founder cannot trust the backup screen and the job history is wrong. The backups themselves are fine.
- **Recommended resolution:** redirect after the `try`/`catch`.
- **Acceptance criteria:** a manual backup shows success and a job marked successful; an automated test covers the button.

#### P1-8. Production settings are not checked at startup

- **Evidence label:** Confirmed in code; partly observed (a build made for one address served another address in its page metadata).
- **Location:** `src/lib/env.ts:8, 56-63`; `server.ts`; `src/app/api/health/route.ts`; `docs/DEPLOYMENT.md:63`.
- **Evidence:** the site address defaults to `http://localhost:3000`. The production check covers only two secrets and runs on the first request, not at startup. The health address reports "ok" from the database alone. The site address is also fixed into pages at build time.
- **Steps to reproduce:** start in production without a site address: startup succeeds, health is green, and every emailed link points to localhost.
- **Root cause:** settings are validated lazily and incompletely.
- **Impact:** a wrong deployment looks healthy while password-reset and confirmation emails contain dead links.
- **Recommended resolution:** validate settings before the server starts; in production require an https site address that is not local, plus email sender and contact address; make health fail when settings are invalid; document that the address must be set when building.
- **Acceptance criteria:** a production start with a missing or invalid value exits with a clear message; the deployment guide matches.

#### P1-9. A coordinator who is suspended or loses access is never replaced

- **Evidence label:** Confirmed by test (probes 1 and 2).
- **Location:** `src/server/accounts.ts` (`suspendUser`, `setMembership`); `src/server/community/groups.ts:167-177` (`ensureCoordinator` runs only on leave or reopen).
- **Evidence:** after suspension the group showed the suspended person as its only coordinator, not flagged for administrators. After another member left, a second coordinator was promoted; after reinstatement the group had two coordinators.
- **Steps to reproduce:** suspend a group's coordinator (also happens through "suspend author" in moderation).
- **Root cause:** succession is tied to leaving a group, not to losing access.
- **Impact:** nobody can set the stage, post announcements, remove a member or request review until an administrator notices.
- **Recommended resolution:** when an account is suspended or community access is paused or removed, hand the role to the longest-standing eligible member (or flag the group); do not restore the role automatically.
- **Acceptance criteria:** suspending a coordinator immediately leaves exactly one eligible coordinator or a flagged group; reinstatement never produces two.

#### P1-10. The project has no version control and no copy outside this computer

- **Evidence label:** Confirmed (`git status` reports "not a git repository").
- **Location:** project folder.
- **Evidence:** no repository exists. `.gitignore` is present but unused.
- **Steps to reproduce:** run `git status` in the project folder.
- **Root cause:** never set up.
- **Impact:** a disk failure or a mistaken edit can destroy the product with no way back. There is no history of what changed and why.
- **Recommended resolution:** create a repository, confirm `.env` files are excluded, make a first commit, and keep a private remote copy (a private remote needs the founder's approval because it is an external service).
- **Acceptance criteria:** the project has a commit history and a second copy in another location; no secret file is tracked.

### 12.5 P2 — Medium

#### P2-1. After "confirm it's you", the site can send the person to an outside website

- **Evidence label:** Confirmed in browser (check A).
- **Location:** `src/app/account/actions.ts:80-83`.
- **Evidence:** opening `/account/confirm?next=/%5Cexample.org/phish` and entering the password made the browser request `http://example.org/phish`.
- **Steps to reproduce:** as above, signed in as any user.
- **Root cause:** the check rejects `//` but not `/\`, which browsers treat the same way. The sign-in pages already use a stricter check.
- **Impact:** a crafted link can move someone to a look-alike page right after they typed their password.
- **Recommended resolution:** one shared strict check for all "next" addresses (same origin only).
- **Acceptance criteria:** the address above lands on `/account`; a test covers `//`, `/\` and control characters.

#### P2-2. Opening an admin page without permission shows "Something went wrong"

- **Evidence label:** Confirmed in browser (screenshot 01; crawl status 500).
- **Location:** `src/lib/auth/guard.ts` (throws a "Forbidden" error); `src/app/error.tsx`.
- **Evidence:** a member opening `/admin` received status 500 and the generic error page. The same happens to an ADMIN opening an owner-only page.
- **Steps to reproduce:** sign in as a member and open `/admin`.
- **Root cause:** no dedicated "no permission" page.
- **Impact:** looks like a crash; fills the error log with false alarms.
- **Recommended resolution:** redirect members to their own start page; show administrators a plain "You don't have permission for this page".
- **Acceptance criteria:** no 500 for permission refusals; the message names the reason.

#### P2-3. An application accepted while the account is not active never gives access, and re-approving says it did

- **Evidence label:** Confirmed in code (not executed).
- **Location:** `src/server/admin/applications.ts:147, 176-191`; `src/app/admin/actions/applications.ts:42-47`; `src/server/accounts.ts:309-310`.
- **Evidence:** acceptance grants membership only when the linked account is active and verified. Otherwise nothing grants it later. Pressing Approve again returns "already", and the page then states the person can enter the community.
- **Steps to reproduce:** suspend an applicant's account, accept the application, reactivate the account, press Approve again.
- **Root cause:** "already accepted" is reported from the application status alone.
- **Impact:** the applicant sees "accepted" with no way in; the administrator is told everything is fine.
- **Recommended resolution:** on re-approval, grant access when it is missing; report "already" only when membership is really active.
- **Acceptance criteria:** re-approving grants access; the message always matches the real state; a test covers it.

#### P2-4. Re-opening a declined application fails with an error page if the applicant has started a new one

- **Evidence label:** Confirmed in code (not executed).
- **Location:** `src/server/admin/applications.ts:99, 151`; `src/server/membership-application.ts:254-255`; migration `20261122034054`.
- **Evidence:** the database allows one open application per person. Re-opening the old one while a new draft exists violates that rule, and the error is not caught.
- **Steps to reproduce:** decline; the applicant starts a new application and saves step 1; set the old one to "Under review".
- **Root cause:** missing handling of the uniqueness error.
- **Impact:** the administrator sees a crash.
- **Recommended resolution:** show "This applicant has started a new application" and hide the re-open choice in that case.
- **Acceptance criteria:** a clear message instead of an error page; a test covers it.

#### P2-5. Two members leaving the same group at the same moment: one gets a database error

- **Evidence label:** Confirmed by test (probes 3 and 4).
- **Location:** `src/server/community/groups.ts:196-205` (`leaveGroup`).
- **Evidence:** 18 of 36 simultaneous leave requests failed with "deadlock detected". Final data was consistent in every run.
- **Steps to reproduce:** `AUDIT_PROBES=1 npx vitest run tests/audit-probe.test.ts -t "3\."`.
- **Root cause:** both transactions update membership rows and then the same group row without first locking the group.
- **Impact:** rare; one person sees an error and must press Leave again.
- **Recommended resolution:** lock the group row first (as endorsements already do with the idea row), or retry once on a deadlock.
- **Acceptance criteria:** the probe shows 0 failed requests.

#### P2-6. Reopening a group that has no members does nothing, so the documented recovery is a dead end

- **Evidence label:** Confirmed by test (probe 8).
- **Location:** `src/server/community/groups.ts:277-292, 142-146`.
- **Evidence:** after "reopen" the group was still archived; a join attempt returned "Archived groups cannot be joined".
- **Steps to reproduce:** let every member leave a group; as administrator press Reopen.
- **Root cause:** reopen calls the succession routine, which archives a group with no members.
- **Impact:** an emptied group can never be revived, contrary to `docs/ARCHITECTURE.md`.
- **Recommended resolution:** on reopen with no members, keep the group open and flagged for administrators so someone can join and be made coordinator.
- **Acceptance criteria:** a reopened empty group can be joined, and the first eligible member can be made coordinator.

#### P2-7. People whose community access is paused or removed remain active group members

- **Evidence label:** Confirmed by test (probe 2) and in code.
- **Location:** `src/server/community/access.ts:61-64`; `src/server/community/notifications.ts:47`; `src/server/community/groups.ts:45`; `src/server/admin/projects.ts:189-194`.
- **Evidence:** such a person stayed in the member count and in the notification recipients (their chat access was correctly refused). Notifications can be copied to email. Project assignment checks only the participant record.
- **Steps to reproduce:** remove a member's community access; start a meeting in their group; check their notifications.
- **Root cause:** several places test only the account status instead of the shared "active member" rule.
- **Impact:** someone removed from the community keeps receiving group activity by email, and can still be assigned to a project.
- **Recommended resolution:** use the single `ACTIVE_MEMBER` rule everywhere recipients, counts, coordinators and assignable people are selected.
- **Acceptance criteria:** a paused or removed person receives no group notification, is not counted, and cannot be assigned.

#### P2-8. The supporter counter counts people who no longer qualify

- **Evidence label:** Confirmed in code (not executed).
- **Location:** `src/app/community/(portal)/ideas/[id]/page.tsx:44`; `src/components/community/cards.tsx:27`; `src/server/community/ideas.ts:141`.
- **Evidence:** the page shows the raw number of supporters; group creation uses only eligible ones. Nothing re-checks an idea when a supporter is reinstated or the threshold is lowered.
- **Steps to reproduce:** A supports, A is suspended, B supports. The page shows "2 of 2" and no group.
- **Root cause:** two different counts.
- **Impact:** a confusing, apparently stuck idea.
- **Recommended resolution:** show the eligible count; re-evaluate ideas when an account is reinstated or the threshold changes.
- **Acceptance criteria:** the displayed number always equals the number used for the decision.

#### P2-9. An idea can be completely rewritten after people supported it

- **Evidence label:** Confirmed in code (not executed).
- **Location:** `src/server/community/ideas.ts:22-28`.
- **Evidence:** editing is blocked only for removed ideas, so it is allowed after support and after a group formed.
- **Steps to reproduce:** publish an idea, collect support, edit title and summary.
- **Root cause:** no lock tied to support.
- **Impact:** supporters' agreement, and a group's founding purpose, can be changed silently.
- **Recommended resolution:** per founder decision 5.
- **Acceptance criteria:** the chosen rule is enforced on the server and covered by a test.

#### P2-10. Meetings: wording and behaviour

- **Evidence label:** Confirmed in code and browser (screenshot 06).
- **Location:** `src/components/community/start-meeting.tsx:57-62`; `src/server/community/meetings.ts:25-28`; `src/app/(site)/how-it-works/page.tsx:47`; `next.config.ts` (camera and microphone disabled for the site).
- **Evidence:**
  - "Start Video Meeting" and "Start Voice Meeting" store a label beside the same Google Meet link.
  - A meeting never ends unless its starter or the coordinator ends it, so "happening now" can stay indefinitely.
  - Starting uses check-then-insert, so two simultaneous starts can create two active meetings.
  - Archiving a group does not end its meeting.
  - Public text says each group has "voice and video meetings".
- **Steps to reproduce:** start a meeting and never end it; view the group next day.
- **Root cause:** meetings were built as shared links without a lifetime.
- **Impact:** stale banners; a visitor may expect built-in calls.
- **Recommended resolution:** one "Start a meeting" button; end meetings automatically after some hours; enforce one active meeting per group in the database; say "meetings through Google Meet" publicly.
- **Acceptance criteria:** no meeting stays active beyond the limit; a second simultaneous start is refused; public wording names Google Meet.

#### P2-11. Chat attachments are visible and kept when they should not be

- **Evidence label:** Confirmed in code (not executed).
- **Location:** `src/components/community/chat.tsx:222, 415`; `src/server/community/files.ts:244-251`; `src/server/community/reports.ts:186-188`; `src/ops/retention.ts:110`.
- **Evidence:** a file is uploaded as soon as it is chosen and appears in the group's file list even if the message is never sent. Removing a message through moderation or retention leaves its files downloadable. Open chats are not told that a message was removed.
- **Steps to reproduce:** choose a file in chat, remove it from the message box, open Research → Files.
- **Root cause:** files and messages are handled separately.
- **Impact:** something a member decided not to send is visible to the group; removed content stays reachable.
- **Recommended resolution:** list only attachments of sent messages; delete on removal from the box; remove files together with their message; clean up unattached files after a day.
- **Acceptance criteria:** an unsent file never appears; a removed message's files cannot be downloaded.

#### P2-12. A notification clash can show an error after a support was already saved

- **Evidence label:** Suspected.
- **Location:** `src/server/community/notifications.ts:56-66`; `src/server/community/ideas.ts:161-189`.
- **Evidence:** notifications use find-then-create on a unique key and run after the support is saved. Two supporters at the same instant could collide; the second would see an error and the "group created" audit entry and notices would be skipped. The existing simultaneous-support test passes, so this is rare.
- **Steps to reproduce:** not reproduced.
- **Root cause:** follow-up actions are not protected from each other's failures.
- **Impact:** a misleading error; missing notices.
- **Recommended resolution:** create-or-update in one step; let each follow-up action fail independently.
- **Acceptance criteria:** a stress test of simultaneous supports shows no error and all notices.

#### P2-13. The ADMIN role holds powers the policy reserves for the owner

- **Evidence label:** Confirmed in code (not executed).
- **Location:** `src/lib/auth/permissions.ts:40-57`; `src/app/admin/(panel)/applications/export/route.ts:12`; `src/lib/content/schema.ts:21-24`.
- **Evidence:** ADMIN can download a file of every applicant's details, although exports are described as owner-only. ADMIN can edit the public contact address, the FAQ answers about payment and guaranteed income, and the displayed organization name.
- **Steps to reproduce:** as ADMIN open `/admin/applications/export`.
- **Root cause:** permissions grew feature by feature.
- **Impact:** an administrator could take the applicant list or change public commitments. No ADMIN exists today.
- **Recommended resolution:** per founder decision 6; at least move bulk export and the contact and FAQ sections to owner-only.
- **Acceptance criteria:** ADMIN is refused on the chosen items; the permission test lists them.

#### P2-14. Personal-data exports are incomplete or include too much

- **Evidence label:** Confirmed in code (not executed).
- **Location:** `src/server/privacy.ts:21, 71, 79-80, 93`.
- **Evidence:**
  - A person's own export leaves out their application unless they were accepted.
  - It also leaves out their own compensation agreements.
  - The applications file includes unfinished drafts, which are described elsewhere as the applicant's private work.
  - Its "Submitted" column shows the creation date.
- **Steps to reproduce:** as a waitlisted applicant, export your data; `application` is empty.
- **Root cause:** the export follows the older participant link only.
- **Impact:** an incomplete answer to a data-access request; private drafts in an administrator's file.
- **Recommended resolution:** find the application through the account; exclude drafts; use the submission date; include the person's own agreements.
- **Acceptance criteria:** tests show a non-accepted applicant's export contains their application, and no draft appears in the file.

#### P2-15. An email-address change may be confirmed on screen while the database rolls it back

- **Evidence label:** Suspected.
- **Location:** `src/server/onboarding.ts:162-167`.
- **Evidence:** inside a transaction, an update error is swallowed. If the new address already belongs to an earlier application record, the database aborts the whole transaction while the code continues as if it succeeded.
- **Steps to reproduce:** not reproduced.
- **Root cause:** an error is ignored inside a transaction.
- **Impact:** the person is told to sign in with the new address, which was never saved.
- **Recommended resolution:** check for the conflict first; never ignore errors inside a transaction.
- **Acceptance criteria:** a test with a conflicting address shows a clear message and an unchanged account.

#### P2-16. The site reveals which email addresses have accounts, and anyone can lock any account

- **Evidence label:** Confirmed in browser (checks C and D).
- **Location:** `src/server/accounts.ts:150-160`; `src/server/onboarding.ts:107-109`; `src/lib/auth/service.ts:32, 40-42`.
- **Evidence:** "forgot password" answered in 238–253 ms for existing addresses and 135–138 ms for unknown ones (the gap will be larger with a real mail service). After wrong passwords, an existing account answers "Account temporarily locked" while an unknown address keeps answering "Invalid email or password". Five wrong passwords lock any account for 15 minutes, including the founder's.
- **Steps to reproduce:** `checks.ts` sections C and D.
- **Root cause:** the email is sent before answering; the lock message differs.
- **Impact:** an outsider can test which addresses are registered and keep a known person locked out.
- **Recommended resolution:** send the email after answering; use one message for locked and unknown; slow down instead of hard-locking, or lock per network plus account.
- **Acceptance criteria:** response times and messages are indistinguishable between existing and unknown addresses.

#### P2-17. The admin area describes the same people in three overlapping places

- **Evidence label:** Confirmed in browser (screenshots 04, 05).
- **Location:** `src/app/admin/(panel)/layout.tsx:9-24`; `members/page.tsx:19-33`; `page.tsx` (overview).
- **Evidence:**
  - Applications, Members and Participants are separate lists. One person can have four statuses.
  - The Members page says "approved members and administrators" but lists every account, including applicants.
  - A person page shows the label "Member" next to "Not a member".
  - The "Active community members" counter links to a list with a different total.
  - The overview still says "New applications" while the status is called "Received".
  - 16 menu items; 11 counters; no list of pending work.
- **Steps to reproduce:** open `/admin`, then Members, then an applicant's page.
- **Root cause:** each feature added its own list.
- **Impact:** a single founder must remember where each fact lives.
- **Recommended resolution:** simplification, not redesign: one person page showing all four facts with plain labels; name the Members list by what it contains; make counters match their links; replace some counters with "waiting for you".
- **Acceptance criteria:** one person's full state is visible on one page; every counter equals the list it opens; no contradictory labels.

#### P2-18. The organization's name comes from two places

- **Evidence label:** Confirmed in code (not executed).
- **Location:** `src/app/(site)/layout.tsx:20, 25`; `src/app/(site)/page.tsx:68`; `src/lib/email/index.ts:140`; `src/config/brand.ts:25`; also fixed text in `src/app/admin/actions/community.ts:196` and the email header name `X-CoWork-Delivery-Id`.
- **Evidence:** header, footer and policy pages read the name from editable website content; the Join button, sign-in pages, all emails and the authenticator label read it from the server setting.
- **Steps to reproduce:** change "Organization display name" in Website content; emails still use the old name.
- **Root cause:** two sources.
- **Impact:** inconsistent naming after any change, against the instruction not to hard-code the name.
- **Recommended resolution:** one source everywhere; remove the remaining fixed strings.
- **Acceptance criteria:** changing the name in one place changes it on every page and in every email.

#### P2-19. The public explanation of revenue leaves out what the organization keeps

- **Evidence label:** Confirmed (page text compared with `docs/legal/revenue-distribution-policy.md:14-16`).
- **Location:** `src/components/visuals/revenue-flow.tsx:7-8`; Pay & Fairness page.
- **Evidence:** the public flow is "customer pays → direct costs → what remains is shared". The internal policy draft lists taxes, payment fees, overhead, a reserve and an organization share as open decisions.
- **Steps to reproduce:** read `/compensation`.
- **Root cause:** the policy is undecided.
- **Impact:** a material omission in statements about earnings.
- **Recommended resolution:** after founder decision 3 and legal review, add one sentence and keep the diagram consistent with it.
- **Acceptance criteria:** public wording matches the adopted policy text.

#### P2-20. Placeholders and unreviewed legal drafts are publicly visible

- **Evidence label:** Confirmed in browser (screenshot 09).
- **Location:** `src/components/ui/primitives.tsx:133`; Contact, Privacy, Terms, Community Rules pages; empty `ORG_LEGAL_NAME`, `ORG_JURISDICTION`.
- **Evidence:** "[Official contact email to be confirmed]" and similar bracketed text for the legal entity, legal basis, processors and liability. They are honestly marked as drafts, but nothing prevents going live with them.
- **Steps to reproduce:** open `/contact`.
- **Root cause:** founder information not yet supplied.
- **Impact:** an unfinished, less trustworthy public face; legal exposure.
- **Recommended resolution:** the founder supplies the facts; add a warning on the admin overview, and a production check, while any placeholder remains.
- **Acceptance criteria:** no bracketed placeholder on a production build.

#### P2-21. Emails sent through a mail server on the same machine are labelled "test only" even in production

- **Evidence label:** Confirmed in code and browser (screenshot 07).
- **Location:** `src/lib/email/status.ts:90`; `src/lib/email/index.ts:145`; `src/app/admin/(panel)/email/page.tsx:48`.
- **Evidence:** any local mail host is treated as the test inbox, and the admin page prints a fixed `http://127.0.0.1:8025` text without checking the environment.
- **Steps to reproduce:** production with a local mail relay.
- **Root cause:** "local host" is used as the sign of "test".
- **Impact:** real deliveries would be shown as not delivered and could not be retried.
- **Recommended resolution:** apply the test label only outside production.
- **Acceptance criteria:** in production no page mentions the test inbox.

#### P2-22. Backups are weakly protected by default

- **Evidence label:** Confirmed in code; one part Suspected.
- **Location:** `src/lib/env.ts:21`; `src/ops/backup.ts:129-135, 161`; `src/ops/scheduler.ts:144-151`.
- **Evidence:** encryption is optional and unchecked in production; backups sit on the same disk as the site; uploaded files are not included; the whole database is held in memory during a backup. Suspected: the lock that prevents two scheduled jobs running at once may be released on a different database connection, which could silently skip later runs.
- **Steps to reproduce:** inspect `/admin/backups` ("NOT encrypted").
- **Root cause:** safe defaults were not enforced.
- **Impact:** a lost disk loses site and backups together; an unencrypted backup contains all personal and compensation data.
- **Recommended resolution:** require the encryption key in production; document and show an off-site copy including uploaded files; run the job lock on one dedicated connection.
- **Acceptance criteria:** production backups are always encrypted; job history shows one run per day.

#### P2-23. The real database contains the founder's own test records

- **Evidence label:** Confirmed by read-only database check.
- **Location:** real database `cowork`.
- **Evidence:** 5 accounts, 4 accepted applications, 1 idea, 1 group with 3 messages, 1 project, 1 compensation agreement, 27 email records, 84 audit entries, from testing on 20–22 November 2026.
- **Steps to reproduce:** `npx tsx scripts/audit/integrity.ts cowork`.
- **Root cause:** testing took place in the real database.
- **Impact:** test people, a test project and a test agreement would appear as real history.
- **Recommended resolution:** founder decision 4. Any cleanup needs a verified backup first and explicit approval.
- **Acceptance criteria:** the production database contains only records the founder confirmed as real.

#### P2-24. The upload size limit may be avoidable

- **Evidence label:** Suspected.
- **Location:** `src/app/api/files/route.ts:18-21`.
- **Evidence:** the size check uses the declared length, which a request can omit; the whole upload is then read into memory before the real check.
- **Steps to reproduce:** not reproduced.
- **Root cause:** the limit is applied to a header.
- **Impact:** a signed-in member could exhaust the server's memory.
- **Recommended resolution:** stop reading at the limit; refuse uploads without a declared length.
- **Acceptance criteria:** an oversized upload without a declared length is cut off at the limit.

#### P2-25. Limits and caches live in one process's memory

- **Evidence label:** Confirmed in code.
- **Location:** `src/lib/rate-limit.ts`; `src/server/settings.ts:8`; `src/realtime/server.ts:26, 68`.
- **Evidence:** attempt counters, the 60-second settings cache and chat presence are kept in memory; some counters are never cleaned. `docs/DEPLOYMENT.md:121` says "run one instance", but nothing enforces it. A restart clears every limit.
- **Steps to reproduce:** restart the server during a lockout.
- **Root cause:** design choice for a small single server.
- **Impact:** fine for the founding stage; silently wrong if the site is ever run as two instances.
- **Recommended resolution:** keep the design, clean old counters, and warn at startup when more than one instance is detected.
- **Acceptance criteria:** memory does not grow without bound; the single-instance rule is checked.

### 12.6 P3 — Low

Each row gives location, evidence and how to see it, cause, impact, fix, and the acceptance criterion.

| ID | Issue | Location | Evidence / how to see it | Cause | Impact | Fix | Done when |
|---|---|---|---|---|---|---|---|
| P3-1 | No site icon | `src/app/` (no icon file) | Browser: `/favicon.ico` returns 404 on first visit | Never added | Blank tab icon; console error | Add an icon file | `/favicon.ico` returns 200 |
| P3-2 | No loading indicators between pages | `src/app/` (no `loading.tsx`) | Code: none exist | Not built | Blank wait on slow connections | Add simple loading states for the main areas | A slow page shows a placeholder |
| P3-3 | Public pages repeat each other | `src/app/(site)/` | Browser: 7 pages with overlapping statements; home is ~5,800 px tall (≈10,000 on phone) | Content grew page by page | Long reading for the same message | Merge or shorten in the simplification step | Each fact appears in one main place |
| P3-4 | Approved member without an application sees "Application Not Started" | `src/app/(applicant)/application/page.tsx` | Browser: screenshot 02 (seeded member, or administrator) | Page assumes every member applied | Confusing "Start my application" button | Show members a plain "You are a member" state | No "start application" offer for members |
| P3-5 | "Accepted, you can enter" shown under a "paused" notice | `application/page.tsx:38, 84` | Code | Two independent messages | Contradiction | Show only the notice that applies | One consistent message |
| P3-6 | Filter boxes cut off their text | `src/app/community/(portal)/page.tsx` | Browser at 1366 px: "All categori", "Newest firs" | Fixed width | Looks unfinished | Let the boxes fit their text | Full labels visible |
| P3-7 | Four places to talk | Group tabs, idea page | Browser: idea comments, chat, discussions, announcements | Features added separately | Members must choose where to write | Consider folding discussions into chat plus announcements | Founder-approved reduced set |
| P3-8 | Three accessibility issues | `chat.tsx` (`#chat-file`); `/admin/inquiries`, `/admin/privacy` | Crawl (axe): file input without a label; links distinguished only by colour | Missed in review | Harder for screen-reader and colour-blind users | Add the label; underline the links | axe reports 0 serious issues on all crawled pages |
| P3-9 | Admin lists cramped on a phone | `/admin/applications` | Browser: screenshot 08 | Desktop-first layout | Slow to use on a phone | Collapse filters on small screens | Results visible without scrolling past filters |
| P3-10 | Email delivery log below the templates; duplicated sentence | `src/app/admin/(panel)/email/page.tsx` | Browser: screenshot 07; "Application declined" description repeats itself | Order of sections | Extra scrolling | Put the log first; fix the sentence | Log visible on opening the page |
| P3-11 | Audit log, inquiries and email log show only the latest 100–200, no filters | Admin pages | Code and browser | Not built | Older records unreachable in the admin area | Add paging and a simple filter | Any record can be reached |
| P3-12 | Notifications jump to the top when marked read; links can lead to "not found" | `notifications.ts:93` | Code | Sorted by last change | Confusing order; dead links after removals | Sort by creation time; hide links to removed items | Order stable; no dead links |
| P3-13 | New group member sees the whole chat history as unread | `group-page.ts:31-37`; `groups.ts:115-118` | Code | No starting point on joining | Misleading unread badge | Start "read" at the joining time | Badge counts only messages after joining |
| P3-14 | One-click actions that cannot be undone | Idea "Close", "Make coordinator", coordinator "Remove member" | Code and browser | No confirmation step | Mistakes are permanent; removed member is not told and can never rejoin | Ask for confirmation; notify the removed member; let an administrator lift the block | Each asks first; removal is notified |
| P3-15 | Some actions fail without any message | `src/app/community/actions.ts` (delete note, task, link, file; end meeting; close idea) | Code: `.catch(() => {})` | Errors ignored | Nothing happens and nothing explains why | Show a short error | Every failed action shows a message |
| P3-16 | Leftovers from the earlier invitation flow | `accounts.ts:59-140, 235-246`; members page "Send a new invitation"; "Account activation invitation" template; `finance.view` permission; file kind `IDEA_ATTACHMENT` | Code; the link only redirects back | Flow was replaced | Dead link; code that can re-activate suspended accounts if ever reused | Remove after confirming nothing depends on it | No unused path or dead link remains |
| P3-17 | Confirmation link signs in without the second step; address shown in the page address | `src/app/(auth)/actions.ts:77, 118-122` | Code | Convenience | Small weakening for members who enabled two-step early; address stored in browser history | Ask for sign-in after confirming when two-step is on; drop the address from the URL | Covered by a test |
| P3-18 | Page banners show any text from the address | `/application`, `/account/security`, admin pages (`?ok=`, `?error=`) | Code | Messages passed in the URL | A crafted link can show false text on a trusted page (no code injection) | Use fixed message codes | Unknown text is not displayed |
| P3-19 | Small sign-in hardening gaps | `accounts.ts:189`; admin session settings; three email checks | Code: password change not rate-limited; no idle timeout for administrators (8 hours fixed); three places accept addresses the sign-up form refuses | Inconsistent rules | Minor | One shared email rule; limit password-change attempts; idle timeout | Covered by tests |
| P3-20 | 4 high advisories in build tooling | `node_modules/@prisma/config` | `npm audit --omit=dev` | Upstream | Not reachable by visitors | Update Prisma when a fixed release is available | `npm audit` clean or reviewed |
| P3-21 | Documentation out of date | `docs/ONBOARDING.md` (says bcrypt); `groups.ts:162` (cites a missing `docs/COMMUNITY.md`); `docs/DEPLOYMENT.md:63` (claims startup refusal); `docs/ARCHITECTURE.md:43` (admin chat access) | Reading | Docs not updated with code | Misleads the next developer | Correct each line | Docs match behaviour |
| P3-22 | One browser test failed once under heavy load | `tests/e2e/phase1.spec.ts:412` | First run only; passed on the quiet rerun | Not established | Possible fragile test or slow path | Rerun several times under load; investigate if it recurs | 10 consecutive passes |
| P3-23 | No overview of compensation agreements | Admin, Projects | Browser: reachable only inside each project | Not built | Founder cannot see all agreements at once | A read-only owner list (small addition, founder to decide) | Owner sees all agreements on one page |

Also noted, low risk, no separate entry: the Privacy admin page writes a job record on every view; `scripts/create-admin.ts` silently promotes an existing account with the same address; the test-database safety check matches the word "test" anywhere in the connection text rather than the database name; security headers allow inline scripts and announce HSTS preload from the first deployment; a recipient address can appear in an error log line; the old WIN1252 database copy and a `cowork_restore_test` database are still present on the local database server.

---

## Closing note

No completion percentage is given, because any number would be invented. The honest summary is: the main path is built and verified, 59 specific issues remain, 11 of them (P0 and P1) should be resolved before any real person uses a live site, and six decisions belong to the founder. Corrective work has not been started and will not start until the founder approves a plan.
