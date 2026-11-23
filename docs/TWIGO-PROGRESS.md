# Twigo: progress log

The live record of the Twigo transformation. It is updated after every completed stage so that work can be
resumed from the last checkpoint if it is interrupted.

> This file was created at the founder's request after all stages had already finished (23 November
> 2026). The entries below were reconstructed from the git history, the test logs and the reports of that
> day; each checkpoint names the commit it corresponds to. From now on it is updated as work happens.

## Current state

| | |
| --- | --- |
| **Status** | **All stages 0–11 complete.** No work in progress. |
| Branch | `feature/twigo-platform-transformation` (not merged into `main`, not pushed) |
| Last checkpoint | commit `adc7638`, tag `twigo-complete-2026-11-23` |
| Code backup | `backups/cowork-code-twigo-2026-11-23.bundle` (verified); the original `backups/cowork-code-pre-twigo.bundle` is untouched |
| Database | development database `cowork` has migration `20261123120000_twigo_platform`: 10 migrations, 56 tables, 279 rows |
| Last test results | 426/426 automated, 23/23 browser, 61/61 walkthrough in the Docker production build; `tsc` and ESLint clean |
| Waiting on the founder | the open decisions in [TWIGO-OPEN-DECISIONS.md](TWIGO-OPEN-DECISIONS.md), above all the legal operator, jurisdiction and a lawyer's review |
| Needed now | restart the development server on port 3000 (`npm run dev`) |

## Checkpoints

| Stage | Status | Checkpoint | Completed tasks | Tests at the checkpoint |
| --- | --- | --- | --- | --- |
| 0. Protect and audit | Done | `5cbcbda`, tag `pre-twigo-2026-11-23` (the starting point) | Branch; code bundle; verified database backup restored and compared (0 differences); search for old branding; checklist [TWIGO-CHECKLIST.md](TWIGO-CHECKLIST.md) | 348 automated, 21 browser (state before the work) |
| 1. Brand | Done | `5bc465c` | Twigo name, identity, slogan, description; `SITE_URL` for twigo.space; public pages, footer, FAQ, emails rewritten | Affected tests updated and passing; no separate full-run record kept for this commit (full runs recorded in Stage 10) |
| 2. Revenue model | Done | `5bc465c` | No fee, investment or commission wording; project-specific contracting models; data model for group projects and support (migration written, additive) | as above |
| 3. Legal documents | Done | `5bc465c` | 8 versioned documents with states and fingerprints, all *Pending legal review*; Legal Notices with per-field confirmation; `/legal` pages | as above |
| 4. Acceptance workflow | Done | `5bc465c` | Separate sign-up checkboxes; acceptance records; renewed acceptance gate; Account → Agreements | as above |
| 5. Ideas and groups | Done | `201a4f6` | New idea fields; visibility acknowledgment; Group Participation acknowledgment on support and join | type check clean; full run done in Stage 10 |
| 6. Project agreements | Done | `201a4f6` | Group Projects tab; versioned agreements accepted by every participant; activation rules; withdrawal; downloads | as above |
| 7. Community Support | Done | `201a4f6` | Public page; owner records and frozen reports; payments impossible (switch off, no provider) | as above |
| 8. Admin | Done | `201a4f6` | Legal, notices, acceptance records, project agreements, support, privacy requests; member privacy requests; export extended | as above |
| 9. Consistency | Done | `adc7638` | "project group" and "administrators" wording; old approval-model texts rewritten; README and older docs | 6 wording expectations updated, then all passed |
| 10. Testing | Done | `adc7638` | 48 new tests (incl. the 12 revenue-model checks), 2 new browser tests, walkthrough updated; migration applied to `cowork` after backup and rehearsal | 396/396, 23/23, 61/61 |
| 11. Review and reports | Done | `adc7638`, tag `twigo-complete-2026-11-23` | Visual review; [implementation report](TWIGO-IMPLEMENTATION-REPORT.md), [legal checklist](TWIGO-LEGAL-REVIEW-CHECKLIST.md), [open decisions](TWIGO-OPEN-DECISIONS.md), [test results](TWIGO-TEST-RESULTS.md) | final runs on the final code: 396/396, 23/23 |

## Problems encountered

