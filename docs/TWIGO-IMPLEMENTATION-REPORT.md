# Twigo: implementation report

*An Online Collaborative Community · Together We Innovate, Grow & Opportunity · intended address `https://twigo.space`*

Work done on 23 November 2026 on branch `feature/twigo-platform-transformation`, following the
"Complete platform transformation and legal framework" instructions. Nothing was deployed, no DNS was
changed, nothing was purchased, no real email was sent and no payment processing exists.

Companion documents:

- [TWIGO-LEGAL-REVIEW-CHECKLIST.md](TWIGO-LEGAL-REVIEW-CHECKLIST.md): what a lawyer must review, item by item.
- [TWIGO-OPEN-DECISIONS.md](TWIGO-OPEN-DECISIONS.md): what needs your decision, with the safe default in place now.
- [TWIGO-TEST-RESULTS.md](TWIGO-TEST-RESULTS.md): every test command and its real result.
- [TWIGO-CHECKLIST.md](TWIGO-CHECKLIST.md): the Stage 0 findings and the working checklist.

---

## 1. Executive summary

The platform is now **Twigo**, and its rules about money and agreements are enforced by the software, not
only described:

- **Brand:** Twigo name, identity, slogan (exactly as given) and description across public pages,
  metadata, emails, admin and documentation; `SITE_URL` drives `https://twigo.space` in production while
  local development keeps working. No "Strivanta" or "CoWork" branding remains in code or public content.
