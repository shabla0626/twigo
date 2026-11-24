# Twigo: Legal Documents Resolution Report

| | |
| --- | --- |
| Date | 24 November 2026 |
| Scope | The eight legal documents, their database records, the public legal pages, the sign-up consent, the Legal Notices, and the factual statements in the texts compared with the software |
| Follows | `docs/TWIGO-CURRENT-SYSTEM-BEHAVIOR-REPORT.md`, findings C-1 and H-1 |
| Databases changed | **Local development only**: `cowork` and `cowork_demo` on the embedded PostgreSQL (`localhost:5433`). **Production was not touched; nothing is published in production.** |
| Code | Committed locally on `main` (not pushed). A new release is required before deployment (section I) |

---

## A. Executive summary

**The founder's position:** the eight legal drafts were reviewed and approved by a legal professional; the task is accuracy, consistency and publication through the existing system, with no new legal review and no rewriting.

**What was found.**
- The texts in the code are byte-for-byte the version 1 texts that existed when the founder reported the review (no change to `src/content/legal/terms.ts`, `privacy.ts` or `policies.ts` since commit `5bc465c`, 23 November 2026, 00:43; the founder's statement was recorded the same day in `docs/TWIGO-OPEN-DECISIONS.md`). Their SHA-256 fingerprints are listed in section H and now locked by a test.
- The repository holds **no record of who reviewed the texts or when**. The founder's statement covers "the eight documents" as a set; it does not name the reviewer, the date or individual versions. That evidence is mapped to each document's version 1 by fingerprint (section B), but the reviewer and date remain **missing facts** that only the founder can supply at publication.
- **Seven texts are finished and consistent** with the software once three small software fixes (below) make two promises in them true.
- **The Privacy Policy (version 1) is not finished**: its own text says the hosting provider and server location "will be named here before this policy is published" and that transfer safeguards "will be described here before publication". Those facts are not established. It also states things the software does not do (section E.2). It therefore **cannot truthfully be approved or published**, even though it was reviewed.
- The uncommitted edits found in the working tree (removing all "Draft awaiting legal review" notices) would have shown unreviewed or unfinished texts as if they were in force. They were **not kept**: the status display was restored, and it now always matches the stored status.
- The Legal Notices page automatically marked "Twigo" as the confirmed **legal operator** and the configured jurisdiction ("Sacramento, California" in the production template) as the confirmed **governing law**. Both contradicted the approved Terms (§1: the operator "has not yet been formally confirmed"; §21: the governing law "has not yet been determined"). This was corrected: the operator and governing law now show "Not yet confirmed" until the owner confirms verified facts; the jurisdiction (where the operator is established) and the contact addresses are still taken from the founder's settings.

**What was done (smallest reliable changes).**
1. Public legal pages again show each document's real status, version, effective date, fingerprint and history (restored from the committed code); the "Approved" notice no longer wrongly says "not yet reviewed by a lawyer"; the draft notice no longer says "not yet reviewed by a lawyer" (which would contradict the founder) but "not approved and published after legal review".
2. The sign-up form names exactly which of the three registration texts are still drafts (today: only the Privacy Policy).
3. A **publication guard**: a text that says something will be added "before publication" cannot be approved or published, in the admin area or by the one-time publication script (which now reports it as `incomplete`). The deployment script shows that result and lists it as a manual step.
4. Legal Notices no longer present the community name as the legal operator or the jurisdiction as the governing law.
5. Two software fixes that make approved texts true: members can now **report a chat message** (Community Guidelines §12 already said they could), and a **new project-agreement version can no longer leave out a participant of the agreement in force** who has not recorded leaving (Participation and Compensation Policy, "Changes": "Nobody, including the coordinator, can change another person's compensation without that person's acceptance").
6. In the two **local development databases** only, the seven finished documents were approved and published through the existing procedure (`publishReviewedDocuments`), with an approval note that states exactly what evidence exists and that the reviewer and date were not provided. The Privacy Policy stays "Pending legal review". No consent record or account was changed.

**Result in development:** documents, database records, public pages and the sign-up consent agree: 7 of 8 published (effective 24 November 2026 in the development databases only), the Privacy Policy visibly a draft.

**Result in production:** nothing changed. Production is not deployed. Publication there requires a new release, the founder typing `PUBLISH` at the deployment's legal step with the real reviewer and review date, and it will publish the same seven documents and leave the Privacy Policy as a draft (section I).

**Tests (run 24 November 2026, after all changes):** full automated suite **441 passed, 0 failed** (38 files); Playwright browser suite on a production build **23 passed, 0 failed**; TypeScript and ESLint clean; browser checks on the local demo server. Deployment and launcher suites were not run (they need WSL Docker).

---

## B. Inventory

### B.1 Where the legal documents live

| Component | Location | Notes |
| --- | --- | --- |
| Text source | `src/content/legal/terms.ts`, `privacy.ts`, `policies.ts` (six documents), list in `src/content/legal/index.ts` | Functions of the organization name (`ORG_NAME`, "Twigo"). Markdown subset |
| Data model | `LegalDocument`, `LegalDocumentVersion` (status, content, `contentHash`, `changeSummary`, `materialChange`, `requiresReacceptance`, `approvedAt/By`, `approvalNote`, `publishedAt/By`, `effectiveDate`, `supersededAt`), `LegalAcceptance` (user, version, number, hash, kind, method, time) | `prisma/schema.prisma` |
| Status enum | `DRAFT`, `PENDING_LEGAL_REVIEW`, `APPROVED`, `PUBLISHED`, `SUPERSEDED` | No new value was added |
| Seeding | `ensureLegalDocuments` (`src/server/legal.ts`) creates version 1 of any missing document as `PENDING_LEGAL_REVIEW` the first time it is needed | No seed script; also created by `publishReviewedDocuments` |
| Shown to visitors | Latest `PUBLISHED`; otherwise latest `APPROVED`/`PENDING_LEGAL_REVIEW` with a draft notice; `DRAFT` never | `displayedVersion` |
| Admin management | Admin → Legal (owner only, `legal.manage`): new draft, edit, send for review, approve (reviewer note ≥10 characters + "a lawyer reviewed it" tick), publish (effective date), Legal notices, Acceptance records | `src/app/admin/(panel)/legal/**`, `src/app/admin/actions/twigo.ts` |
| Publication script | `npm run legal:publish-reviewed -- --owner … --reviewed-by … --reviewed-on … [--effective …] [--dry-run]` (exists in `package.json`) | `scripts/legal-publish-reviewed.ts`, `src/ops/legal-publish.ts`; called by `scripts/deploy/deploy-twigo.sh` step 9 only when the operator types `PUBLISH` |
| Consent | Sign-up: three separate required boxes (accept Terms, accept Guidelines, acknowledge Privacy) bound to the displayed version ids; Group Participation Agreement recorded on supporting an idea or joining a group; re-acceptance gate `/legal/review` for published versions flagged `requiresReacceptance` | `src/app/(auth)/join/page.tsx`, `src/server/onboarding.ts`, `src/server/legal.ts` |
| Legal Notices | `src/server/legal-notices.ts`, `/legal/notices`, Admin → Legal → Legal notices | Fields: operator name, entity type, jurisdiction, registered address, registration number, contact email, privacy contact, governing law, effective date |
| CMS | The legal texts are not in the website-content editor; only through the versioning above | — |
| Older docs | `docs/legal/*.md` (earlier drafts, not served), `docs/TWIGO-LEGAL-REVIEW-CHECKLIST.md` | Not used by the application |

### B.2 Database state re-verified before any change (24 November 2026)

| Database | Legal rows | Acceptances |
| --- | --- | --- |
| `cowork` (development) | **none** (documents had never been opened, so not yet created) | 0 |
| `cowork_demo` (local demo) | all 8 documents, version 1, `PENDING_LEGAL_REVIEW`, summary "… Not reviewed by a lawyer."; every stored fingerprint equals the code text's fingerprint | 5 (synthetic accounts) |
| Production | Unknown; not deployed (per project documents) | Unknown |

### B.3 Inventory table

| Document | Current content source | Current version | Current status (dev, after this work) | Legal approval evidence | Required action |
| --- | --- | --- | --- | --- | --- |
| Terms of Use | `src/content/legal/terms.ts` | 1, `26a10ac4…467e1` | PUBLISHED (dev only), effective 2026-11-24 | Founder's statement (23 Nov 2026) that the eight documents were reviewed and approved; text unchanged since; reviewer and date **not provided** | Production: publish with the real reviewer and date. Flagged clauses: E.3 |
| Privacy Policy | `src/content/legal/privacy.ts` | 1, `95e19ccf…ad0f7` | PENDING_LEGAL_REVIEW (draft notice shown) | Same statement; text unchanged | **Blocked.** New version 2 with the hosting provider and location, Cloudflare, backups and the corrections in E.2, reviewed by counsel |
| Community Guidelines | `src/content/legal/policies.ts` | 1, `2252f14d…ada21` | PUBLISHED (dev only) | Same | Production publication. (Made true by the chat-report fix) |
| Intellectual Property Policy | `policies.ts` | 1, `d93a56c2…7acce` | PUBLISHED (dev only) | Same | Production publication |
| Participation and Compensation Policy | `policies.ts` | 1, `fb1557f6…90d6d` | PUBLISHED (dev only) | Same | Production publication. (Made true by the agreement fix) |
| Group Participation Agreement | `policies.ts` | 1, `bc7134b9…4402a` | PUBLISHED (dev only) | Same | Production publication |
| Cookie Policy | `policies.ts` | 1, `216b112c…2d79` | PUBLISHED (dev only) | Same | Production publication |
| Community Support Policy | `policies.ts` | 1, `e993eb2a…3880b` | PUBLISHED (dev only) | Same | Production publication |

Approval of one document was not taken to mean approval of another: each was checked separately against the software (section E), and the founder's statement was mapped to each version 1 only because the text of each is unchanged since that statement.

---

## C. Facts: confirmed vs. unresolved

| Fact | State | Source | Where it is used |
| --- | --- | --- | --- |
| Public name: Twigo | **Confirmed** | `ORG_NAME` (template and local settings), `src/config/brand.ts` | Everywhere; generated into the legal texts |
| Domain: https://twigo.space | **Confirmed** | `SITE_URL` in `.env.production.example`; deployment script requires exactly this value | Links, emails |
| Slogan: "Together We Innovate, Grow & Opportunity" | **Confirmed** (kept word for word at the founder's instruction) | `ORG_TAGLINE` | Home, page titles |
| Operating principles (no mandatory fees or investment, no guaranteed employment or income, voluntary participation, member-set responsibilities and compensation, no automatic commission, optional voluntary contributions, no guaranteed revenue) | **Confirmed**, consistent in the seven published texts, the site copy and the software (no payment, fee or commission code exists) | Texts; `tests/twigo-revenue-model.test.ts` | — |
| Legal operator | **Unresolved.** No registered entity is verified. Twigo is "a brand and an online community"; the founder runs it (Terms §1, Privacy §1, Legal Notices intro). `ORG_LEGAL_NAME=Twigo` is a name only and is no longer shown as the "Legal operator name" | Founder's settings; approved texts | Legal Notices: "Not yet confirmed" |
| Legal entity type, registered address, registration number | **Unresolved / not applicable**; nothing invented | — | Legal Notices: "Not yet confirmed" |
| Jurisdiction (where the operator is established): "Sacramento, California" | **Founder's configuration** (commit `cf422db`, production template). Not independently verified. Not derived from the VPS, registrar, host or Cloudflare | `.env.production.example` | Legal Notices "Jurisdiction" only (production). Locally the value is empty |
| Governing law and courts | **Unresolved.** Terms §21 (approved) says not yet determined. Stating California law would add a jurisdiction clause, which is outside this task | Terms §21 | Legal Notices: "Not yet confirmed" |
| Public contact and privacy contact: contact@twigo.space | **Confirmed** (founder's decision; public role address) | `ORG_CONTACT_EMAIL` | Legal Notices, Contact page, status pages |
| Sender: "Twigo <noreply@twigo.space>" | **Configured** (template); domain verification in Resend not proven | `EMAIL_FROM` | Emails |
| `ADMIN_NOTIFICATION_EMAIL` | **Empty in the production template**; value on the server unknown. Not a legal fact; operational | template | Admin emails |
| Reviewer (lawyer or firm) and review date | **Not provided.** Never invented | — | Must be typed by the founder at production publication |
| Effective date (production) | **Not decided**; the founder chooses it at publication | — | — |
| Approval date / publication date (development) | 24 November 2026: the date this work recorded the approval and publication in the development databases. Not a review date | Development databases | Development only |
| Hosting provider name and server location | **Unresolved** (`docs/TWIGO-OPEN-DECISIONS.md` item 5) | — | Blocks the Privacy Policy |
| Third parties actually used or configured | Cloudflare (DNS and proxy, observed per project docs); Resend (SMTP relay, configured, key not set, never used for real); Google Meet (external links opened by members); the VPS host (name unknown). **No analytics or monitoring services** in the code | Section E.2 | Privacy Policy version 2 |
| Minimum age | Not a fixed number; Terms §2 (approved): "old enough to enter into a binding agreement where you live". Not verified by the software | Terms | — |

Settings were inspected only for names and non-secret values (organization name, tagline, domain, contact, sender, jurisdiction). No secret value (SMTP/Resend key, authentication or encryption keys, database passwords) was read, displayed or copied.

---

## D. Every file and database change

### D.1 Uncommitted working-tree edits (decision)

The five files edited before this task removed the draft banner, status badge, effective date, fingerprint and version history from the public legal pages and the draft sentence from the sign-up form, and changed the walkthrough to require the banner's absence.

**Decision: not kept.** Evidence: every database examined held the documents as `PENDING_LEGAL_REVIEW`; the edits would have shown them as if in force, contradicting `src/server/legal.ts` ("shown with a clear notice that it is a draft") and the task's rule that the visible state must match the real status. A superseded version would also have looked current. The edits are preserved, unmodified, in `backups/uncommitted-legal-display-edits-2026-11-24.patch` (git-ignored; not deleted). The files were restored to the committed behavior and then improved so that published documents show "In force since <effective date>" and drafts show the draft notice — the display now follows the stored status automatically.

### D.2 Code changes

| File | Change | Why |
| --- | --- | --- |
| `src/app/(site)/legal/page.tsx` | Back to the committed version (status badge, intro about versions) | D.1 |
| `src/app/(site)/legal/[key]/page.tsx` | Restored status notice, facts (version, effective date, fingerprint) and "All versions" | D.1; Phase 7 |
| `src/app/(site)/legal/[key]/v/[version]/page.tsx` | Restored status notice (marks superseded versions), facts, full fingerprint | D.1 |
| `src/components/legal/document-view.tsx` | "Approved, not yet published" no longer says the text was not reviewed; the draft notice says "not approved and published after legal review" instead of "not yet reviewed by a lawyer" | Accuracy for both the founder's statement and the stored status |
| `src/app/(auth)/join/page.tsx` | The draft sentence is shown only for registration documents that are not published, naming them | Consent: accurate disclosure |
| `src/server/legal.ts` | `registrationDocuments` returns each version's status; new version 1 summary no longer says "Not reviewed by a lawyer" (the status says it); approving or publishing a text that promises facts "before publication" is refused; approval drops the old "Not reviewed by a lawyer." sentence from the summary | Publication requirements; no contradictory statements next to a published version |
| `src/content/legal/index.ts` | `publicationProblem()` and `withoutReviewDisclaimer()`. **No legal text changed** | Guard |
| `src/ops/legal-publish.ts` | New result `incomplete` (not approved, not published) with the reason; summary cleanup on approval | Guard in the production path |
| `scripts/legal-publish-reviewed.ts` | Prints why an `incomplete` document was not published | Operator clarity |
| `scripts/deploy/deploy-twigo.sh` | Legal step lists `incomplete` lines and records a manual step; final message no longer claims all were published. The `PUBLISH` confirmation, reviewer and date requirements are unchanged | Accuracy; not weakened |
| `src/server/legal-notices.ts` | `ORG_LEGAL_NAME` no longer fills "Legal operator name"; `ORG_JURISDICTION` no longer fills "Governing law". Jurisdiction and contacts still come from the settings | H-1; Terms §1 and §21 |
| `src/lib/env-schema.ts` | Start-up messages describe the two settings correctly (not "the legal name/governing law shown in the Privacy Notice and the Terms") | Accuracy |
| `.env.production.example` | Comments explaining the two settings. **Values unchanged** | Founder guidance |
| `src/app/(site)/about/page.tsx` | "its legal operator and jurisdiction have not yet been formally confirmed" → "its legal operator and the governing law have not yet been formally confirmed (the confirmed facts are on the Legal Notices page)" | Consistency with the notices |
| `src/components/community/chat.tsx`, `src/components/community/report-button.tsx` | "Report" on other members' chat messages (uses the existing server function); panel can open to the left | Community Guidelines §12; chat help text |
| `src/server/community/group-projects.ts` | Opening a new agreement version is refused if it leaves out a participant of the agreement in force who is still an active group member and has not recorded leaving the project | Participation and Compensation Policy, "Changes" |
| `scripts/audit/walkthrough.ts` | Restored expectation: in the walkthrough's new database every policy shows the draft notice | D.1 |
| `tests/legal-publish.test.ts` | Updated and new tests (G.1 in section F) | — |
| `tests/twigo-projects.test.ts` | New test for the omission rule | — |
| `docs/TWIGO-LEGAL-DOCUMENTS-RESOLUTION-REPORT.md` | This report | — |
| `docs/TWIGO-CURRENT-SYSTEM-BEHAVIOR-REPORT.md` | Previous audit (first committed now), with a pointer to this report | — |
| `docs/TWIGO-OPEN-DECISIONS.md`, `docs/TWIGO-PROGRESS.md` | Short updates | — |

### D.3 Database changes (development only)

| Step | `cowork` | `cowork_demo` |
| --- | --- | --- |
| Target confirmed isolated | Embedded PostgreSQL on `localhost:5433` (the `.env` `DATABASE_URL` points to `localhost:5433/cowork`) | Same server, demo database with fictional `@demo.test` accounts |
| Backup before change | `backups/cowork-20261124-154157-before-legal-publication.cwbak.gz` (56 tables, 279 rows) | `backups/cowork_demo-20261124-154202-before-legal-publication.cwbak.gz` (56 tables, 122 rows) |
| Change | `publishReviewedDocuments` (the production code path) with owner = the oldest active OWNER, effective date 2026-11-24, approval note: *"Founder's statement, recorded on 23 November 2026 in docs/TWIGO-OPEN-DECISIONS.md: a legal professional reviewed and approved this exact text (version 1). Reviewer name and review date were not provided. Recorded in a local development database only."* | Same |
| Result | 8 documents created (version 1); 7 APPROVED → PUBLISHED; Privacy `incomplete` (stays PENDING) | 7 PUBLISHED; Privacy stays PENDING (its stored summary still reads "… Not reviewed by a lawyer.", the text recorded when it was created; left as stored) |
| Audit | 7 `legal.status_approved` + 7 `legal.status_published` | Same |
| Preserved | All accounts (6); acceptances 0 | All accounts (9); all 5 acceptance records unchanged and still pointing to the same versions and fingerprints |
| Integrity checks after | One published version per document; no orphan acceptance; no acceptance whose fingerprint differs from its version | Same |
| Reversible | Restore the backup into a new database (`npm run db:restore`), or leave as is (development data) | Same |

The demo walk-through earlier on 24 November also added one synthetic report on a chat message (testing the new button).

No migration, schema change or enum change was made.

---

## E. Consistency with the model, the software, data practices, consent and the site

### E.1 Operating model

All seven published texts and the Privacy Policy draft state the model consistently: voluntary participation; no membership, registration or joining fees; no mandatory investment; no guaranteed income, projects or customers; participants decide compensation in a written agreement every participant accepts; no commission, percentage or ownership share for Twigo, and it does not collect, hold or distribute project money; voluntary community support is optional, separate and gives no privileges; a group is not a company or partnership unless members create one; Twigo does not decide employment or contractor status. The site copy (Home, How It Works, Pay & Fairness, FAQ, footer, sign-up, application confirmation) matches. No text describes Twigo as an LLC, corporation, nonprofit, cooperative or partnership. **No change was needed.**

The texts distinguish Twigo's infrastructure from members' own projects (Terms §8–§9, §13–§14, §19–§20; Group Participation Agreement intro; the fixed agreement sentence "the platform is not a party … receives no share, commission or fee"), from member-to-member relationships (Group Participation Agreement; agreement disputes) and from member-to-customer relationships (agreement fields: customer contracting party, payment recipient). They create no employment, contractor, partnership or agency classification and promise no customers, success or payment.

### E.2 Privacy Policy (version 1) compared with the software

| Data category | Collected? | Why | Where stored | Who can access | Shared externally? | Retention (current defaults) | Access / correction / deletion |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Account (name, email, password hash, encrypted two-step secret, hashed recovery codes, sign-in times, status) | Yes | Sign-in, account email | PostgreSQL (`User`, `Session`, `RecoveryCode`) | The person; administrators (not secrets) | Email address to the email provider when an email is sent; all traffic passes through Cloudflare | While the account exists; closing = deactivation; deactivated accounts are never purged | Export: yes. Correct: yes. Delete: **request only; no erasure tool exists** |
| Application (country, region, occupation, education, experience, skills, link, categories, hours, schedule, motivation, contribution) | Yes. **Time zone and preferred contact method are listed by the policy but no longer collected** | Review | `Applicant`, `Application`, `ApplicantSkill`, `WorkPreference`, `Availability` | Administrators; owner exports | No | Declined-only applicants: 365 days; accepted: kept | Export: yes; Correct: no after submission (request); Delete: owner can erase applicant data (not the account) |
| Profile | Yes | Community | `MemberProfile`, photo file | Members (chosen fields) | No | While the account exists | Edit: yes; Delete: request |
| Ideas, comments, discussions, announcements, revisions | Yes | Community | PostgreSQL | All members | No | Deleted/removed content purged after 30 days | Export: ideas and comments yes; discussions/announcements partly |
| Group chat, files, research notes, tasks, decisions, links, meetings | Yes | Group work | PostgreSQL; files on the server disk (`/data/storage`) | Group members; **administrators: the admin panel shows four research-note sections once a group is "Ready for review", and an administrator who joins a group sees all past notes, tasks, decisions, links and files (chat only from joining)** | Meetings: the link opens Google Meet | Chat: kept; archived-group files 365 days; meetings 365 days | Export: chat yes, others no |
| Project agreements and compensation terms | Yes | Evidence of what was agreed | PostgreSQL | All members of the group (including drafts); owner download (audited); administrators see status only | No | Kept | Export: own participation yes |
| Acceptance records | Yes | Evidence | `LegalAcceptance` | Owner; the person (Account → Agreements) | No | Kept | Export: yes |
| Notifications and email log | Yes; the log also stores the **message body** of non-secret emails (not mentioned) | Delivery records | `Notification`, `EmailDelivery` | The person (notifications); administrators (email log) | Resend (when configured) | Read notifications 90 days; email log 730 days | Export: notifications yes; email log no |
| Reports and moderation | Yes, with a snapshot of the reported content | Moderation | `ContentReport` | Administrators (viewing reported chat is logged) | No | Not purged | — |
| Contact form | Yes, with a keyed hash of the network address | Answer inquiries | `ContactInquiry` | Administrators | Admin notification email if configured | Closed: 365 days | — |
| Technical: sessions (hashed network address, browser description), in-memory sign-in counters, audit log | Yes | Security | `Session`, process memory, `AuditLog` | Administrators (audit log: all administrators) | No | Expired sessions 30 days; audit log kept indefinitely | — |
| Backups | Yes: full database copies daily (newest 14, encrypted in production) **plus** pre-deployment copies of the database, the uploaded files and the server settings in `~/Server/backups/twigo/<time>/` with no automatic deletion | Recovery | Same server | Server operator | No | Up to 14 days for daily backups; pre-deployment copies until deleted by hand | **Not mentioned in the policy** |

**Third parties actually used or configured:** Cloudflare (DNS and proxy, observed per project documents — processes every visitor's network address); Resend (SMTP relay, configured, not yet used); Google Meet (external, opened by members); the VPS host (name unknown). No analytics, advertising or monitoring services exist in the code. Version 1 names Resend ("intended") and Google Meet, says the host is "not yet chosen", and **does not mention Cloudflare or backups**.

**Statements in version 1 that exceed or contradict the implementation:**
1. "Group chats, files and research notes are visible only to the group's current members. Administrators do not browse them." — not accurate (row above).
2. "Closing your account deactivates it; full deletion is done on request" — no deletion tool exists, and backup copies remain afterwards; "full deletion" cannot be promised while copies remain.
3. "They will be named here before this policy is published" / "will be described here before publication" — conditions not met.
4. Lists time zone and preferred contact method as collected (they are not); omits stored email bodies.
5. "Encrypted connections" — depends on the Cloudflare/Caddy TLS set-up, which is not yet in place (production not deployed).

These require **changes to the Privacy Policy's text that alter its disclosures** (who can see group content, deletion, backups, processors). Under the founder's instruction such changes are flagged rather than made, and the hosting facts are not available anyway. **Resolution: the Privacy Policy stays a visible draft; a version 2 must be prepared with the facts above and reviewed by counsel** (section I, step 7). The software was **not** changed to fit statements 1–2 (that would remove the owner's review of group plans or add a new erasure feature); that choice is left to the founder.

### E.3 Terms of Use and Community Guidelines compared with the real model

| Clause | Software | State |
| --- | --- | --- |
| Terms §2 eligibility, one account, application reviewed by a person, acceptance not guaranteed | Matches (Section 5 of the behavior report) | Consistent |
| Terms §3 voluntary participation; leave a group or close the account at any time | Matches | Consistent |
| Terms §7 ideas visible to all members, not confidential, author keeps ownership | Matches | Consistent |
| Terms §8 "at least two members other than the author" | Default of the owner setting `community.endorsementThreshold`; if the owner changes the setting, this sentence becomes inaccurate | Consistent **while the setting stays 2** (flag) |
| Terms §9 commercial work starts only after every participant accepted the recorded agreement | The software's "Start commercial work" requires full acceptance; it cannot police work done outside the platform | Consistent as a statement of the rule |
| Terms §13–§15 no commission; participants decide; voluntary support | Matches; no money code | Consistent |
| Terms §18 suspension; Terms §19 moderators act on conduct, not compensation | Matches | Consistent |
| Terms §20 "The exact limitation of liability depends on the governing law and is subject to legal review" | Text describes review as pending | **Flag for the founder/counsel**: wording about review status inside the approved clause; not changed (would alter a liability clause) |
| Terms §21 governing law not yet determined; "will be stated on the Legal Notices page and in a published version of these terms" | Legal Notices now show "Not yet confirmed" for governing law | Consistent. **Flag:** the sentence anticipates a later published version that states the governing law; if the founder intends California law, a new Terms version reviewed by counsel is needed |
| Terms §22 every version kept; material changes ask for renewed acceptance; accepted version listed under Account → Agreements | Matches (restored public history; re-acceptance gate) | Consistent |
| Guidelines §12 "Use 'Report' next to any idea, comment, discussion, message, group or member" | **Was false for chat messages; fixed** | Consistent now |
| Guidelines §13 appeals: "reply to the message you received or use the contact page" | Moderation removals send no message; the contact page exists | Mostly consistent (flag: no message is sent on content removal) |
| Participation and Compensation Policy, "Changes" | **Was false when a participant was left out of a new version; fixed** for participants who are still active group members and have not recorded leaving | Consistent now. Remaining edge: a participant who left the group without recording leaving can be omitted (they can no longer be listed); their accepted terms remain on record in the superseded version |
| Group Participation Agreement §2 (administrators see chat only from joining), §9 (removal after confirming the step) | Matches (confirmation dialog exists) | Consistent |
| Cookie Policy (two cookies, one browser-storage use, no tracking, no third-party scripts) | Verified in code: `__Host-cw_session`/`cw_session`, `cw_pending_email` (30 min), `sessionStorage` for unsent chat; CSP allows only own scripts | Consistent |
| Community Support Policy (online contributions not available) | `paymentsAvailable()` is hard-coded false | Consistent |

### E.4 Consent

- Sign-up keeps three separate required boxes; each links to its document (opens in a new tab, readable before accepting); the exact version ids shown are posted and must still be the displayed versions, otherwise sign-up is refused; version number, fingerprint, kind and time are recorded (`tests/twigo-legal.test.ts`, passed).
- The form now says which of the three are drafts (verified: "The Privacy Policy is a draft awaiting legal review.").
- Publishing version 1 of a document that people already accepted creates **no re-acceptance**: they accepted that exact text (same version, same fingerprint); `pendingReacceptance` stays empty (test passed). This follows the existing rule (re-acceptance only for versions flagged as material changes).
- No consent record was erased or modified.
- Application consent: the application form stores a fixed string `privacyNoticeVersion = "2026-11-draft-2"` that is not linked to the legal versions (unchanged; flagged in section G).

### E.5 Site consistency (name, domain, contacts, versions, dates)

Checked: footer, About, Contact, FAQ, Apply, Sign Up, `/legal/*`, Pay & Fairness, registration and application consent, email templates. Name "Twigo", domain from `SITE_URL`, contact address from `ORG_CONTACT_EMAIL` and slogan are consistent. Fixed: About's statement about the jurisdiction; Legal Notices' operator and governing law. Legal pages show versions, status and effective dates from the database. Email templates contain no legal claims beyond "no fees"; they call applicants "founding contributors" (pre-existing wording, not legal).

---

## F. Tests and results

All runs on 24 November 2026, local machine, isolated databases.

| Check | Command | Result |
| --- | --- | --- |
| TypeScript | `npx tsc --noEmit -p .` | **Passed** (0 errors) |
| ESLint | `npx eslint . --quiet` | **Passed** (0 errors) |
| Affected test files | `npx vitest run tests/legal-publish.test.ts tests/twigo-legal.test.ts tests/twigo-projects.test.ts tests/release-fixes.test.ts tests/corrective-launch.test.ts` | **62 passed** |
| Full automated suite | `npx vitest run` (database `cowork_test`) | **441 passed, 0 failed** (38 files). A first full run found 1 failure: a new code comment quoted a bracketed placeholder, caught by the placeholder scan; the comment was reworded and the file and the whole suite re-run |
| Browser suite (Playwright, production build) | `npx playwright test` | **23 passed, 0 failed** (4.3 min; Microsoft Edge; its own database `cowork_e2e`, recreated by the suite; local mail catcher). Two `SERVER_UNAVAILABLE` email log lines are from a scenario that simulates an unreachable mail server |
| Deployment / launcher suites | `scripts/deploy/test-*.sh`, `test-launcher.ps1` | **Not run** (need WSL Docker and an isolated SSH server). The only deploy-script change is in the legal-publication output lines |
| Role walkthrough | `scripts/audit/walkthrough-run.sh` | **Not run** (Docker build) |

**New or changed tests**
- `legal-publish.test.ts`: publication publishes seven documents and reports the Privacy Policy as `incomplete` (not approved, not published, no effective date); published versions carry no "not reviewed" summary; running again changes nothing; audit counts.
- `legal-publish.test.ts`: **the eight texts are exactly the reviewed version 1 texts** (fingerprints of section H) — a future text change fails this test instead of being published as reviewed.
- `legal-publish.test.ts`: an unfinished text cannot be approved through the admin path; a finished one can be approved and published, and an old "Not reviewed by a lawyer." summary is removed on approval.
- `legal-publish.test.ts`: Legal Notices show contact and jurisdiction from the settings, never "Twigo" as legal operator nor the jurisdiction as governing law; an owner-confirmed value wins.
- `twigo-projects.test.ts`: a new agreement version that leaves out a participant of the agreement in force is refused until that person records leaving.
- Existing tests that cover the rest of Phase 9 and passed: registration requires all three boxes and records exact versions (`twigo-legal`, `release-fixes`); a stale form cannot accept a newer text; drafts are never public; accepted versions cannot return to draft; only the owner manages documents and notices; non-owners are refused (`/admin/no-access`); audit entries for status changes.

**Browser checks** (local demo server, `cowork_demo`, synthetic accounts):

| Page / action | Result |
| --- | --- |
| `/legal` | 7 × "Version 1 · Published", Privacy "Version 1 · Pending legal review" |
| `/legal/terms`, `/legal/cookies`, `/legal/community-guidelines` | "In force since November 24, 2026", version list "Published" |
| `/legal/privacy` | "Draft awaiting legal review" |
| `/legal/terms/v/1` | "In force since November 24, 2026", full fingerprint `26a10ac4…467e1` |
| `/join` | "The Privacy Policy is a draft awaiting legal review." (Terms and Guidelines not called drafts) |
| `/legal/notices` (local settings) | Legal operator name, Jurisdiction, Governing law: "Not yet confirmed" (local `ORG_JURISDICTION` is empty) |
| Admin → Legal (owner with two-step code) | Terms v1 · Published; Privacy v1 · Pending legal review; others Published; fingerprints and acceptance counts shown |
| Chat: "Report" on another member's message | Panel opens fully visible; "Thank you. The report was sent to the moderators."; stored as `MESSAGE` report with snapshot |

No placeholder such as `[Company Name]` appears (existing tests and editor rule). Nothing unpublished is shown as published.

---

## G. Remaining blockers (none hidden)

1. **Reviewer identity and review date are missing.** The founder must supply them at production publication. Without them the deployment script will not publish (it requires both).
2. **Privacy Policy cannot be published**: hosting provider and server location unknown; Cloudflare and backups not disclosed; statements in E.2 (items 1, 2, 4, 5) exceed or misstate the implementation. Needs a version 2 with these facts and counsel's review. Until then, every new member acknowledges a draft (clearly labelled).
3. **Legal operator not established** (no registered entity verified). Legal Notices show "Not yet confirmed"; Terms §1 and Privacy §1 say the founder runs the community.
4. **Governing law not determined** (Terms §21). If California law is intended, a new Terms version reviewed by counsel is required; then confirm it in Admin → Legal → Legal notices.
5. **Production is not deployed**, and the current release package `twigo-rc5-2026-11-23` does **not** contain these changes. A new release is required.
6. Terms §20 refers to liability "subject to legal review" — wording for counsel, not changed.
7. Terms §8's fixed "two members" depends on the owner setting staying at 2.
8. The application's stored `privacyNoticeVersion` string is not linked to the legal versions.
9. Account deletion: no tool; requests are manual (behavior report H-2).
10. Agreement omission edge: a participant who left the group without recording leaving can be omitted from a new version (E.3).
11. Production `ADMIN_NOTIFICATION_EMAIL` is empty in the template (operational, not legal).
12. In `cowork_demo`, the Privacy Policy row still carries the earlier summary "… Not reviewed by a lawyer." (development data; production databases created from this release do not get that sentence).

---

## H. Status table

Fingerprints are SHA-256 of the text generated with the name "Twigo" (the production `ORG_NAME`).

| Document | Approved | Published | Version | Effective date | Verified |
| --- | --- | --- | --- | --- | --- |
| Terms of Use | Dev: yes (founder's statement; reviewer/date not provided). Prod: no | Dev: yes. **Prod: no** | 1 · `26a10ac490152de5398ab2c4ee8cc804ad63aca776edf37c3cd184bffeb467e1` | Dev: 2026-11-24. Prod: none | Test + DB + browser |
| Privacy Policy | **No** (incomplete text) | **No** | 1 · `95e19ccfabc9f14175fce38149f8d922422622132629e58221c36a8da01ad0f7` | None | Test + DB + browser |
| Community Guidelines | Dev: yes. Prod: no | Dev: yes. Prod: no | 1 · `2252f14d2ac448f68b6836be000341120a6d4585b2753015640b56aeff2ada21` | Dev: 2026-11-24 | Test + DB + browser |
| Intellectual Property Policy | Dev: yes. Prod: no | Dev: yes. Prod: no | 1 · `d93a56c263ccbdd903739d0c648e7188dd4c2a7f720767699f5fd12af187acce` | Dev: 2026-11-24 | Test + DB |
| Participation and Compensation Policy | Dev: yes. Prod: no | Dev: yes. Prod: no | 1 · `fb1557f6d9df34d8e8e885fa9652f145720b3a2e50f73844d85d26d272590d6d` | Dev: 2026-11-24 | Test + DB |
| Group Participation Agreement | Dev: yes. Prod: no | Dev: yes. Prod: no | 1 · `bc7134b99b96d1ed9e3e2f217b0c60acefe07e72d22ec5e25b394eb344bd402a` | Dev: 2026-11-24 | Test + DB |
| Cookie Policy | Dev: yes. Prod: no | Dev: yes. Prod: no | 1 · `216b112c08e8fc7e510379c99d6fb9452ee89273ea78133ab180eb3b5d0b2d79` | Dev: 2026-11-24 | Test + DB + browser |
| Community Support Policy | Dev: yes. Prod: no | Dev: yes. Prod: no | 1 · `e993eb2a1c4c7846b0e4fef5c1384ee4f2726b42c7fa74357d9b9dcf8113880b` | Dev: 2026-11-24 | Test + DB |

"Dev" = the local databases `cowork` and `cowork_demo`. "Prod" = production (not deployed; nothing published).

---

## I. Production instructions (after the founder reviews this report)

Do not run any of this until the founder has read sections C, E and G.

1. **Decide the open facts.** Confirm that the lawyer's review covered exactly the eight version 1 texts with the fingerprints in section H (the reviewer can compare the text on a local `/legal/<document>` page or the fingerprint shown there). Have ready: the lawyer's or firm's name, the review date, and the effective date you want.
2. **Build a new release** (the existing `twigo-rc5-2026-11-23` does not contain these changes). From the repository on Windows:
   - `git tag twigo-rc6-2026-11-24` (on the commit containing this report)
   - `.\scripts\deploy\new-release.ps1` (builds `release/` from the tag and runs the launcher check)
3. **Server settings** (`~/Server/twigo/.env.production` on the VPS, edited by the founder only): no new variable is needed. `ORG_LEGAL_NAME=Twigo` remains the footer name and is no longer shown as the legal operator; `ORG_JURISDICTION` is shown only as "Jurisdiction" on Legal Notices (not as governing law); `ORG_CONTACT_EMAIL=contact@twigo.space` is the public and privacy contact. Optionally set `ADMIN_NOTIFICATION_EMAIL`.
4. **Deploy** with `.\deploy-twigo.ps1`. At step 9 the script asks about the legal documents:
   - Type `PUBLISH` **only** if the lawyer reviewed exactly these texts. Enter the real reviewer, the real review date (YYYY-MM-DD) and the effective date.
   - Expected output: seven lines `published …` and one line `incomplete Privacy Policy v1`, followed by the manual step about the Privacy Policy. This is correct.
   - If you press Enter instead, all eight stay "Draft awaiting legal review" and you can publish later by running the deployment again, or in Admin → Legal (step 6).
5. **Verify on https://twigo.space** (read-only checks): `/legal` lists seven "Version 1 · Published" and "Privacy Policy · Pending legal review"; `/legal/terms` shows "In force since <your effective date>"; `/legal/privacy` shows "Draft awaiting legal review"; `/join` says only the Privacy Policy is a draft; `/legal/notices` shows the jurisdiction and contact, and "Not yet confirmed" for the legal operator and governing law.
6. **Alternative to step 4 (admin area, after deployment):** Admin → Legal → each document → "Approve" (tick that a lawyer reviewed this exact version; note with the reviewer and date) → "Publish" (effective date). The Privacy Policy will refuse with the "before publication" message — expected.
7. **Privacy Policy version 2** (when the facts exist): Admin → Legal → Privacy Policy → New version. Add the hosting provider and server location, Cloudflare, backups (daily copies kept 14 days; pre-deployment copies), what administrators can see in groups, how deletion requests are handled (and that backup copies remain for a time), and remove the items no longer collected. Mark it as a material change and decide with counsel whether renewed acknowledgement is required. Submit for review → Approve with the reviewer and date → Publish with the effective date.
8. **Governing law / operator** (only with verified facts): if California law should govern, prepare a new Terms version stating it, have it reviewed, publish it, then confirm "Governing law" in Admin → Legal → Legal notices. If an operator (the founder personally or a registered entity) is to be named, enter and confirm it there; never describe Twigo as a registered entity unless registration is verified.

Nothing in this report means that any document is published in production, or that any text is legally adequate.
