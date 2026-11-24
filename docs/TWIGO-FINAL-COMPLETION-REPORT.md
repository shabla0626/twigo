# Twigo: final completion report (24 November 2026)

The founder asked for Twigo to be finished, verified and packaged as a final release, with authority to
make every change in scope without further approval. This report says what was done, how it was tested
(only tests that were actually run are reported as passed), and what is left for the founder.

Nothing was deployed. Nobody connected to the VPS, the production server or its settings. No database or
Docker volume holding data was reset or deleted. The development databases were backed up before their
migration. Nothing was pushed.

## A. Summary

| Area | Result |
| --- | --- |
| Privacy Policy version 2 | Published automatically from the release approval (the founder's recorded confirmation, bound to the text's SHA-256). Text unchanged. Effective at publication. No reviewer invented. |
| Renewed acknowledgment | Existing members acknowledge v2 once; new members acknowledge v2 at sign-up. Pages, the file and agreement APIs and the live chat wait for it. Tested in real browser sessions. |
| Deletion | Administrators carry out ordinary requests; exceptions (staff account, legal hold, compensation records, open dispute) are the owner's. Fresh identity check with two-step code, typed ERASE, single run, audit, completion notice with its real delivery status. |
| Erasure ledger | Outside the database and its backups, encrypted, keyed hash chain, no personal data. A restore replays it before the database can be used, and fails when the ledger is missing, broken or older than the backup. |
| Backups | Pre-update settings snapshot and uploaded files encrypted with `BACKUP_ENCRYPTION_KEY`. No plain `.env.production` copy is kept. Pre-update copies: 30 days, the 3 most recent successful ones always kept, deletions logged. Daily database backups: 14 (unchanged). |
| Investigation chat | Pages of 100 with older/newer cursors and a date range. Every page is recorded in the audit log. No cap. |
| Security review | Independent review: 10 confirmed findings (none high). All 10 fixed and tested. Two suspected findings are documented (section I). |
| Tests | All run, all passing: 469/469 automated, 26/26 browser (Edge), Docker upgrade test 19/19, deployment script tests 17/17, launcher tests 29/29; `tsc` and ESLint clean (0 errors). Details in section J. |
| Release | `twigo-final-2026-11-24` (commit `c1bce12`), `release/twigo-final-2026-11-24.tar.gz`, SHA-256 `64acb92a3657ed2f9f61287ff3ee6b5f251c6338f91def1669c1c2ec187e7dca`, verified by extraction. rc4 and rc5 kept. |

## B. Re-audit checklist

| # | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| 1 | `legal:publish-reviewed` idempotent; release and production start apply v2 automatically | Done | `src/ops/legal-release.ts` (`ensureLegalState`), called by `server.ts` (production start), `src/server/legal.ts` and `scripts/legal-publish-reviewed.ts`; tests "Privacy Policy version 2" (3) |
| 2 | Existing members re-acknowledge v2 once, new members acknowledge v2, no API bypass | Done | page guard (`src/lib/auth/guard.ts`), `/api/files` (GET, POST), `/api/agreements/[id]`, `channelAccess` (chat); live re-check on publication; tests "renewed acknowledgment", `tests/final-realtime.test.ts`, browser test 31 |
| 3 | All 8 documents consistent | Done | 8 documents, 9 versions (Privacy v1 superseded, never published; v2 published); test "all eight documents" |
| 4 | `privacy.erase` for the right roles; exceptions go to the owner | Done | `src/lib/auth/permissions.ts` (ADMIN and OWNER); `deletionExceptions`; administrators cannot change the status of an exception request |
| 5 | Fresh identity check, 2FA, preview, typed ERASE, audit, no duplicate or concurrent run | Done | `executeDeletion`; the claim is a conditional update (`APPROVED_FOR_DELETION`, no legal hold); a lock per account against duplicate requests; browser test 33 |
| 6 | Definitive matrix, no "Your decision" entries | Done | section E; the member chooses in step 1, the choice is bound into the signed step token, the administrator has no choice to make |
| 7 | Participant-names inconsistency | Resolved | project agreement texts keep the participants' names (contractual evidence, Privacy Policy v2 sections 3 and 7). This is stated to the member and never claimed to be anonymized |
| 8 | Neutral former-member attribution | Done | "Former member" everywhere, including the chat (it used to say "Member"); the automatic chat lines naming the person say "a former member" after erasure |
| 9 | Completion notice with its real delivery status | Done | the administrator sees "handed to the email system" or "NOT sent (status)"; delivery id stored on the request; browser test 33 reads the email from the local test mail server |
| 10 | Ledger: append-only, encrypted, tamper-evident, no PII, separate from backups; restore replays it, failure fails the restore; automated test | Done | `src/ops/erasure-ledger.ts`; tests (ledger, restore with replay, missing, broken, older ledger); Docker upgrade test |
| 11 | Backup security and retention | Done | `scripts/deploy/deploy-twigo.sh`, `scripts/backup-artifact.ts`; deployment test scenarios 8, 9a |
| 12 | Investigation chat pagination | Done | `chatPage` in `src/server/admin/group-access.ts`; test with 250 messages; browser test 32 |
| 13 | Independent security review, defects fixed | Done | section I |
| 14 | Email: local SMTP path test, labeled as such | Done | section J |
| 15 | Docker: 0.0.0.0:1010 in the container, 127.0.0.1:1010 on the host | Done | section J |
| 16 | Release package, SHA-256, verified by extraction, rc4/rc5 kept | Done | section K |

