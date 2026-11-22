# Stage 0 Report — Project Preservation

Date: 22 November 2026. Plan: `docs/CORRECTIVE-IMPLEMENTATION-PLAN.md`, section 4. Finding covered: **P1-10** (no version control).

**Result: complete.** No product code, page, business rule or real data was changed. Stage 1 has not started.

## 1. What was done

| Step | Result | Evidence |
|---|---|---|
| Local Git repository on branch `main` | Created | `git log` shows commit `0252d44` |
| Baseline commit of the project exactly as audited | 370 files, about 44,500 lines | Tag `audit-baseline-2026-11-22` |
| Exclusions extended | Secrets, database files, backups, exports, keys, uploaded files, captured test email | `.gitignore` |
| Line endings kept stable | LF everywhere, images marked binary | `.gitattributes` |
| Secret scan before committing | No hit | The values of `AUTH_SECRET`, `ENCRYPTION_KEY` and the admin password were searched for in all 370 files, plus common key patterns and personal email addresses: none found |
| Fresh backup of the development database | 46 tables, 238 rows | `backups/cowork-20261122-194847-stage0-baseline.cwbak.gz` |
| Restore test | Passed | Restored into a separate check database; every table verified by the restore tool, then compared again independently: 46 tables, 238 rows, 0 tables differ. The check database was removed afterwards |
| One-file copy of the code with full history | Created and verified | `backups/cowork-code-audit-baseline-2026-11-22.bundle` (19 MB) |
| Proof that the commit is complete | Passed | The bundle was cloned into a separate folder and installed from scratch there: type check 0 errors, lint 0 errors, 134 tests passed (the 12 audit probes are skipped by design) |
| Rollback procedures written | Done | `docs/DEPLOYMENT.md`, section 11 |

## 2. Two mistakes caught before the first commit

The dry run showed that two of the new exclusion rules were hiding real source files:

- The rule for SQL exports (`*.sql`) also excluded the five database migration files.
- The existing rule `backups/` also excluded the admin Backups page, because its folder has the same name.

Both were corrected before anything was committed (migrations are explicitly kept; folder rules now apply only at the top of the project). A final comparison confirmed that every file under `src`, `scripts`, `tests`, `prisma`, `public` and `docs` is tracked. The check that catches this is now written into the deployment guide.

## 3. What is not tracked, on purpose

`.env`, `.env.devadmin.local`, `.claude/settings.local.json`, the local database (`.pgdata/`), `backups/`, build folders, test output, captured test email. Only `.env.example` is tracked among the settings files.

Uploaded files: no `storage/` folder exists yet in development, so there was nothing to copy.

Note: `scripts/demo-config.ts` and the test files contain a demo password and a demo authenticator secret. These belong to fictional demo and test accounts only and are needed to run the demo and the tests, so they are tracked.

## 4. Real data

Unchanged. Row counts in the development database are the same as during the audit: 5 accounts, 4 applications, 1 idea, 1 group, 3 messages, 1 project, 1 agreement, 27 email records, 84 audit entries.

## 5. Where the safety copies are now

Everything is still on this one computer:

| Copy | Location |
|---|---|
| Code with history | `.git/` in the project, and the bundle file in `backups/` |
| Database | `backups/` (5 backup files, the newest from today) |

**This protects against mistakes, not against losing the computer or its disk.** A second location is the one open point of this stage.

## 6. Decision needed: the second location

| Option | Protects | Cost | What it involves |
|---|---|---|---|
| A. External drive or USB stick | Code and data | None | Copy three things by hand, for example weekly: the bundle file, the newest backup file, and the `.env` values in a password manager |
| B. Private repository at a hosting service | Code only | Free tier exists | Sends the source code to an outside service; needs an account |
| C. Encrypted backups in cloud storage | Data | Usually a small monthly fee | Needs a backup encryption key first (finding P2-22) |

Recommendation: A now. B and C only after explicit approval, since both use outside services.

## 7. How to go back

- One correction: `git revert <commit>` (from Stage 1 on, each finding is its own commit).
- Everything since the audit: branch from the tag `audit-baseline-2026-11-22`.
- A database change: restore the backup made just before it into a new database and point the site at it.

Details are in `docs/DEPLOYMENT.md`, section 11.

## 8. Next

Stage 1 (the 1 critical and 10 high findings) starts only after approval. Before each of its database changes (M1 and M2) a new backup will be made and restored once as a check, and approval will be asked for.
