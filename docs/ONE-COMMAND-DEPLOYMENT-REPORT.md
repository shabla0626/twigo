# One-command deployment: implementation and verification report

23 November 2026. Deliverables:

| File | Purpose |
| --- | --- |
| `scripts/deploy/deploy-twigo.sh` (copied to `release/deploy-twigo.sh`) | The deployment script; upload it next to the archive |
| `release/twigo-rc3-2026-11-23.tar.gz` + `.sha256` | Release archive (`git archive` of tag `twigo-rc3-2026-11-23`) and checksum |
| `scripts/deploy/test-deploy.sh` | Isolated test suite for the script |
| `docs/ONE-COMMAND-DEPLOYMENT.md` | Founder guide |
| `docs/DEPLOYMENT.md` | Points to the one command; the individual steps stay for reference |

## What the script uses (inspected, not invented)

| Need | Actual implementation used |
| --- | --- |
| Compose project and volumes | `docker-compose.yml` `name: twigo` → volumes `twigo_twigo-postgres`, `twigo_twigo-data`; services `app` (image `twigo-app`), `db` (postgres:16-alpine, user/database `twigo`) |
| Settings | `.env.production` next to `docker-compose.yml` (`--env-file`, `env_file`, BuildKit secret `envfile`); required values from `src/lib/env-schema.ts` `startupProblems()` |
| Migrations | `npm run db:deploy` (`scripts/migrate.ts`, Prisma migration history in `_prisma_migrations`) |
| Owner | `npm run admin:create -- --email … --name … --role OWNER` (`scripts/create-admin.ts`; hidden prompt or `ADMIN_PASSWORD`); the production start refuses test addresses (`src/ops/launch-checks.ts`) |
| Legal publication | `npm run legal:publish-reviewed -- --owner … --reviewed-by … --reviewed-on … --effective …` (`src/ops/legal-publish.ts`, exact-text fingerprint check) |
| Backups | `npm run db:backup` (`scripts/backup.ts`, encrypted with `BACKUP_ENCRYPTION_KEY`, written to `/data/backups` in `twigo_twigo-data`) |
| Health | `GET /api/health` (`src/app/api/health/route.ts`: settings + database) and the container health check |
| Pages checked | `/`, `/login`, `/join`, `/legal`, `/legal/terms`, `/legal/privacy`; chat: `/socket.io/` WebSocket upgrade |

## Design decisions

- **Staging and swap:** the archive is extracted into a staging folder only after the checksum, path,
  link, secret and completeness checks. The new folder receives a byte-identical copy of
  `.env.production`, then the old folder is moved into the run's backup (`app-previous`) and the new
  one takes its place. Nothing is extracted over the live folder.
- **Rollback:** after the swap, any failure (build, migration, owner, start, verification) restores the
  previous folder and image (`twigo-app:previous-<time>`) and restarts the previous version if it was
  running. Database migrations are never undone automatically; the run's encrypted database backup and
  `docs/DEPLOYMENT.md` §8 give the verified restore path.
- **Legal gating:** publication happens only after the founder types `PUBLISH` and names the reviewer
  and dates (or sets `TWIGO_LEGAL_PUBLISH=yes` with them for unattended runs). Without that the step is
  reported as skipped, never as done, and the site shows the documents as drafts awaiting review.
- **No secrets in output:** values are read from the settings file without executing it and are only
  compared, never printed; command output goes to a private log (600, folder 700); the test suite
  greps every log for every secret.
- **Not touched:** Caddy, Cloudflare, firewall, other containers, volumes (never removed).

## Test results

`bash scripts/deploy/test-deploy.sh release/twigo-rc2-2026-11-23.tar.gz` (same application code as rc3), run
in an isolated folder with its own Compose project (`twigodeploytest`), volumes and generated secrets, on
Ubuntu 24.04 (WSL 2), Docker 29.7.2, Compose 5.5.0. Final run: **13 passed, 0 failed.**

| # | Scenario | Result |
| --- | --- | --- |
| 1 | Shell syntax (`bash -n`) | pass |
| 2 | Missing archive: stops safely, nothing changed | pass |
| 3 | Wrong checksum: stops safely | pass |
| 4 | Unsafe archive (`../` path): refused, nothing extracted | pass |
| 5 | Archive containing `.env.production`: refused | pass |
| 6 | Missing required setting (`ORG_JURISDICTION`): stops before any change, names the setting | pass |
| 7 | Fresh install: build, PostgreSQL, 10 migrations, owner created, legal publication skipped without confirmation, settings file unchanged and tightened to 600 | pass |
| 8 | Upgrade with legal publication: owner kept (1), data written between runs kept, 8 documents published, encrypted database backup + previous code + settings in the run's backup folder | pass |
| 9 | Third run: no duplicate owner, no duplicate legal versions | pass |
| 10 | Failed Docker build: stopped, previous code restored, previous version still serving on 1010 | pass |
| 11 | Failed start (health check): stopped, previous code and image restored, previous version healthy on 1010 | pass |
| 12 | No secret value (database password, keys, API key, owner password) in any log or output | pass |
| 13 | Data volumes still exist after all runs | pass |

Defects the tests found in the script (all fixed before the final run):

1. The archive rule against backups matched the app's own `src/app/admin/(panel)/backups/` folder and
   refused the real release (now only top-level `backups/`, `storage/`, `.pgdata/` and backup files).
2. `umask 077` made the release files unreadable for the unprivileged user inside the image, so
   migrations failed: this would have broken the first VPS deployment. Release files now get normal
   permissions; backups and logs are made private explicitly.
3. The WebSocket check treated curl's normal time-out on an open WebSocket as a failure.
4. After a failed fresh install the new container kept running; it is now stopped on rollback.
5. A database password that differs from the one the volume was created with now produces a clear
   explanation instead of a generic migration error.

Also verified: `npx tsc`, ESLint and the application test suites are unaffected (no application code changed).

## Not testable here

- The interactive prompts (owner email/name, hidden password, `PUBLISH` confirmation) were exercised
  through their unattended equivalents (`TWIGO_OWNER_*` + `ADMIN_PASSWORD`, `TWIGO_LEGAL_*`); the prompt
  wording was reviewed but not typed into by a person.
- The real VPS (Ubuntu with its central Caddy, Cloudflare, Resend): the first run there is the
  founder's. The tests ran on Ubuntu 24.04 (WSL 2) with Docker 29.7 and Compose 5.5.