## C. Privacy Policy version 2: publication and provenance

- **Text:** `src/content/legal/privacy-v2.ts`, unchanged. Fingerprint (SHA-256 of the text for the
  organization name "Twigo"): `047964c1de784fde3b3207a612cafeecff672c146eb990d460ae21ea748645b0`.
- **Release approval** (`src/content/legal/index.ts`, `releaseApproval`): the fingerprint, the date
  of the founder's confirmation (2026-11-24) and this statement, stored with the version and in the
  audit history: *"The founder confirmed on 24 November 2026 that a legal professional fully reviewed
  and approved this exact text (Privacy Policy version 2, SHA-256 047964c1…). The reviewer's identity
  was not provided and is not recorded."*
- **What happens:**
  1. When the production server starts (and on the first page that needs the documents, and in
     `npm run legal:publish-reviewed`), version 2 is added on top of exactly the release's version 1.
  2. It is then approved and published only if its stored text has exactly that fingerprint and no
     newer version exists.
  3. Version 1 becomes *Superseded* (never published). The effective date is the publication moment.
  4. `approvedById` and `publishedById` stay empty (no person is invented). The audit entries
     `legal.release_version_added`, `legal.status_approved` and `legal.status_published` carry
     `via: "release-approval"`.
  5. Running it again changes nothing. A different organization name gives a different text, so the
     version stays *Pending legal review*.
- **The deployment script's PUBLISH prompt:**
  - It is kept unchanged for the seven version-1 documents, which still need the reviewer and date
    when they are published.
  - The prompt now says that Privacy Policy v2 needs nothing there: it is published automatically
    when Twigo starts. The founder therefore does not repeat the approval.
  - The script's output shows the `release-approval` result line.
  - No other check was weakened.

## D. Renewed acknowledgment

- Version 2 asks everyone to acknowledge it again (`requiresReacceptance`).
- **Members who acknowledged version 1** are sent to `/legal/review` on their next page. Until they
  acknowledge:
  - `/api/files` and `/api/agreements/[id]` answer 403;
  - the live chat refuses every channel.
- **Members with an open chat** when such a version is published (for example by the owner in Admin,
  Legal) are removed from the chat at once. They can rejoin after acknowledging.
- **Once only:** the acknowledgment records the exact version and fingerprint. The version 1 record
  stays.
- **New members** acknowledge version 2 at sign-up.
- **Staff** are exempt, as in the admin area.
- **Browser test 31** (Microsoft Edge, separate sessions) covers all of this with a member seeded "from
  before version 2": redirect, 403, acknowledgment, 404 afterwards, and signing in again goes straight in.

## E. Deletion: who does what, and the definitive matrix

