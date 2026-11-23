# Twigo Transformation: Implementation Checklist

Started 23 November 2026 on branch `feature/twigo-platform-transformation`. The final state of each item is in `docs/TWIGO-IMPLEMENTATION-REPORT.md`.

## Stage 0: findings before any change

- Git: clean working tree on `main` at `171546f` (tag `stage-4-complete`). Tag `pre-twigo-2026-11-23` marks this state; code bundle `backups/cowork-code-pre-twigo.bundle` (verified).
- Development database `cowork`: backup `backups/cowork-20261123-051958-pre-twigo.cwbak.gz` (47 tables, 279 rows), restored into `cowork_pretwigo_check` and compared: 0 differences.
- **"Strivanta" does not appear in the code or in public content.** The public name comes from the `ORG_NAME` setting (currently "CoWork" in the local `.env`). In the database, "Strivanta" appears only in 2 historical email recipient addresses (`EmailDelivery.to`); these records are left unchanged.
- Stored site content (`SiteContent`) and organization settings (`OrgSetting`): empty, so the code's defaults are what visitors see.
- Cookies set by the site (code search): the sign-in session cookie and a 30-minute cookie that shows the address on the "check your email" page. No analytics, no tracking, no third-party scripts (the security policy allows scripts only from the site itself).
- Outside services in the code: an SMTP email provider (Resend is the documented choice; not configured), Google Meet (links only), PostgreSQL, local file storage. No payment provider.
- Tests at the start: 348 automated tests, 21 browser tests (all passing at `stage-4-complete`).

## Checklist

| # | Item | Stage |
|---|---|---|
| 1 | Protect: branch, tag, code bundle, verified database backup | 0 |
| 2 | Brand defaults: Twigo, slogan, identity, description; `.env.example` with `https://twigo.stream`; local `.env` name | 1 |
| 3 | Public pages, metadata, emails, admin, documentation use Twigo | 1 |
| 4 | Revenue model wording everywhere: no commission, no fee, no investment, group-controlled compensation, voluntary support separate | 2 |
| 5 | Legal documents as versioned records with states (Draft, Pending Legal Review, Approved, Published, Superseded) and fingerprints | 3 |
| 6 | Terms of Use, Privacy Policy, Community Guidelines, IP Policy, Participation and Compensation Policy, Cookie Policy, Group Participation Agreement, Community Support Policy, Legal Notices | 3 |
| 7 | Registration: separate acceptance of Terms and Guidelines; separate acknowledgment of the Privacy Policy; acceptance records with version and fingerprint | 4 |
| 8 | Renewed acceptance after a material change of a published document; members can see what they accepted | 4 |
| 9 | Idea form: added fields and an explanation of visibility and intellectual property | 5 |
| 10 | Group Participation Agreement accepted when joining or supporting; governance and disputes | 5 |
| 11 | Group-led project records and versioned project agreements: participants, contracting arrangement, payment recipient, compensation method, acceptance by every participant, downloads, history | 6 |
| 12 | Community Support: public page, policy, owner-only transparency records, public aggregate reports, payments switched off | 7 |
| 13 | Admin: legal documents, acceptance records, legal notices, project agreement records (financial terms owner-only), support reporting, privacy requests | 8 |
| 14 | Consistency review of all public and member pages | 9 |
| 15 | Tests: type check, lint, automated, migrations, production build, browser, accessibility, mobile, revenue-model and legal-workflow tests | 10 |
| 16 | Browser review and the four reports | 11 |
