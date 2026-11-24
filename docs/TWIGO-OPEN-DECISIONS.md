# Twigo: open decisions

Matters that could not be finalized without information from the founder (23 November 2026). Each has a
safe default that is in place now. Nothing here blocks local development or testing; items 1–6 block a
public launch.

| # | Decision required | Why it matters | Current safe default | If it stays pending | Recommended next action |
| --- | --- | --- | --- | --- | --- |
| 1 | **Who is the legal operator** (the founder personally or an entity), its name, legal form, registration number if any, and address. | Required in the Terms, the Privacy Policy and the Legal Notices; determines who members contract with and who is liable. | Nothing invented. The texts say the operator "has not yet been formally confirmed; until then, the founder runs the community." Legal Notices show "not yet confirmed". The production start refuses to run without `ORG_LEGAL_NAME`. | The site cannot launch publicly; registrations stay on review drafts. | Decide with a lawyer; enter in Admin → Legal → Legal notices and tick *confirmed*; set `ORG_LEGAL_NAME`. |
| 2 | **Jurisdiction and governing law.** | Decides which privacy, consumer, tax and contract rules apply. | Not stated anywhere; production start refuses without `ORG_JURISDICTION`. | As item 1. | Decide with the lawyer reviewing item 1. |
| 3 | **Legal review of the eight policies.** | No text may be marked Approved without a real review. | All eight are version 1, *Pending legal review*, shown with a draft notice. | Members accept drafts. After review, publish new versions with renewed acceptance. | Give [TWIGO-LEGAL-REVIEW-CHECKLIST.md](TWIGO-LEGAL-REVIEW-CHECKLIST.md) and `/legal` to a lawyer. |
| 4 | **Public contact email** and **privacy contact**. | Required by privacy law; the Contact page and emails use it. | `ORG_CONTACT_EMAIL` is empty; the site says the address is not yet published and offers the contact form. | No reply address for members or authorities. | Create a role address (for example on the twigo.space domain) and set it. |
| 5 | **Hosting provider name and server location; final email provider.** | The Privacy Policy must name every provider that processes data and any international transfer. | A VPS is set up at `162.35.23.106` (recorded in `docs/DEPLOYMENT.md`); the provider's name and the server's country are not recorded yet. The Privacy Policy (v1) still says the host is not yet chosen and names Resend as the intended email provider. | The policy cannot be published as final. | Record the VPS provider and location, sign the providers' data-processing terms, update the Privacy Policy in a new version. |
| 6 | **Production deployment to `twigo.space`.** | Not yet authorized (no deployment or DNS change has been made). | Domain changed from twigo.stream to `twigo.space` (23 Nov 2026). `SITE_URL` drives every absolute link; `.env.example` shows `https://twigo.space`. Target server `ssh shabla@162.35.23.106`. Local development uses `http://localhost:3000`. | Site stays local. | Point the DNS `A` records to `162.35.23.106`, then follow `docs/DEPLOYMENT.md` sections 0–6 with `SITE_URL=https://twigo.space` exactly. |
| 7 | **Who may receive voluntary Community Support, and how.** | Money received in Twigo's name has legal, tax and accounting consequences. | Online contributions not available; `paymentsAvailable()` is hard-coded false; the switch `SUPPORT_PAYMENTS_ENABLED` is off; no provider code exists. Owner can record entries made by other means and publish aggregate reports. | No support can be received online. | Decide the recipient and accounting with an accountant; only then commission a provider integration as separate work. |
| 8 | **Minimum age for members.** | Privacy and contract law treat minors differently. | The Terms state no age. | Ambiguity for applicants under 18. | Decide (commonly 18) and add to the Terms in the reviewed version. |
| 9 | **Earlier admin-run project module** ("Earlier project records", with OWNER-only compensation agreements). | It reflects the earlier model in which the operator ran projects; under Twigo, groups run projects themselves. | Kept for history, relabelled in the admin menu and on the page; groups use the new Projects tab. The "approve into project" action for groups still exists and is described as linking to an earlier record. | Two ways to record projects exist side by side. | Decide whether to retire it; if yes, export its records and remove the menu entry in a later change (no data is deleted now). |
| 10 | **Terminology: "project group" vs the internal name "research group".** | Consistency. | All user-facing text now says *project group*. Database tables and code identifiers keep the internal names (`ResearchGroup`, the *Research & Planning* tab) as instructed. | None for users. | None, unless the *Research & Planning* tab should also be renamed. |
| 11 | **Slogan wording.** | "Together We Innovate, Grow & Opportunity" is kept exactly as given. Grammatically, "Opportunity" is a noun among verbs. | Used exactly as given. | None. | Optional alternatives: "Together We Innovate, Grow & Create Opportunity" or "Together We Innovate, Grow & Open Opportunities" (TWIGO initials preserved by the first). |
| 12 | **Audit log retention period.** | The Privacy Policy says the audit log has no automatic deletion and that a period is pending legal review. | Kept indefinitely. | Possible conflict with storage-limitation rules. | Ask the lawyer for a period; add a retention setting. |
| 13 | **Retention settings and the Privacy Policy text are not linked.** | If the owner changes a retention setting, the published policy would state the old period. | Defaults and policy text agree today. | Risk of a stale statement after a settings change. | Either make the policy read the settings, or treat a settings change as requiring a new policy version (current procedure). |
| 14 | **Production environment values** `ORG_LEGAL_NAME`, `ORG_JURISDICTION`, `ORG_CONTACT_EMAIL` vs the new Legal Notices fields. | Two places hold similar facts. | Both exist; the production start checks the environment values; public pages use the Legal Notices. | Possible mismatch. | After item 1, enter the same values in both, or decide to drop the environment check in favour of the notices. |
| 15 | **Electronic agreement evidence for project agreements involving money.** | A checkbox and fingerprint may not be enough evidence everywhere. | Exact-text fingerprints, timestamps and downloadable copies; the copy says it does not by itself make the agreement enforceable in every jurisdiction. | Groups may rely on records a court might not accept. | Ask the lawyer (checklist item 5); if needed, add a qualified e-signature provider later. |