**Who:**
- **Members** request deletion in three steps: choose; read what it means; confirm their identity and
  type DELETE MY ACCOUNT. They choose whether their ideas without a group, their comments and
  discussions, and their chat messages are also removed.
- **Administrators** (the management team) review requests and carry out ordinary ones.
- **The owner** decides exceptions:
  - a staff account (its role must first be changed; staff accounts are never erased here);
  - a legal hold (owner only; nobody can carry out the deletion while it is set);
  - compensation records of earlier administrator-run projects;
  - an open dispute report.

  Administrators can neither change the status of such a request nor carry it out.

**How:**
1. Status *Approved for deletion*.
2. The person carrying it out confirmed their identity within 10 minutes (password and two-step code).
3. They type ERASE.
4. A single conditional claim (no double run, no run after a legal hold was set).
5. The erasure ledger entry is written first; if it cannot be written, nothing changes.
6. Sign-in is closed, the person leaves all groups, sessions end and live connections close.
7. One transaction anonymizes the account and applies the matrix.
8. Audit entries record every step.
9. The completion notice is sent to the confirmed address, and its real status is shown.

If a step after the ledger entry fails, the request returns to *Approved for deletion* (every step is
safe to repeat), the account stays closed for sign-in, and the failure is recorded.

| Category | Action |
| --- | --- |
| Account record | Anonymized: name "Erased account", address `erased-<id>@erased.invalid`, password and two-step settings removed, sign-in impossible |
| Sessions, sign-in links, recovery codes | Deleted |
| Profile and profile photo | Deleted (file removed from storage) |
| Application, internal participant record | Deleted. With compensation records (owner only): applications deleted, applicant anonymized, participant and compensation records kept as contractual evidence |
| Notifications, preferences, chat read markers, meeting attendance | Deleted |
| Group memberships | Ended (coordinator roles pass on) |
| Ideas without a group | The member's choice: removed, or kept without the name |
| Comments and group discussions | The member's choice: removed, or kept without the name |
| Chat messages | The member's choice: removed, or kept without the name |
| Ideas that formed a group, research notes, tasks, decisions, links, group files | Kept (shared group records), shown as by a former member |
| Automatic chat lines naming the person | The name replaced by "a former member" |
| Project agreements | Kept as evidence; the text, which names the participants, is fingerprinted and not changed (not claimed to be anonymized) |
| Records of accepted policies, privacy requests, reports filed | Kept as evidence |
| Email delivery log | Kept until the email-log retention period ends |
| Audit log | Kept (no automatic deletion) |
| Contact form messages | Not linked to the account; deleted by the regular clean-up after they are closed |
| Backups | Not changed. Daily database backups: the 14 most recent. Pre-update copies: 30 days (the 3 most recent successful ones always kept). Every erasure is re-applied from the ledger when a backup is restored |

## F. Erasure ledger and restore

**The ledger file:**
- **Location:** `LEDGER_DIR` (Docker: `/data/ledger/erasures.ledger`; folder 0700, file 0600). It is
  created empty when the server starts, so a missing file at a restore means a lost ledger.
- **Entry:** account id, request id, time, operation version and the member's choices. No name or
  address. Each entry is encrypted with AES-256-GCM (the backup format, key `BACKUP_ENCRYPTION_KEY`).
- **Chain:** each line carries an HMAC-SHA-256, keyed from the ledger key, over its number, the previous
  hash and its data. A changed, removed or reordered line breaks the chain. Without the key the chain
  cannot be recomputed (tested with a line re-hashed with plain SHA-256: refused).

**Backups and restore:**
- Every database backup records the ledger head (number and hash of the last line).
- A restore (`npm run db:restore`):
  1. creates a new database and loads and verifies it;
  2. reads the ledger;
  3. checks that it contains the recorded head unchanged;
  4. re-applies every erasure, removes the erased accounts' photo files and verifies the result;
  5. records `privacy.erasure_ledger_replayed`.
- The restore fails if the ledger is missing, does not verify, or is older than the backup. The result
  then says not to use the restored database.
- `--without-ledger` exists only for a site where no deletion was ever carried out.

**Tests:**
- An account erased after a backup does not reappear after the restore.
- A second replay changes nothing.
- Missing, broken and older ledgers fail the restore.
- The same in Docker (section J).

