# One-command deployment: implementation and verification report

23 November 2026. Deliverables:

| File | Purpose |
| --- | --- |
| `scripts/deploy/deploy-twigo.sh` (copied to `release/deploy-twigo.sh`) | The deployment script; upload it next to the archive |
| `release/<tag>.tar.gz` + `.sha256` + `release-manifest.json` | Release package, built by `scripts/deploy/new-release.ps1` (current tag in `docs/TWIGO-RELEASE-REPORT.md`, section 7; rc3 superseded) |
| `deploy-twigo.ps1` | One-click launcher from Windows (section "One-click deployment from Windows" below) |
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

## One-click deployment from Windows (added later on 23 November 2026)

| File | Purpose |
| --- | --- |
| `deploy-twigo.ps1` (project root) | The launcher: `cd D:\MyProject\Co_work` then `.\deploy-twigo.ps1` |
| `scripts/deploy/new-release.ps1` | Builds a release from a git tag and writes `release/release-manifest.json` last |
| `release/release-manifest.json` | Names the exact archive, its checksum file and the matching `deploy-twigo.sh`, each with its SHA-256 |
| `scripts/deploy/test-launcher.ps1`, `test-launcher-server.sh`, `test-sshd/` | Isolated launcher tests: a throw-away SSH server in Docker (WSL), real Windows OpenSSH |
| `tests/launcher-config.test.ts` | Static rules: ASCII only, no host-key override, no stored secret, exactly three uploaded files, step names and exit codes match the server script |
| `docs/ONE-CLICK-DEPLOYMENT.md` | Founder guide: run, what happens, reading the result, SSH sign-in problems, what stays manual |

Design decisions:

- **Release identification:** the launcher never chooses an archive by name or date. It deploys what the
  manifest names, after checking:
  - every SHA-256 and the archive size;
  - that the `.sha256` file names the same archive and hash;
  - that the archive reads to the end;
  - that the `deploy-twigo.sh` next to it is byte-identical to the one inside the archive.

  It refuses a release that is older than the committed code in this folder (changes outside `docs/`
  and `tests/`) or older than the release running on the server. `-AllowOlderRelease` overrides both
  on purpose.
- **Reuse, not a second implementation:** the server side is the tested `deploy-twigo.sh`, run as
  `TWIGO_ARCHIVE=<exact archive> bash ~/Server/deploy-twigo.sh`. The launcher adds only:
  - the upload check (`sha256sum -c`) and the move into `~/Server`;
  - a health check after a successful run.
- **SSH:** Windows OpenSSH with the user's own configuration.
  - No `StrictHostKeyChecking`, `UserKnownHostsFile` or `BatchMode` override, no `-i`, no stored
    password.
  - OpenSSH asks for a password or passphrase itself.
  - Three connections: check, upload, deployment. A fourth one checks health after a failure.
- **Upload:** exactly `deploy-twigo.sh`, `<release>.tar.gz` and `<release>.tar.gz.sha256` go to
  `~/Server/.twigo-upload/`. They are moved into place only after verification and only when no other
  deployment holds the lock, so a running deployment never has its files replaced.
- **Exit codes:** the launcher returns the server script's exit code unchanged. The server script now
  returns 10 + step number on failure, 30 when another deployment runs (flock), and 129/130/141/143
  when interrupted. On HUP (closed SSH session) it writes to its log only, stops and puts the previous
  version back. Its clean-up can no longer be cut short by a failing command or a second signal.

### Launcher tests

`powershell -NoProfile -ExecutionPolicy Bypass -File scripts\deploy\test-launcher.ps1` on Windows 11,
PowerShell 5.1, OpenSSH_for_Windows 9.5p2. The test server runs Ubuntu 24.04 with OpenSSH 9.6 in Docker
29.7.2 under WSL 2. It has its own keys, `known_hosts` and settings file with generated secrets, and the
Compose project `twigolaunchtest`. Final run: **28 passed, 0 failed** (407 s, including a real 340 s
deployment).

