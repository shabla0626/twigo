# Twigo: legal review checklist

Prepared 23 November 2026 for the founder and for the lawyer, accountant or tax adviser who will review Twigo
before launch. **Nothing in the application has been reviewed by a lawyer.** Every policy is stored as
version 1 with the status *Pending legal review*; none is *Approved* or *Published*. Public pages show the
drafts with a notice saying so.

How to read this list:

- **Technical control (implemented):** what the software does today. Verified by automated tests unless
  stated otherwise (see [TWIGO-TEST-RESULTS.md](TWIGO-TEST-RESULTS.md)).
- **Legal question (not verified):** what a qualified professional in the relevant jurisdiction must
  answer. The software cannot answer these, and the documents do not claim to.

Where to review the texts: in the browser at `/legal` (each document, its version and fingerprint), or in
the source at `src/content/legal/` (`terms.ts`, `privacy.ts`, `policies.ts`). The owner changes them in
**Admin → Legal**: start a new version, edit, send for review, mark approved (only with a statement of who
reviewed it), publish.

---

## 1. Legal operator identity

| | |
| --- | --- |
| Technical control | The operator's name is read from Admin → Legal → Legal notices and is shown publicly only when marked *confirmed*. Nothing is confirmed. The policies refer to "the person or organization operating Twigo" and say that the operator's identity will be stated in the Legal Notices. A production start is refused while `ORG_LEGAL_NAME` is empty. |
| Legal question | Who is legally responsible for the site: the founder as an individual, or an entity? What name must be displayed, and where (some jurisdictions require an imprint or "about the operator" page)? |
| Evidence | `src/server/legal-notices.ts`, `/legal/notices`, `src/lib/env-schema.ts` (`startupProblems`). |

## 2. Operating jurisdiction and governing law

| | |
| --- | --- |
| Technical control | No jurisdiction or governing law is stated anywhere. The Terms say these will be stated in the Legal Notices before the Terms are published. `ORG_JURISDICTION` is empty and the production start is refused until it is set. |
| Legal question | Where is the operator established? Which law governs the Terms? Which consumer-protection rules apply to members in other countries and cannot be excluded by a choice of law? |

## 3. Legal entity status

| | |
| --- | --- |
| Technical control | The site never says Twigo is a company, cooperative, nonprofit, charity or any other legal entity (automated test "12. no fake financial or tax claims" scans all public text for such claims). The README and reports describe Twigo as a community and a platform. |
| Legal question | Should an entity be formed before launch? Does operating without one create personal liability for the founder? Does the word "community" or "cooperation" in the description have any regulated meaning where Twigo operates? |

## 4. Privacy requirements

| | |
| --- | --- |
| Technical control | Privacy Policy with a data inventory written from the actual code (`src/content/legal/privacy.ts`): account, application, profile, community content, group chat and files, meeting links (Google Meet, nothing recorded), email delivery, security logs, legal acceptance records, project agreements, privacy requests. Retention periods stated are the default values the software actually applies (Admin → Settings, `src/config/org-settings.ts`); where nothing is deleted automatically (chat, the audit log) the policy says so. If the owner changes a retention setting, the policy text must be updated in a new version: the two are not linked automatically. Providers not yet chosen (hosting, final email provider) are named as not chosen instead of omitted. Registration: the Privacy Policy is an **acknowledgment**, recorded separately from the acceptance of the Terms and of the Guidelines; nothing is bundled. Members can download their data (now including acceptances, project agreements and privacy requests) and send privacy requests (access, correction, deletion, consent withdrawal, objection) from **Account → Your data**; the owner answers them in **Admin → Privacy & data → Privacy requests**, and every step is in the audit log. Only two strictly necessary cookies are used; no analytics or tracking. |
| Legal question | Which privacy law applies (for example GDPR/UK GDPR, CCPA/CPRA, PIPEDA, other national laws)? What is the lawful basis for each use? Are a data-processing agreement with each provider, a records-of-processing document, a representative or a data-protection officer required? What response time applies to requests (the software records dates but does not enforce a deadline)? Are the retention periods appropriate? Is international transfer covered once the host is chosen? Is a cookie banner needed for strictly necessary cookies only (the current design assumes not)? Minimum age: the Terms currently state none; decide one and add it. |

## 5. Electronic agreement requirements

| | |
| --- | --- |
| Technical control | For every acceptance or acknowledgment the system stores: the person, the document, the exact version number, the SHA-256 fingerprint of the exact text, the time, the method (registration, activation, renewed acceptance, idea support, group join) and context. Records are never edited. A form that showed an older version cannot record acceptance of a newer one. Earlier versions stay readable at `/legal/<document>/v/<n>`. Renewed acceptance: when a published new version is marked "material change, ask everyone to accept again", members are taken to `/legal/review` before they can continue. Project agreements: each participant accepts the exact text by its fingerprint; a downloadable copy contains the text, the fingerprint and every acceptance time. |
| Legal question | Is a checkbox plus a stored record sufficient evidence of agreement in the applicable jurisdictions, or are stronger signatures needed for some agreements (in particular project agreements involving money)? Must a copy be emailed to the person? Are there consumer cooling-off or information duties? Note: registrations made now record acceptance of the *pending-review* drafts. After review, publish the reviewed versions with "ask everyone to accept again" so every member accepts the reviewed text. |

## 6. Project group legal status

| | |
| --- | --- |
| Technical control | A project group is described as a voluntary collaboration space, not an entity. The Group Participation Agreement (acknowledged when supporting an idea or joining a group) creates no financial obligation. Every project agreement states, in text participants cannot remove, that it "does not by itself create a company or partnership, and naming a coordinator does not by itself make that person the legal representative of the others." |
| Legal question | Can a group of people who share revenue be treated by law as a partnership, joint venture or unincorporated association regardless of what the agreement says? If so, what liabilities follow for each participant? |

