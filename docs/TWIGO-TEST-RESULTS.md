# Twigo: test results

All results below come from runs on this computer on 23 November 2026, against isolated test databases
(`cowork_test`, `cowork_e2e`, `cowork_demo`, `cowork_walk_demo`) with fictional accounts and a local test
mail catcher. No real customer data, no real email and no payment was involved. No test was skipped,
disabled or weakened to make a run pass; where an expectation was changed, the reason is given below.

## Summary

| Check | Command | Result |
| --- | --- | --- |
| TypeScript | `npx tsc --noEmit -p .` | **Passed** (0 errors), including the test files |
| ESLint | `npx eslint . --quiet` | **Passed** (0 errors) |
| Unit and integration tests | `npx vitest run` | **396 passed, 0 failed, 0 skipped** (32 files; 348 before this work + 48 new) |
| Production build | `next build` (run by the browser suite and by the performance script) | **Passed** |
| Browser tests (Microsoft Edge, production build) | `npx playwright test` | **23 passed, 0 failed, 0 skipped** (21 before + 2 new); see the last row for the final run |
| Role walkthrough (browser, 5 roles) | `bash scripts/audit/walkthrough-run.sh docs/twigo-screenshots` | **61 of 61 steps passed**; 40 screenshots |
| Database migration | backup → restore → apply → compare (section 4) | **Passed**: 0 differences in existing data |
| Accessibility (axe, WCAG 2 A/AA, serious and critical) | inside the browser tests | **0 issues** on every page checked (section 5) |
| Phone layout (375 px) | inside the browser tests | **No horizontal overflow** on all 19 public pages; phone menu works |
| Dependency audit | `npm audit --omit=dev` | 4 high advisories, **unchanged** since Stages 3 and 4 (section 6) |
| Final browser run after the last two page edits | `npx playwright test` | **23 passed, 0 failed, 0 skipped** (fresh production build of the final code) |

## 1. New automated tests

| File | Tests | What it proves |
| --- | --- | --- |
| `tests/twigo-revenue-model.test.ts` | 12 | The twelve revenue-model checks of instruction 12.2, numbered 1–12 (no fee, no investment, no automatic deduction, no commission calculated anywhere, different compensation arrangements recorded, acceptance required, unauthorized members cannot change agreements, history preserved, support gives no privileges, support never deducted, payments disabled, no fake financial or tax claims in any public text) |
| `tests/twigo-legal.test.ts` | 15 | Versions and fingerprints; no placeholders; state order; approval needs a reviewer statement and the "a lawyer reviewed it" box; registration records three separate records with version, fingerprint and time; any missing consent stops registration; a stale form cannot accept a newer text; renewed acceptance after a material change (redirect to `/legal/review`, record, release); earlier versions readable, drafts never; accepted versions cannot return to draft; audit log entries; only the owner manages documents and notices; notices private until confirmed |
| `tests/twigo-projects.test.ts` | 12 | Who can create and edit; required items before acceptance; fingerprint-bound acceptance; in force only when everyone accepted; decline recorded; changes create new versions while the old one stays in force unchanged; no edit in place; activation rules and legal-review flag; withdrawal forfeits nothing and notifies; downloads for group members only, never drafts, not for non-owner administrators |
| `tests/twigo-support-privacy.test.ts` | 9 | Published support totals frozen and without names; audit without amounts; invalid amounts refused; owner only; privacy request from member to answer, audited, included in the data export; limit of open requests; administrators refused; idea visibility acknowledgment and new fields; supporting records the Group Participation acknowledgment |

## 2. Existing tests changed, and why

| Test | Change | Reason |
| --- | --- | --- |
| `community.test.ts`, `corrective-stage3b.test.ts`, `corrective-chat.test.ts` | Expected wording "research group" → "project group", "the organization" → "the administrators" / "An administrator" | Deliberate Stage 9 wording change; the behaviour checked is the same |
| `corrective-admin.test.ts` (P2-17) | Menu: 12 → 15 entries with the new labels | Three Twigo sections added; the twelve earlier entries are all still present |
| `unit.test.ts`, `onboarding.test.ts`, `email.test.ts`, `corrective-stage3c.test.ts`, `integration.test.ts`, `corrective-stage2-unit.test.ts` | Consent flags, FAQ questions, hero text, launch checklist, no-commission wording (changed in Stages 1–4) | Content and sign-up form changed on purpose |
| Browser tests A, A2, E, 5, 9–13, 28, public pages | Three sign-up checkboxes; idea acknowledgment checkbox; "project group" wording; footer link names; heading "Earlier project records"; new public pages added to the accessibility and phone checks | Deliberate interface changes |

## 3. Failures found during testing, and what was done

Every failure was investigated. Real defects were fixed in the product; wording expectations were updated
only where the wording changed on purpose.