| # | Scenario | Result |
| --- | --- | --- |
| 1 | Missing manifest: stops before connecting (exit 2) | pass |
| 2 | Missing archive: stops before connecting (exit 2) | pass |
| 3 | Missing `.sha256` file: stops (exit 2) | pass |
| 4 | Incorrect checksum file: stops (exit 2) | pass |
| 5 | Damaged archive (one byte changed): stops (exit 2) | pass |
| 6 | Archive integrity (consistent hashes, unreadable archive): stops (exit 2) | pass |
| 7 | Archive containing `.env.production`: refused, nothing sent (exit 2) | pass |
| 8 | Archive containing backups: refused (exit 2) | pass |
| 9 | Deploy script not the one inside the archive: refused (exit 2) | pass |
| 10 | Deploy script with Windows line endings: refused (exit 2) | pass |
| 11 | Release older than this folder's code: refused (exit 2); allowed only with `-AllowOlderRelease` | pass |
| 12 | Valid release: `-CheckOnly` passes and shows the release version | pass |
| 13 | Missing SSH connection: exit 4, stage shown | pass |
| 14 | Authentication failure: exit 5, OpenSSH's reason shown | pass |
| 15 | Changed host key: refused by OpenSSH (verification stays on), exit 6, nothing uploaded | pass |
| 16 | SCP failure (server without SFTP): exit 8, nothing deployed | pass |
| 17 | Another deployment running: exit 30, nothing uploaded | pass |
| 18 | Successful upload: the three files arrive, verify on the server (`sha256sum -c`) and are moved into place | pass |
| 19 | Remote failure: exit code 14 passed through, failed stage named, exact archive passed to the server script | pass |
| 20 | No success reported after a failure | pass |
| 21 | Server script reports success but `/api/health` fails: exit 9, not reported as success | pass |
| 22 | Release older than the one running on the server: refused before the upload (exit 2) | pass |
| 23 | Real server script fails at step 3 (empty `ORG_JURISDICTION`): exit 13, stage named, settings file untouched | pass |
| 24 | Successful remote execution: real deployment, exit 0, live output streamed, app healthy on 127.0.0.1:1010 | pass |
| 25 | The deployed release is exactly the one in the manifest | pass |
| 26 | No secrets uploaded: settings file unchanged, no other `.env` or secret file on the server, upload folder empty | pass |
| 27 | No secret value in any launcher output or server log | pass |
| 28 | Launcher never disables host-key checking, never passes keys or passwords | pass |

Scenarios 19 and 21 use a stand-in server script that only prints and returns a chosen exit code;
scenarios 23 and 24 run the real one.

After the last launcher change (scp shows its own progress; the window waits for Enter when started
from File Explorer), the quick suite ran again: **23 of 23 passed** (every scenario above except the two
real deployments).

### Server script tests

`bash scripts/deploy/test-deploy.sh <archive of commit ac97069>` (isolated project `twigodeploytest`).
The full run (1090 s) passed **15 of 16**. The 16th, "SSH connection lost", failed because of a defect
in the test itself: its wait for step 6 matched old output, so the hang-up arrived during step 2. There
the script correctly stopped with "nothing was changed" and exit 129. After the test was fixed, that
scenario was run again on its own, after a fresh install: **pass**. The hang-up came during the build;
the previous code and image were restored and the previous version was healthy on 1010 (exit 129).

| # | Scenario | Result |
| --- | --- | --- |
| 1 | Shell syntax | pass |
| 2 | Missing archive: stops safely (exit 12 = step 2) | pass |
| 3 | Wrong checksum: stops safely (exit 12) | pass |
| 4 | Unsafe archive: refused, nothing extracted (exit 12) | pass |
| 5 | Archive containing `.env.production`: refused (exit 12) | pass |
| 6 | Missing `ORG_JURISDICTION`: stops before any change (exit 13 = step 3) | pass |
| 6b | Second deployment while one runs: refused (exit 30), nothing changed | pass |
| 7 | Fresh install: migrated, owner created, legal publication skipped, settings unchanged (600) | pass |
| 8 | Upgrade with legal publication: owner and data kept, 8 documents published, backups made | pass |
| 9 | Repeated again: no duplicate owner or legal versions | pass |
| 9b | Docker usable only through sudo: switches to sudo by itself and deploys | pass |
| 10 | Failed build: exit 16 = step 6, previous code restored, previous version serving on 1010 | pass |
| 11 | Failed start: exit 20 = step 10, previous code and image restored, previous version healthy | pass |
| 11b | SSH connection lost during the build (HUP): exit 129, previous version restored and healthy | pass (re-run after the test fix) |
| 12 | No secret value in any deployment log | pass |
| 13 | Data volumes still exist after all runs | pass |

Defects found by these tests and fixed:

1. When `df` could not see Docker's data folder (a Docker daemon outside the current file system, as in
   the test container), the disk-space check failed and the server script stopped with only "STOPPED".
   The check now falls back to the root file system as intended.
2. Any unexpected failing command in the server script used to stop it without saying why. It now
   prints an `ERROR:` line with the step, line number and exit code.
3. In the tests themselves:
   - WSL stops Docker a few seconds after its last `wsl.exe` process ends, so the test server vanished
     mid-run. A keep-alive process now holds WSL open.
   - A killed `flock` left its child holding the lock; `flock -o` now.
   - The lost-connection test read `[6/10]` as a regular expression and looked at old output. It now
     waits for the fixed text in a fresh output file.

Not testable here:

- **Typed passwords or key passphrases.** The tests use a key without passphrase. Prompts are excluded
  by the test-only SSH configuration (`BatchMode`), so no person typed into a prompt.
- **A real terminal** (`ssh -t` from an interactive window). The tests run without one, so the server
  script ran unattended (`TWIGO_ASSUME_NO=1`, owner from the environment). A closed connection (HUP)
  was tested on the server script directly.
- **The real VPS**, its central Caddy, Cloudflare and Resend: the first run there is the founder's.