## Update of 23 November 2026 (founder's answers)

- **Item 1 (operator):** the operator name is **Twigo**. Legal form and registration details were not given and are not shown.
- **Item 3 (legal review):** the founder confirmed the eight documents were reviewed by a lawyer. They are published on the
  production database with `npm run legal:publish-reviewed` (reviewer and date given as arguments, recorded in the audit log).
- **Item 4 (contact):** public contact and privacy contact: **contact@twigo.space**.
- **Item 14:** the Legal Notices page now takes the operator, jurisdiction and contact from `ORG_LEGAL_NAME`,
  `ORG_JURISDICTION` and `ORG_CONTACT_EMAIL` unless the owner confirms other values in Admin → Legal → Legal notices.
- **Still open: item 2 (jurisdiction and governing law).** Required to start the site.

## Update of 24 November 2026 (legal documents resolution)

See [TWIGO-LEGAL-DOCUMENTS-RESOLUTION-REPORT.md](TWIGO-LEGAL-DOCUMENTS-RESOLUTION-REPORT.md).

- **Item 14 changed:** the Legal Notices page no longer fills "Legal operator name" from `ORG_LEGAL_NAME` (Twigo is the community's name, not a confirmed legal operator; Terms section 1) and no longer fills "Governing law" from `ORG_JURISDICTION` (Terms section 21: not yet determined). `ORG_JURISDICTION` ("Sacramento, California" in the production template, the founder's decision) is shown only as "Jurisdiction". Contacts still come from `ORG_CONTACT_EMAIL`.
- **Item 3:** the founder's statement is mapped to version 1 of each document by fingerprint; the reviewer's name and the review date were not provided and must be given at publication. Seven documents can be published; the **Privacy Policy version 1 cannot** (it says the hosting provider "will be named here before this policy is published"; it also omits Cloudflare and backups and overstates deletion and administrator access). It needs a version 2 with those facts, reviewed by counsel.
- **Item 5 still open:** hosting provider name and server location.
- **Item 2 still open as governing law:** a Terms version stating the governing law, reviewed by counsel, is needed before Legal Notices can show it.

## Update of 24 November 2026 (privacy and access control)

See [TWIGO-PRIVACY-AND-ACCESS-CONTROL-IMPLEMENTATION-REPORT.md](TWIGO-PRIVACY-AND-ACCESS-CONTROL-IMPLEMENTATION-REPORT.md).

- **Item 5 (hosting provider and location):** resolved by decision as a general disclosure in Privacy Policy version 2; the provider and location are deliberately not named. Version 2 is pending legal review.
- **New: retention of pre-deployment backups** (`~/Server/backups/twigo/`): no automatic expiry; the founder decides how long to keep them and deletes older ones by hand.
- **New: shared content after an account erasure** (ideas, comments, discussions, chat): the owner decides per request; research notes, tasks, decisions and files are always kept without the name.