| Stage | Problem | Resolution |
| --- | --- | --- |
| 10 | Publishing a new policy version left the older one marked as current | Fixed: publishing supersedes every earlier shown version |
| 10 | Project page confirmation messages disappeared after asking for or giving acceptance | Fixed: actions return to the page with the message at the top |
| 10 | Agreement editor dropdowns reset after saving (risk of silently resetting the contracting arrangement) | Fixed: editor rebuilt from the stored version |
| 10 | Admin overview 13 → 39 queries, join page 0 → 9 | Fixed: one query for all legal documents (16 and 2) |
| 10 | Test-side mistakes (type narrowing, a field name, over-broad text scans) | Tests corrected; product unchanged |
| 10 | Walkthrough runner ended with exit code 1 | Its final cleanup command, after all 61 steps passed and the backup restore was verified |
| 11 | Community pages still linked "Community rules" (old address) | Now "Community Guidelines" |

Details: section 3 of [TWIGO-TEST-RESULTS.md](TWIGO-TEST-RESULTS.md).

## Remaining work

Implementation work: none. What remains needs the founder or outside parties (full list with safe
defaults in [TWIGO-OPEN-DECISIONS.md](TWIGO-OPEN-DECISIONS.md)):

1. Decide the legal operator and jurisdiction; fill in and confirm the Legal Notices.
2. Lawyer's review of the eight documents; then publish with "ask everyone to accept again".
3. Contact and privacy addresses; hosting and email providers (to be named in the Privacy Policy).
4. Review and merge the branch; authorize deployment to twigo.space.
5. Decide on the earlier admin-run project module.

## How to resume after an interruption

1. `git checkout feature/twigo-platform-transformation` and `git status`. Uncommitted changes are work
   after the last checkpoint; compare them with the "Current state" table above.
2. If anything looks wrong, the last good state is the tag in "Last checkpoint"
   (`git diff twigo-complete-2026-11-23` shows what changed since). Do not reset without the founder's
   word; never delete the backups in `backups/`.
3. Database: `npx tsx scripts/audit/table-counts.ts cowork` shows the applied migrations and row counts.
   Before any new migration, take a backup (`npm run db:backup -- --label <reason>`) and rehearse on a
   restored copy.
4. Re-run the checks: `npx tsc --noEmit -p .`, `npx eslint . --quiet`, `npx vitest run`,
   `npx playwright test`.
5. Continue with the first stage not marked *Done*, and update this file when it is complete.

## Update log

| When (2026-11-23) | Update |
| --- | --- |
| after Stage 11 | File created at the founder's request; all checkpoints recorded from the git history and test logs |
| one-command deployment | `bash ~/Server/deploy-twigo.sh` (checks, backups, staged swap, build, PostgreSQL, migrations, owner, legal publication on confirmation, start, verification, rollback). Isolated test suite 13/13. Package `twigo-rc3-2026-11-23` + `release/deploy-twigo.sh`. |
| founder answers | Operator **Twigo**, contact **contact@twigo.space** (template, local `.env`, Legal Notices from settings). Legal review confirmed by the founder: one-time publication command `npm run legal:publish-reviewed` (exact reviewed texts only; tested). Jurisdiction still open. |
| release review | Independent review found 20 defects (3 high); all fixed with 17 new tests. 426/426 automated, 23/23 browser, Docker build: 61/61 walkthrough, restore verified, graceful stop. Status: **PRODUCTION RELEASE CANDIDATE — PENDING VERIFICATION**, tag `twigo-rc-2026-11-23`; see docs/TWIGO-RELEASE-REPORT.md. |
| follow-up 3 | Docker trial in WSL: image built (npm retries and cache added), 10 migrations applied in the container, Next.js listening on 0.0.0.0:1010 in the container and published on 127.0.0.1:1010; health, pages, chat WebSocket (101) verified; no secrets in the image. Trial containers left running. VPS and central Caddy still pending (no SSH access). |
| follow-up 2 | Resend SMTP integrated (key empty by design; development always uses the local test inbox), Admin → Email extended, webhook guard; Next.js on **port 1010** with Docker Compose (`127.0.0.1:1010:1010`); central Caddy **not registered** (no SSH access; specification in [TWIGO-RESEND-CADDY-INTEGRATION-REPORT.md](TWIGO-RESEND-CADDY-INTEGRATION-REPORT.md)). Tests: 409/409 unit, 23/23 browser; Docker image not built (no Docker here). |
| follow-up | Domain changed from twigo.stream to **twigo.space**; production server recorded as VPS `162.35.23.106`, SSH `shabla@162.35.23.106` (`.env.example`, `docs/DEPLOYMENT.md` section 0, README, reports). Nothing deployed, no DNS changed, no connection made to the server. |
