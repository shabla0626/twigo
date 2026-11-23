# Items requiring professional legal / accounting review

> **Superseded for Twigo** by [TWIGO-LEGAL-REVIEW-CHECKLIST.md](TWIGO-LEGAL-REVIEW-CHECKLIST.md) and [TWIGO-OPEN-DECISIONS.md](TWIGO-OPEN-DECISIONS.md). Kept for history.

The website deliberately avoids inventing legal facts. The following must be decided with
qualified professionals **before launch** and before any project work begins.

| Topic | Where it appears | What is needed |
| --- | --- | --- |
| Business entity formation | Footer, Privacy, Terms (`ORG_LEGAL_NAME`) | Choose and register an entity (or decide to operate as a sole proprietor); confirm the name to display |
| Governing law / jurisdiction | Terms §9, Privacy §1 (`ORG_JURISDICTION`) | Determine applicable law and venue |
| Participant classification | Terms §4 placeholder | Independent contractor vs. partner/member vs. other, **per country**; misclassification risk |
| Employment & contractor requirements | Not on site | Local labor law, minimum wage implications, cross-border contracting |
| Compensation & revenue-sharing agreements | Compensation page, admin compensation records | Written agreement template: scope, payment timing, partial/late customer payment, cancellation, disputes, leaving mid-project |
| Intellectual property | Terms §7 placeholder | Assignment/licensing of work product to the organization and customers |
| Confidentiality | Terms §7 | NDA terms for participants handling customer data |
| Tax reporting | Not on site | Contractor payment reporting (e.g. 1099/W-8BEN in the US, equivalents elsewhere), VAT/GST on customer invoices |
| Privacy | Privacy notice (draft, version `2026-11-draft-2`, now covering member-community data) | Legal basis, processor list (hosting, email provider, Google Meet), data subject rights process, retention periods per category (set at /admin/settings), cookie needs (only a strictly necessary session cookie) |
| Member community | `/community-rules`, `docs/legal/` | Rules, idea/research ownership, moderation and appeals, whether research groups could be seen as partnerships; see `docs/legal/open-questions.md` |
| Limitation of liability | Terms §8 placeholder | Draft clause |
| Consumer / advertising rules | All public copy | Confirm the "no guaranteed income" language satisfies local rules on earnings claims |

When the privacy notice changes materially, update `PRIVACY_NOTICE_VERSION` in
`src/lib/validation/application.ts`. Each application stores the version accepted.

Do not start actual project work until the relevant parties have agreed in writing on the
scope, responsibilities, payment terms and applicable legal arrangements.