**Limits:**
- Lines appended after the newest backup are protected by the chain only. Cutting off the newest lines
  leaves a valid shorter chain, so that cannot be detected from the file alone. The remedy is the copies
  outside the volume: the off-site copy (`docs/DEPLOYMENT.md`, section 8) and the copy in every
  pre-update backup folder.
- If uploaded files are restored from an older archive after the database, the database restore must be
  run again (documented in `docs/DEPLOYMENT.md`, section 8).

## G. Backup security and retention

**`deploy-twigo.sh`:**
- No plain copy of `.env.production` is written to the backup folder.
- After the new image is built, a container run of that image writes `env.production.cwenc` (verified
  against the settings file's SHA-256) and `storage.tar.gz.cwenc`.
- The storage archive is encrypted while it is created (streaming, `set -o pipefail`; it is listed again
  after decryption). It never exists in plain text on disk.
- The erasure ledger is copied alongside.
- The plain settings file inside the kept previous code is removed after a successful deployment, and
  from the failed code after a rollback.

**Retention:**
- Pre-update backup folders are pruned only after a successful deployment.
- Folders older than 30 days are deleted.
- Always kept: the current folder and the 3 most recent successful ones (`DEPLOYED-OK`). The newest
  known-good is therefore never deleted.
- Each deletion is logged.
- Daily database backups stay at 14 (`BACKUP_KEEP`).

**`npm run backup:artifact`:** `encrypt`, `verify` and `decrypt`, streaming, in the database backups'
format. It refuses to run without a key of at least 16 characters and refuses empty input.

## H. Investigation chat

- Pages of 100 messages (`CHAT_PAGE_SIZE`), newest first, with *Older* and *Newer* links.
- Cursors use (time, id), so messages with the same timestamp are neither skipped nor repeated.
- Date range in UTC: from a date, inclusive; until a date, exclusive.
- Every page opened is recorded (`group_access.viewed`, with the page's cursor and range).
- When access expires or is ended, the next page is refused and the attempt is recorded.
- No 2,000-message cap.
- **Tests:**
  - integration: 250 messages walked back and forth without gaps or repeats, the date range, the audit
    entry per page, and refusal after revocation;
  - browser test 32: request, owner approval of the chat only, reading, ending access.

## I. Independent security review

A separate reviewer read the changes without the author's conclusions. Confirmed findings and fixes:

| # | Finding (severity) | Fix |
| --- | --- | --- |
| 1 | A restore passed with a missing or misplaced ledger (medium) | Missing ledger fails the restore; ledger created at start-up; head recorded in each backup and checked |
| 2 | The ledger chain was unkeyed: lines could be removed and the chain recomputed (medium) | HMAC chain keyed from the ledger key; head anchoring (1) |
| 3 | A failure after the claim left the request stuck in *Processing* with the account still usable (medium) | Sign-in closed first; on failure the request returns to *Approved for deletion*; `privacy.erasure_failed` recorded; retry is safe |
| 4 | Legal hold or role could change between the checks and the claim (low) | Claim requires `legalHold = false`; role re-checked inside the transaction; the hold can be set only while the request is not processing or finished |
| 5 | Administrators could change the status of exception requests (low–medium) | Owner only for requests with a legal hold or an exception |
| 6 | Two simultaneous deletion requests could both be created (low) | Transaction lock per account; test with two simultaneous submissions |
| 7 | A failed deployment kept a plain settings copy (low–medium) | Removed in the rollback |
| 8 | A tar failing part-way could pass as a valid archive; whole archive held in memory (low) | bash with `pipefail`, listing after decryption; streaming encryption |
| 9 | Ledger appends decrypted every line (slower with every erasure) (low) | Appends verify the chain only |
| 10 | Chats opened before a re-acceptance publication kept receiving messages (low) | Open chats re-checked on publication; test |

Suspected, documented rather than changed:
- A restored database whose ledger replay failed is kept for diagnosis. The result now says clearly not
  to use it.
- Restoring an older archive of uploaded files after the database can bring back erased accounts'
  photo files. Run the database restore again afterwards (`docs/DEPLOYMENT.md`, section 8).

Found by the new browser tests and fixed:
- The Privacy & data page did not show the outcome of a request ("Your deletion request was received").
- The automatic chat lines kept an erased member's name.
- Simultaneous first sign-ups on a fresh database could race the legal-document set-up.

## J. Tests (all run on 24 November 2026 on the development computer)

| Test | Result | What it covers |
| --- | --- | --- |
| TypeScript (`tsc --noEmit`) | Clean | whole project |
| ESLint | 0 errors (7 warnings: unused variables in three files this work did not touch) | whole project |
| Unit and integration tests (vitest, PostgreSQL) | **469/469** (41 files) | everything below, plus all earlier tests |
| New: `tests/final-completion.test.ts` | 13/13 (within the 469) | v2 release approval (published, idempotent, never over a newer or different text, 8 documents); renewed acknowledgment (page, API 403, chat refused, lifted after acknowledging, old record kept); administrator and owner rules (staff account, legal hold, compensation records, administrators cannot decide exceptions); ledger (encrypted, no names or addresses, wrong key, changed line, line re-hashed without the key); refusal when the ledger cannot be written; backup, erasure, restore with replay, second replay, broken, missing and older ledger; simultaneous deletion requests; legal hold during processing; automatic chat lines neutralized; pagination (250 messages, no gaps or repeats, date range, audit per page, refusal after revocation); encrypted artifacts (round trip, change detected, wrong key) |
| New: `tests/final-realtime.test.ts` | 1/1 (within the 469) | live Socket.IO: publication of a version to be accepted again removes members from open chats; after acknowledging they rejoin; the others receive nothing |
| Updated: `tests/privacy-access-control.test.ts`, `tests/twigo-support-privacy.test.ts` | passing (within the 469) | new rules: administrators process ordinary requests; fresh identity check required; the member's own content choice |
| Browser tests (Playwright, Microsoft Edge, production build, separate sessions per person) | **26/26** | the full journey from sign-up to project work (23 earlier tests), plus 31: v2 re-acknowledgment by a member from before v2 (redirect, API 403, acknowledgment, API 404 afterwards, once only, new members not asked); 32: temporary investigation access (member report, administrator request, owner approves chat only, reading with the page counter, files not available, accessibility check, ended early, refused afterwards, audit); 33: deletion (member request with identity check and typed phrase, Privacy & data confirmation, administrator approval and erasure with password and two-step code, completion email received, signed out everywhere, sign-in refused, chat message kept as "Former member", the name nowhere in the chat) |
| Docker upgrade test (`scripts/deploy/test-upgrade.sh`, new) | **19/19** | rc5 image built from `release/twigo-rc5-2026-11-23.tar.gz` and run on a database with a member, 8 policy records and an uploaded file; new image built from the release archive; **migration from the existing schema** on that populated database (10 → 12 migrations, nothing reset); new columns; health; **0.0.0.0:1010 inside the container**, **127.0.0.1:1010 only on the host**; **WebSocket upgrade 101** on `/socket.io`; v2 published at start-up, v1 superseded; data kept; ledger created on the old volume (700/600, nothing readable); encrypted backup; **restore of the older backup re-applies the erasure**; restore fails with a broken ledger; **clean shutdown** on SIGTERM (exit 0, `server.shutdown` logged); volumes kept |
| Deployment script tests (`scripts/deploy/test-deploy.sh`) | **17/17** | syntax; missing, wrong-checksum, unsafe and secret-containing archives refused; missing setting; lock; fresh install; upgrade with encrypted settings snapshot and uploaded files (decrypted and verified), no plain settings copy, Privacy v2 published; repeated run idempotent (8 documents, 9 versions); **retention** (folders older than 30 days deleted after success, recent successful ones kept, deletions logged); sudo; failed build, failed start and lost connection all roll back to a healthy previous version; no secret in any log; volumes kept |
| Launcher tests (`scripts/deploy/test-launcher.ps1`, local throw-away SSH server in WSL) | **29/29** | all release checks before connecting, SSH and upload failures, the real server script run over SSH, health check, exact release deployed, no secrets uploaded or printed, host-key checking never disabled |
| Email | Local SMTP path only | The browser tests send through the app's real email code to a local test mail server on 127.0.0.1 (no provider). Received and read: verification, password recovery, application decisions and the **deletion completion notice**. An outage is simulated by stopping that server. **This is not real-provider delivery:** sending through Resend was not tested here (no provider key on this computer, and nothing may be sent externally). |
| Development databases | Backed up, then migrated | `backups/cowork-20261124-184359-before-final-completion.cwbak.gz`, `backups/cowork_demo-20261124-184408-before-final-completion.cwbak.gz`; migration `20261124182522_deletion_choices_and_hold` applied to both; accounts (6 and 9), policy records and requests unchanged |

The Docker, deployment and launcher tests ran on a release built from commit `dd4622a`. The release
commit `c1bce12` differs from it only in the upgrade test script (it now migrates and creates an owner for
the previous release, as the deployment script does); the application code is identical. The final
browser run (26/26) and the full automated run (469/469) are on that application code.

## K. Release package

| | |
| --- | --- |
| Tag | `twigo-final-2026-11-24` → commit `c1bce12` (local, not pushed) |
| Built with | `scripts\deploy\new-release.ps1 -Tag twigo-final-2026-11-24` (git archive of the tag: committed files only; launcher integration kept; its `-CheckOnly` check passed without connecting) |
| Archive | `release/twigo-final-2026-11-24.tar.gz`, 45,635,997 bytes |
| SHA-256 | `64acb92a3657ed2f9f61287ff3ee6b5f251c6338f91def1669c1c2ec187e7dca` (`release/twigo-final-2026-11-24.tar.gz.sha256`; `sha256sum -c`: OK) |
| Manifest | `release/release-manifest.json` names the archive, its checksum file and `release/deploy-twigo.sh` with their SHA-256 |
| Verified by extraction | extracted into an empty folder: 676 files, the same list as the tag and byte-identical to it; no `.env` file; `release/deploy-twigo.sh` identical to the copy inside the archive, LF line endings |
| Earlier releases | `twigo-rc4-2026-11-23.tar.gz` (SHA-256 `ab3e84d4…669fa1`) and `twigo-rc5-2026-11-23.tar.gz` (`dac9bc13…ed45fa0`) unchanged. rc5's manifest and deployment script, which the new release replaces in `release/`, are kept in `release/previous/twigo-rc5-2026-11-23/` |
| Secrets | none in the repository or the archive (checked: no `.env` file, no key patterns in the changes); `release/` and `backups/` are not in git |
| Migrations | one new, additive migration (five columns with defaults on `PrivacyRequest`); applied by `prisma migrate deploy` on a populated database in the Docker upgrade test |
| Diagnostics | none left (no debug output, no test-only code paths in the application) |

## L. What is left for the founder (not done here, by instruction)

1. **Deploy** `twigo-final-2026-11-24` with `.\deploy-twigo.ps1` ([ONE-CLICK-DEPLOYMENT.md](ONE-CLICK-DEPLOYMENT.md)). At the
   PUBLISH prompt, publish the seven version-1 documents with the reviewer's name and the review date
   (they are still needed for those; Privacy Policy v2 needs nothing). Nothing was deployed here.
2. **`BACKUP_ENCRYPTION_KEY`:** already required by the production start and the deployment script.
   The erasure ledger is encrypted and chained with it, so **do not change it** once a deletion has been
   carried out (the ledger could no longer be read, and restores would fail). Keep it in the password
   manager. Add `/data/ledger/erasures.ledger` to the off-site copies ([DEPLOYMENT.md](DEPLOYMENT.md),
   section 8).
3. **One real email through Resend** after deployment (only the local SMTP path was tested here).
4. Central Caddy and Cloudflare for twigo.space, as already documented. No Caddy change was made.
5. **Push** `main` and the tags when you want them on GitHub (nothing was pushed).
6. Open decisions that remain: [TWIGO-OPEN-DECISIONS.md](TWIGO-OPEN-DECISIONS.md) (governing law, minimum age,
   audit-log retention period, Community Support recipient, the earlier project module).