## 7. Partnership and joint-venture risks

| | |
| --- | --- |
| Technical control | Each project records its contracting model: one representative contracts and receives payment, each participant contracts directly, a separate entity, or another documented arrangement. A project cannot be marked commercially active while the model is "not decided" or no payment recipient is recorded, or while the group has marked that a legal or tax review is needed and not recorded its outcome. |
| Legal question | For each contracting model: who is liable to the customer, who bears tax on receipts, what happens if the representative does not pass on shares? Should Twigo recommend or require a particular model? Should a template customer contract exist? |

## 8. Worker classification

| | |
| --- | --- |
| Technical control | Twigo does not employ members, does not set or pay compensation and takes no share. Participants decide roles and compensation in writing among themselves. The Participation & Compensation Policy says participation is voluntary, members can keep their jobs, and there is no guaranteed income. |
| Legal question | Could a participant be regarded as an employee or worker of the coordinator, the representative, the group or Twigo? Does a fixed payment arrangement change that? Are there minimum-wage or social-security consequences? |

## 9. Tax treatment

| | |
| --- | --- |
| Technical control | The agreement editor has separate fields for gross receipts, taxes and mandatory deductions, refunds and chargebacks, approved expenses, net distributable revenue and each person's compensation. No figure, percentage or tax rate is preset or calculated; participants write them. The texts tell participants that their taxes are their own responsibility and that a tax review may be needed. No tax advice or tax status is claimed. |
| Legal question | How is project income taxed for each contracting model? Who must issue invoices, collect VAT/sales tax, or report payments to tax authorities? Is any withholding required when a representative pays others? |

## 10. Payment and voluntary support treatment

| | |
| --- | --- |
| Technical control | Twigo does not collect, hold or distribute project money; there is no payment code at all (no Stripe, PayPal, crypto, bank transfer; automated test checks the dependencies). Community Support: a public page and policy, private owner records, published aggregate reports. Online contributions are **not available**: `paymentsAvailable()` always returns false, and the `SUPPORT_PAYMENTS_ENABLED` switch (off) cannot enable anything on its own. Support gives no rights, votes, visibility or priority, is never linked to projects and is never deducted (automated tests 9–11). The site says contributions are not described as tax-deductible and that no receipts are issued. |
| Legal question | Who may legally receive voluntary contributions (the founder personally or an entity)? Are they gifts, income, or donations under local law? Are there fundraising, consumer or anti-money-laundering rules? What accounting and reporting are required? Only after these answers should a provider be integrated. |

## 11. Intellectual property

| | |
| --- | --- |
| Technical control | IP Policy (8 principles): members keep what they bring and create; ideas posted are visible to members and not confidential; posting grants only the licence needed to display the content; nothing is transferred to Twigo; ownership of project results is agreed in each project agreement (a required item). Before publishing an idea, the author must confirm they understand who can see it and that it is not confidential (enforced on the server). Reports can be filed for IP infringement. |
| Legal question | Are the licence terms adequate? Is "ideas are not confidential" enough to limit disputes between members over similar ideas? Is a notice-and-takedown procedure required (for example DMCA in the US) and who is the designated agent? |

## 12. Governing law and dispute resolution

| | |
| --- | --- |
| Technical control | Disputes between participants: each project agreement must name a dispute-resolution procedure before acceptance can be requested. Withdrawal never automatically forfeits earned compensation; administrators cannot redistribute revenue (no admin action writes project agreements; automated test 7). Community disputes and appeals are covered by the Community Guidelines. Governing law and the forum for disputes with the operator are **not stated** (pending item 2). |
| Legal question | Which law and courts apply to disputes with the operator? Is mediation or arbitration appropriate and enforceable for consumers? What limitation of liability is permitted? |

---

## Documents awaiting review

| Document | Path | Status | Accepted at registration |
| --- | --- | --- | --- |
| Terms of Use (22 sections) | `/legal/terms` | Pending legal review, v1 | Accepted (separate checkbox) |
| Privacy Policy | `/legal/privacy` | Pending legal review, v1 | Acknowledged (separate checkbox) |
| Community Guidelines | `/legal/community-guidelines` | Pending legal review, v1 | Accepted (separate checkbox) |
| Intellectual Property Policy | `/legal/intellectual-property` | Pending legal review, v1 | — |
| Participation and Compensation Policy | `/legal/participation-compensation` | Pending legal review, v1 | — |
| Group Participation Agreement | `/legal/group-participation` | Pending legal review, v1 | When supporting an idea or joining a group |
| Cookie Policy | `/legal/cookies` | Pending legal review, v1 | — |
| Community Support Policy | `/legal/community-support` | Pending legal review, v1 | — |
| Legal Notices | `/legal/notices` | No field confirmed; shows "not yet confirmed" | — |
| Project agreement template | generated per project | Not a standing document; see items 5–9 | Each participant, per version |

## After the review

1. Enter and confirm the Legal Notices (Admin → Legal → Legal notices).
2. For each document: start a new version, apply the lawyer's changes, send for review, mark approved
   with the reviewer's name and date (the form requires it), publish with an effective date. Tick "ask
   everyone to accept again" for the Terms, Guidelines and Privacy Policy so existing members accept the
   reviewed text.
3. Set `ORG_LEGAL_NAME`, `ORG_JURISDICTION` and `ORG_CONTACT_EMAIL` in the production environment (the
   production start checks them).