| Found by | Problem | Kind | Fix |
| --- | --- | --- | --- |
| Full test run after Stage 9 | 6 tests expected the old wording / menu size | Expected (deliberate change) | Expectations updated (section 2) |
| New revenue-model tests | 3 failures: the scans matched "No fees, no commission:" (a sentence), the `community-support` document key, and "Guaranteed income" inside the crossed-out "What we do not promise" list | False positives in the test's own patterns | Patterns narrowed; the product text was correct |
| New support test | Used the field name `ideaId`; the form uses `id` | Test mistake | Test fixed |
| Production build | 17 type errors in the new legal test (a result type not narrowed) | Test mistake | Helper added |
| Legal test design | Publishing version 2 left version 1 marked "pending review" next to the published one | **Product defect** | Publishing now supersedes every earlier shown version (`src/server/legal.ts`) |
| New browser test 29 | The confirmation after "Ask the participants to accept" (and after accepting) was never shown: the form that would show it disappears from the page | **Product defect** | Project actions now return to the project page with the message at the top |
| New browser test 29 (screenshot) | After saving, the two dropdowns of the agreement editor jumped back to their first defaults; saving again could silently reset the contracting arrangement | **Product defect** | The editor is rebuilt from the stored version after each change |
| Performance measurement | Admin overview went from 13 to 39 database queries, the join page from 0 to 9 | **Product defect** (efficiency) | Legal documents read in one query: 16 and 2 queries |
| Visual review | Community sidebar, help and welcome page still linked "Community rules" (old address, redirected) | Wording | Now "Community Guidelines" at `/legal/community-guidelines` |

## 4. Database migration test

1. Backup of the development database `cowork`: `backups/cowork-20261123-061909-pre-m5-twigo.cwbak.gz`
   (47 tables, 279 rows, verified when written).
2. Restored into the separate database `cowork_m5_rehearsal` with all migrations, including the new one.
3. Applied the migration to `cowork` (`npm run db:deploy`: "applied 20261123120000_twigo_platform").
4. Compared every table (`npx tsx scripts/audit/table-counts.ts cowork cowork_m5_rehearsal`):
   both 10 migrations, 56 tables, 279 rows, **no differences**. The 9 new tables are empty.

The test databases receive the migration automatically at the start of each run, which exercises it on an
empty database too.

## 5. Accessibility and phone layout

The browser tests run axe (WCAG 2 A and AA; a serious or critical issue fails the test) on:

- 19 public pages: `/`, how it works, about, pay & fairness, participation, founding contributors, FAQ,
  contact, work with us, `/support`, `/legal`, `/legal/terms`, `/legal/privacy`,
  `/legal/community-guidelines`, `/legal/notices`, join, login, forgot password, verify email;
- member pages: help, explore groups, the group's Projects tab, the project agreement page,
  `/account/agreements`, `/account/data`; earlier pages from the existing tests;
- owner pages: `/admin/legal`, `/admin/legal/terms`, `/admin/legal/notices`, `/admin/legal/acceptances`,
  `/admin/agreements`, `/admin/support`, `/admin/privacy-requests`, `/admin/audit`.

Result: no serious or critical issue on any of them. All 19 public pages fit a 375 px wide screen without
sideways scrolling. Not covered automatically: screen-reader listening tests and colour contrast of
screenshots (axe checks contrast in the page itself).

## 6. Security checks

- Automated: owner-only permissions for legal, support and privacy requests (refused for administrators);
  agreement downloads refused to outsiders, signed-out visitors and non-owner administrators; drafts never
  downloadable; no administrator code path writes agreements; no payment library installed and none
  imported; acceptance bound to the text fingerprint; existing CSRF, upload-origin, rate-limit and
  session tests all still pass.
- `npm audit --omit=dev`: 4 high advisories in `deepmerge-ts` and `effect`, used only by Prisma's
  command-line tool when it reads its configuration; they are not part of the running website. Same as in
  Stages 3 and 4. The only automatic fix is a breaking downgrade of Prisma and was not applied.

## 7. Role walkthrough (browser)

61 steps across Visitor, Applicant, Member, Group, Administrator and Owner, on a freshly seeded throw-away
database; results in `docs/twigo-screenshots/walkthrough-results.md`. New Twigo steps: policies shown as
drafts awaiting review with no placeholders; Legal Notices "Not yet confirmed"; Community Support with
"Online contributions are not available" and no invented report; a full group project (draft, both
participants accept, work starts); owner legal pages, agreements list and download, support records;
administrators refused on the three new owner-only pages. The runner's final exit code was 1 because of
its last cleanup command (stopping an already closed port), after all 61 steps had passed and the owner's
backup had been restored and verified.

The walkthrough ran before the last two small page edits (community link wording; the agreement editor
collapsed while an agreement is in force); those are covered by the final browser run.

## 8. Known limitations

- Email was tested only against the local mail catcher; no real provider is configured.
- Performance was measured on this computer with a small demo database (`docs/performance/twigo.json`).
- Not tested: real hosting, HTTPS on `twigo.space`, the production environment check with real values.
- Legal adequacy of any text or of the acceptance records cannot be established by tests; see
  [TWIGO-LEGAL-REVIEW-CHECKLIST.md](TWIGO-LEGAL-REVIEW-CHECKLIST.md).