- **Revenue model:** no fees, no investment, no commission or share, no handling of project money. Groups
  create projects and record versioned agreements (15 items, contracting model, payment recipient, each
  person's compensation) that **every participant must accept**; changes create a new version that
  everyone accepts again. All twelve required revenue-model checks are automated tests and pass.
- **Legal framework:** eight versioned policies with fingerprints and the five states, Legal Notices with
  per-field confirmation, separate acceptance of Terms and Guidelines and acknowledgment of the Privacy
  Policy at sign-up, reliable acceptance records, renewed acceptance after material changes. **Every policy
  is still "Pending legal review"**; nothing claims a lawyer reviewed it, and the operator, entity and
  jurisdiction are stated as not yet confirmed.
- **Community Support:** public page and policy, owner-only records and frozen public reports; online
  payments do not exist.
- **Admin:** legal documents, notices, acceptance records, project agreements (terms owner-only),
  support, privacy requests.
- **Tests:** 396 of 396 automated tests, 23 of 23 browser tests, 61 of 61 walkthrough steps; type check and
  lint clean. Four real defects found by the new tests and the performance measurement were fixed
  (listed in section 3 of [TWIGO-TEST-RESULTS.md](TWIGO-TEST-RESULTS.md)).
- **Data:** one additive migration, applied to the development database after a verified backup and a
  rehearsal; all 279 existing rows unchanged.

What blocks a public launch is information only you can provide: who legally operates Twigo, where, and a
lawyer's review (section 19).

## 2. Original project state

- A working platform built in earlier phases under the working name "CoWork": public site, accounts with
  email confirmation and two-step verification, membership applications and approval, a members-only
  community (business ideas, automatic groups at two supporters, real-time group chat, Google Meet links,
  shared research, files), moderation, and an admin area with owner-only compensation records.
- Git: clean `main` at `171546f` (tag `stage-4-complete`), 348 automated tests and 21 browser tests passing.
- "Strivanta" did not appear in code or public content (the name came from the `ORG_NAME` setting); it
  appears only in 2 historical email-delivery records in the database, left unchanged.
- The earlier business model had the operator run projects and record compensation itself
  (admin "Projects" with OWNER-only compensation agreements). There were no legal documents beyond a
  draft privacy notice, terms and community rules, no acceptance records and no version history.

Protection taken before any change (Stage 0): tag `pre-twigo-2026-11-23`; code bundle
`backups/cowork-code-pre-twigo.bundle` (verified); database backup
`backups/cowork-20261123-051958-pre-twigo.cwbak.gz` restored into a separate database and compared
(0 differences). Before the database migration: a second backup
`backups/cowork-20261123-061909-pre-m5-twigo.cwbak.gz` (47 tables, 279 rows), restored into
`cowork_m5_rehearsal` and compared after migrating `cowork` (no differences). The original backups were
not modified or deleted.

## 3. New Twigo architecture

The existing stack is unchanged (Next.js 16 App Router, React 19, TypeScript, Prisma 6 on PostgreSQL,
Socket.IO). What was added sits beside the existing modules:

| Area | Server module | Pages |
| --- | --- | --- |
| Brand | `src/config/brand.ts` (name, identity, slogan, description from settings) | every page |
| Legal documents | `src/content/legal/*` (texts), `src/server/legal.ts` (versions, states, fingerprints, acceptances), `src/server/legal-notices.ts` | `/legal`, `/legal/<doc>`, `/legal/<doc>/v/<n>`, `/legal/notices`, `/legal/review`, `/account/agreements`, `/admin/legal/*` |
| Group projects | `src/server/community/group-projects.ts`, `src/app/community/project-actions.ts` | `/community/groups/<g>/projects`, `/community/groups/<g>/projects/<id>`, `/api/agreements/<id>`, `/admin/agreements` |
| Community Support | `src/server/community-support.ts` | `/support`, `/admin/support` |
| Privacy requests | `src/server/privacy-requests.ts` | `/account/data`, `/admin/privacy-requests` |

Principles enforced in code rather than only in text:

- The platform is never a party to a project and never computes a share: no code calculates revenue,
  and the agreement text always carries a statement participants cannot remove.
- A document or agreement version is immutable once anyone may accept it; changes create a new version;
  acceptance is bound to the SHA-256 fingerprint of the exact text.
- Owner-only permissions for legal documents, support records and privacy requests; administrators see
  only that project agreements exist and their progress.

## 4. Brand transformation

- Name **Twigo**, identity **An Online Collaborative Community**, slogan **Together We Innovate, Grow &
  Opportunity** (kept exactly; a grammar note is in the open decisions, item 11), and the core
  description and supporting text from the instructions, used on the home page, metadata, share image,
  emails, footer and README.
- Configuration-driven: `ORG_NAME` (default "Twigo"), `ORG_TAGLINE`; the local `.env` now says Twigo.
  `.env.example` documents `SITE_URL=https://twigo.space` for production; local development keeps
  `http://localhost:3000`. Canonical URLs, sitemap and emails use `SITE_URL`.
- All public pages rewritten for the cooperative model (home, how it works, about, pay & fairness,
  participation, founding contributors, FAQ with 15 questions, contact, work with us). The footer says
  "Voluntary · No fees · No commission · Transparent".
- Stage 9 consistency pass: user-facing "research group" became **project group**; "the organization"
  became "the administrators" or "the moderators"; texts describing the earlier admin-approval model were
  rewritten (a group needs nobody's approval to start a project). Database tables and code identifiers
  (`ResearchGroup`, the `cowork` database) were deliberately **not** renamed.
- No invented members, testimonials, revenue or entity claims (automated check 12 scans every public text).

## 5. Revenue model implementation

- No fee, no investment, no guaranteed income, no commission, percentage or ownership share; Twigo does
  not collect, hold or distribute project money (stated on the Pay & Fairness page, in the Terms, the
  Participation & Compensation Policy, the FAQ, and in every project agreement).
- Each group decides its own arrangement: equal, contribution-based, role-based, fixed payments or another
  agreed method; the formula is free text written by the participants. **No percentage is hard-coded.**
- Each project records its contracting model: one representative contracts and receives payment, each
  participant contracts directly, a separate project entity, or another documented arrangement. A
  coordinator is explicitly *not* automatically the legal representative.
- Agreements cover the 15 required items (scope, deliverables, participants and responsibilities,
  expected contributions, contracting arrangement, payment recipient, approved expenses, gross receipts,
  taxes and deductions, refunds and chargebacks, net distributable revenue, distribution formula, payment
  schedule, IP, confidentiality, withdrawal, disputes) plus individual compensation per participant.
- Voluntary "Twigo Community Support" is separate, optional, gives no privileges and is never deducted.
- All twelve revenue-model checks of instruction 12.2 are automated tests (`tests/twigo-revenue-model.test.ts`).

## 6. Legal documentation

Eight versioned documents, each stored with its full text and SHA-256 fingerprint:

| Document | Highlights |
| --- | --- |
| Terms of Use | 22 sections: what Twigo is (operator stated as not yet confirmed), eligibility, voluntary participation, account, acceptable use, prohibited conduct, ideas, group participation, project participation, no guaranteed income, no fees, no mandatory investment, no commission, compensation decided by participants, voluntary support, IP, confidentiality, suspension, disputes, liability, governing law (not yet stated), changes and effective dates |
| Privacy Policy | Data inventory written from the code; real retention periods (the software's defaults); providers not yet chosen are said to be not chosen; rights and how to use them |
| Community Guidelines | Conduct, prohibited behaviour, reporting, moderation, appeals |
| Intellectual Property Policy | 8 principles: you keep what you bring and create; ideas are visible, not confidential; nothing is transferred to Twigo; projects agree ownership in writing |
| Participation and Compensation Policy | Voluntary participation, keeping your job, no guaranteed income, how groups decide compensation |
| Group Participation Agreement | Purpose, membership, decisions, confidentiality, leaving, disputes; no financial obligation |
| Cookie Policy | The two strictly necessary cookies and one browser-storage use; no tracking |
| Community Support Policy | Optional, separate, no privileges, no tax claims, payments not available |

Plus **Legal Notices**: nine fields (operator name, entity type, jurisdiction, registered address,
registration number, contact email, privacy contact, governing law, effective date), each private until
the owner marks it confirmed. All nine are unconfirmed and show "Not yet confirmed".

States: Draft → Pending legal review → Approved → Published → Superseded. **All eight documents are
version 1, Pending legal review.** Approval requires the owner to tick that a lawyer reviewed that exact
version and to say who and when; the software never approves on its own. Bracketed placeholders such as
"[Company Name]" are refused by the editor and are not present in any text.

## 7. Membership agreement workflow

- **Registration** (`/join`): three separate checkboxes: accept the Terms, accept the Community
  Guidelines, acknowledge the Privacy Policy (an acknowledgment, not a consent). Nothing is bundled or
  pre-ticked. The same for administrator invitations (`/activate`).
- **Records**: person, document, version, fingerprint, time, method (registration, activation, renewed
  acceptance, idea support, group join) and context. Never edited. A form showing an older version cannot
  record acceptance of a newer one.
- **Renewed acceptance**: publishing a material change with "ask everyone to accept again" sends members
  to `/legal/review` before they can continue; the admin area is not blocked.
- **Member view**: Account → Agreements lists everything the member accepted, with links to the exact versions.
- **Owner view**: Admin → Legal → Acceptance records (filter by document) and the member detail page.

## 8. Project group functionality

- Idea form: added *expected activities*, *objectives* and *collaboration approach* (the existing title,
  description, problem, solution, skills and customers fields remain). Before publishing, the author must
  confirm they understand who can see the idea and that it is not confidential (checked on the server).
- The two-supporter rule is unchanged (configurable). Supporting an idea and joining a group record the
  acknowledgment of the Group Participation Agreement, shown next to the button.
- Members join and leave groups freely; coordinator hand-over and succession are unchanged.
- No hidden administrator access: administrators still cannot read group chat; they read research notes
  only when a group chooses "Ready for review", which is now optional feedback.

## 9. Project compensation workflow

On a group's new **Projects** tab:

1. Any active member creates a project (name, objective) and becomes its coordinator.
2. The coordinator (or the group coordinator) drafts the agreement: all items above, the contracting
   model, the compensation method and, per participant, role, responsibilities, expected contribution and
   compensation in their own words.
3. "Ask the participants to accept" is refused until every required item is filled in.
4. Each participant accepts the exact text (bound to its fingerprint) or declines with a note.
5. Only when **every** participant accepted is the version in force. Changing anything creates a new
   version that everyone accepts again; until then the previous version stays in force, unchanged. A
   coordinator therefore cannot silently change anyone's compensation.
6. "Start commercial work" requires the latest version accepted, a contracting model, a payment
   recipient, and no unresolved legal or tax review flag.
7. Withdrawal is recorded with a note, notifies the others and forfeits nothing (stated in every
   agreement). Disputes follow the procedure in the agreement; there is no automatic confiscation.
8. Downloads (`/api/agreements/<id>`) give the exact text, its fingerprint and every acceptance time, to
   group members and to the owner only; drafts are never downloadable.

## 10. Voluntary support module

- Public page `/support`: the statement from the instructions, principles, "Online contributions are not
  available", and published reports (currently "No support has been received and no report has been
  published yet.").
- Owner page Admin → Community support: private entries (contribution, operating, development, other
  expense; contributor names private), reports for a period, publishing that freezes the totals.
- No payment processing at all: `paymentsAvailable()` always returns false, the
  `SUPPORT_PAYMENTS_ENABLED` switch (off) cannot enable anything, no payment library is installed.

## 11. Admin improvements

New sections (menu now 15 entries):

| Section | Who | What |
| --- | --- | --- |
| System → Legal (Documents, Legal notices, Acceptance records) | Owner | Versions, states, editing drafts, approval with reviewer statement, publication with effective date, notices with per-field confirmation, all acceptance records |
| Business → Project agreements | Administrators | Projects, their status and acceptance progress; **terms and download for the owner only**; nobody can edit an agreement here |
| Business → Earlier project records | Owner (projects.manage) | The earlier admin-run project module, relabelled and kept for history |
| Business → Community support | Owner | Records, reports, payment status |
| System → Privacy & data → Privacy requests | Owner | Requests, status, answer to the member, audit |
| Members → member detail | Owner | Policies accepted by that member |

Brand and settings stay in Settings and `.env`; the audit log records every legal, project, support and
privacy action.

## 12. Database changes

One additive migration, `prisma/migrations/20261123120000_twigo_platform`:

- 9 new tables: `LegalDocument`, `LegalDocumentVersion`, `LegalAcceptance`, `GroupProject`,
  `ProjectAgreementVersion`, `ProjectAgreementParticipant`, `SupportLedgerEntry`, `SupportReport`,
  `PrivacyRequest`.
- 7 new enums; new values `PROJECT_AGREEMENT` (notifications), `INTELLECTUAL_PROPERTY` and `DISPUTE`
  (report reasons); 3 new optional columns on `BusinessIdea`.
- No table, column or value was renamed or removed. Version and acceptance rows are protected by
  `ON DELETE RESTRICT`; references to people use `SET NULL`, except acceptance records, which belong to
  the person and are removed only if the account itself is deleted (no code deletes accounts; see open
  decisions for how long acceptance proof should be kept after a deletion request).
- Applied to the test databases automatically, and to the development database `cowork` after a backup
  and a rehearsal restore: 10 migrations, 56 tables, the same 279 rows.

## 13. Security improvements

- Least privilege: three new owner-only permissions (`legal.manage`, `support.manage`,
  `privacy.requests`); administrators get only `agreements.view` (metadata, not terms).
- Agreement integrity: acceptance only with the fingerprint of the text the person saw; versions immutable;
  row locks against concurrent acceptance.
- Download route: group members and the owner only, `Cache-Control: private, no-store`, `nosniff`.
- No administrator action writes group agreements (checked by a test).
- Privacy requests rate-limited per person (at most 3 open); every change audited; support audit entries
  contain no amounts or names.
- Legal draft editor refuses unfinished placeholders.
- Unchanged and retested: CSRF/origin checks, rate limits, session security, upload checks, no access to
  private chat for administrators.

## 14. Performance results

Measured with `npm run perf:measure -- twigo --build` (production build, 7 runs per page, local demo
database; median server response time and database queries per page). Compared with the Stage 4
measurement on the same computer:

| Who | Page | Stage 4 median | Twigo median | Stage 4 queries | Twigo queries |
|---|---|---|---|---|---|
| visitor | `/` | 25 ms | 21 ms | 0 | 0 |
| visitor | `/how-it-works` | 23 ms | 20 ms | 0 | 0 |
| visitor | `/join` | 27 ms | 29 ms | 0 | 2 |
| visitor | `/login` | 26 ms | 26 ms | 0 | 0 |
| applicant | `/application` | 30 ms | 34 ms | 2 | 2 |
| member | `/community` | 44 ms | 52 ms | 11 | 12 |
| member | `/community/ideas/:idea` | 39 ms | 39 ms | 7 | 8 |
| member | `/community/groups` | 28 ms | 33 ms | 5 | 6 |
| member | `/community/groups/mine` | 33 ms | 34 ms | 7 | 8 |
| member | `/community/groups/:group` | 40 ms | 42 ms | 12 | 13 |
| member | `/community/groups/:group/chat` | 37 ms | 34 ms | 11 | 12 |
| member | `/community/groups/:group/research` | 47 ms | 46 ms | 21 | 22 |
| member | `/community/groups/:group/meetings` | 36 ms | 37 ms | 13 | 14 |
| member | `/community/groups/:group/discussions` | 37 ms | 34 ms | 12 | 13 |
| member | `/community/groups/:group/discussions/:discussion` | 36 ms | 41 ms | 12 | 13 |
| member | `/community/notifications` | 28 ms | 28 ms | 4 | 5 |
| member | `/community/profile` | 27 ms | 30 ms | 4 | 5 |
| admin | `/admin` | 40 ms | 38 ms | 13 | 16 |
| admin | `/admin/applications` | 28 ms | 28 ms | 3 | 3 |
| admin | `/admin/applications/:app` | 31 ms | 32 ms | 3 | 3 |
| admin | `/admin/members` | 35 ms | 31 ms | 7 | 7 |
| admin | `/admin/email` | 27 ms | 31 ms | 5 | 5 |

The added work per member page is one query (the check for documents that must be accepted again);
the member home page median rose from 44 to 52 ms. The first measurement showed 39 queries on the admin
overview and 9 on the join page; the legal documents are now read in one query (16 and 2). Results:
`docs/performance/twigo.json`.

## 15. Automated test results

Full details in [TWIGO-TEST-RESULTS.md](TWIGO-TEST-RESULTS.md).

| Check | Result |
| --- | --- |
| TypeScript (`tsc --noEmit`, including tests) | Passed |
| ESLint | Passed |
| Unit and integration (`vitest run`) | **396 passed**, 0 failed, 0 skipped (48 new) |
| Revenue-model checks 1–12 | 12 of 12 passed |
| Legal workflow (versions, fingerprints, timestamps, renewed acceptance, history, downloads, audit, authorization, privacy requests) | All passed |
| Migration rehearsal on a copy of the development data | 0 differences |
| Production build | Passed |
| Dependency audit | 4 known advisories in Prisma tooling, unchanged |

## 16. Browser test results

- Playwright on Microsoft Edge against a production build: **23 of 23 passed**, including two new tests:
  *29* (a group creates a project, drafts the agreement, all three members accept, the copy is downloaded
  and checked, work starts) and *30* (all new owner and member pages open and pass the accessibility
  check). Accessibility: no serious or critical issue on any page checked; no sideways scrolling at
  375 px on the 19 public pages.
- Role walkthrough: **61 of 61 steps passed** across visitor, applicant, member, group, administrator and
  owner (`docs/twigo-screenshots/walkthrough-results.md`).
- The complete member journey from the instructions was retested in the browser: visitor → registration →
  email verification → application → approval → community access → idea → supporters → group formation →
  group membership → discussion → project planning → agreement → project activity.

## 17. Screenshots of important pages

All in `docs/twigo-screenshots/` (taken by the walkthrough, fictional demo data):

| Page | Screenshot |
| --- | --- |
| Home | [01-visitor-home.png](twigo-screenshots/01-visitor-home.png) |
| Pay & Fairness (revenue model) | [02-visitor-pay-and-fairness.png](twigo-screenshots/02-visitor-pay-and-fairness.png) |
| Legal Notices ("Not yet confirmed") | [03-visitor-legal-draft.png](twigo-screenshots/03-visitor-legal-draft.png) |
| Community Support | [04-visitor-community-support.png](twigo-screenshots/04-visitor-community-support.png) |
| Idea published | [14-member-idea-published.png](twigo-screenshots/14-member-idea-published.png) |
| Group project with agreement in force | [19-group-project-agreement.png](twigo-screenshots/19-group-project-agreement.png) |
| Administrator refused on owner-only pages | [31-administrator-no-access.png](twigo-screenshots/31-administrator-no-access.png) |
| Owner: legal notices form | [36-owner-admin-legal.png](twigo-screenshots/36-owner-admin-legal.png) |
| Owner: project agreements | [37-owner-admin-agreements.png](twigo-screenshots/37-owner-admin-agreements.png) |
| Owner: community support records | [38-owner-admin-support.png](twigo-screenshots/38-owner-admin-support.png) |

The project page screenshot was taken before the agreement editor was made collapsible under an
agreement in force; it now shows as "Change the agreement (creates a new version)".

## 18. Remaining issues

Nothing below is a failing test; these are known gaps and limits.

1. **All policies are drafts.** Registrations made before the review record acceptance of the
   pending-review texts. After the review, publish with "ask everyone to accept again".
2. **The development server must be restarted** (see the end of this report).
3. **The branch is not merged** into `main` and nothing was pushed.
4. **Earlier admin-run project module** still exists beside group projects (open decision 9).
5. **Retention periods in the Privacy Policy are text**, not read from the settings; changing a setting
   requires a new policy version (open decision 13). The audit log has no retention period (decision 12).
6. **Acceptance records are removed if an account is ever deleted outright** (no code does this today;
   accounts are deactivated). Decide with the lawyer how long proof of acceptance must be kept.
7. **No email copy** of an accepted project agreement is sent; participants download it from the page.
8. **Electronic-agreement evidence** (checkbox + fingerprint + time) is not verified as sufficient in any
   jurisdiction (checklist item 5).
9. **Member pages make one more database query** (renewed-acceptance check): member home median 44 → 52 ms.
10. **Dependency advisories** in Prisma's command-line tooling are unchanged (no non-breaking fix exists).

## 19. Items requiring founder decisions

The full list with safe defaults is in [TWIGO-OPEN-DECISIONS.md](TWIGO-OPEN-DECISIONS.md). The ones that
block a public launch:

1. Who the legal operator is, and its details.
2. Jurisdiction and governing law.
3. A lawyer's review of the eight documents (then publish with renewed acceptance).
4. The public contact and privacy contact addresses.
5. The VPS provider and location (server `162.35.23.106` is set up) and the final email provider; both must be named in the Privacy Policy.
6. Authorization to deploy to `twigo.space`.

## 20. Recommended next steps

1. Review this branch and merge it into `main` when satisfied (nothing was merged or pushed).
2. Give the legal checklist and `/legal` to a lawyer; decide items 1–5 above.
3. Enter the Legal Notices and publish reviewed versions with "ask everyone to accept again".
4. Decide on the earlier admin-run project module (open decision 9).
5. Point the `twigo.space` DNS records to the VPS (`162.35.23.106`), record the VPS provider and location, choose the email provider; then follow `docs/DEPLOYMENT.md` (section 0 lists the target) with `SITE_URL=https://twigo.space`.
6. Only after the support recipient and accounting are settled: commission a payment integration as a
   separate, reviewed change.

---

## Server restart

**Yes, a restart is required** for the development server on port 3000 (`npm run dev`): the database
client was regenerated for the new tables and the environment name changed to Twigo. The development
database `cowork` already has the migration, so no other step is needed. Stop the running server and start
it again with `npm run dev`.
