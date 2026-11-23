# Twigo: release report

## Status: PRODUCTION RELEASE CANDIDATE — PENDING VERIFICATION

Prepared 23 November 2026 on branch `feature/twigo-platform-transformation` (tag
`twigo-rc-<date>` once committed; see section 6). This is **not** a final production release: four
acceptance criteria can only be verified on the VPS or need decisions and credentials that only the
founder can provide (section 2). Every software requirement within the agreed scope is implemented
and verified on this computer, in the local production build and in the Docker production build.

Legend used throughout:

| Mark | Meaning |
| --- | --- |
| **L** | Verified locally (automated unit/integration tests against PostgreSQL, or browser tests against a production build on this computer) |
| **D** | Verified in the Docker production build (image built from `Dockerfile`, run with `docker-compose.yml`, on Docker in WSL) |
| **U** | Prepared for Ubuntu (configuration and documented steps), not yet run on the VPS |
| **V** | Awaiting manual VPS deployment by the founder |
| **X** | Awaiting external credential, DNS/Cloudflare, legal decision or lawyer |
| **N** | Not completed |

---

## 1. Requirements to implementation

### 1.1 Platform foundation (Phase 1 and the corrective plan)

| Requirement | Implementation | Status | Evidence |
| --- | --- | --- | --- |
| Visitor → account → email verification → application → review → approval → member access | `src/server/onboarding.ts`, `membership-application.ts`, `admin/applications.ts`, `membership-grant.ts` | L D | browser tests A–F, C2, D; walkthrough Applicant steps (Docker) |
| Sign-in, sign-out, lockout, rate limits, password reset/change, email change, sessions list and revoke | `src/lib/auth/*`, `src/server/accounts.ts` | L D | `corrective-accounts`, `onboarding`, `email` tests; browser test F (reset); walkthrough |
| Roles OWNER/ADMIN/MEMBER with explicit permissions; group COORDINATOR/MEMBER | `src/lib/auth/permissions.ts`, `server/community/access.ts` | L | `unit`, `corrective-admin`, `twigo-*`, `release-fixes` tests |
| Administrator two-step verification (TOTP, recovery codes), re-confirmation for sensitive actions | `src/lib/auth/totp.ts`, guard | L D | unit tests; walkthrough Administrator steps |
| Member profiles with visibility controls and photo | `server/community/profiles`, files | L D | tests; walkthrough "uploads a profile photo" (stored in the Docker volume) |
| Ideas: submit, feed, search, category filter, sort, pagination; comments; notifications | `server/community/ideas.ts`, `comments.ts` | L D | `release-gaps` (search/filter/sort/paging, new), `corrective-ideas`, browser test 5 |
| Two supporters create exactly one project group, even under concurrency | `ideas.ts` (row lock + unique ideaId) | L D | `community` test (6 simultaneous endorsements), browser 9–13, walkthrough |
| Group pages, join/leave/rejoin, coordinator hand-over and succession, removal with notice, admin lift | `server/community/groups.ts` | L D | `corrective-chat`, `corrective-stage3b`, browser 20–26, walkthrough Group steps |
| Real-time group chat (persistence, replies, edit/delete, unread, presence, typing, attachments, reconnection, revocation) | `src/realtime/*` | L D | `corrective-realtime`, browser 14–15 and 20–26; walkthrough chat steps; WebSocket upgrade 101 in Docker |
| Meetings (Google Meet links, start/join/end, attendance metadata; nothing recorded) | `server/community/meetings.ts` | L D | `corrective-meetings`, browser 16–18, walkthrough |
| Research workspace: notes, tasks, decisions, links, files | `server/community/research.ts`, `files.ts` | L D | tests; walkthrough Group steps |
| Notifications with preferences and live badge | `server/community/notifications.ts` | L | tests |
| Reporting and moderation; no hidden admin access to private chat | `server/community/reports.ts`, admin moderation | L D | browser 27; `corrective-chat` (history boundary); walkthrough "admin sees no earlier chat" |
| Admin: applications, members, moderation, ideas, groups, content, email, privacy, backups, administrators, settings, audit | `src/app/admin/**` | L D | `corrective-admin`; browser 27–30; walkthrough Administrator/Owner |
| Editable email templates, previews, delivery log with honest statuses, retry | `src/lib/email/*`, Admin → Email | L D | `email`, `resend-smtp` tests; walkthrough |
| Self-service data export; applicant export; CSV with formula protection | `server/privacy.ts` | L | tests |
| Retention per category with dry run and daily job | `src/ops/retention.ts` | L D | tests; walkthrough "retention clean-up" (Docker) |
| Backups (encrypted) and verified restore into a separate database | `src/ops/backup.ts` | L D | `community` (restore), `release-fixes` (no plaintext/partial file); Docker restore (section 3) |
| 59 audit findings of the corrective plan | see `docs/CORRECTIVE-IMPLEMENTATION-REPORT.md` | L | 58 met; P3-20 (Prisma CLI advisories) has no available fix; **P3-23 (overview of compensation records) now implemented** (Admin → Project agreements, owner only) |

### 1.2 Twigo transformation (stages 1–9)

| Requirement | Implementation | Status | Evidence |
| --- | --- | --- | --- |
| Brand Twigo, identity, slogan (exact), description, supporting text; no old branding | `src/config/brand.ts`, content defaults, all public pages | L D | `integration`, `unit`; text search; walkthrough Visitor |
| Domain `https://twigo.space` as canonical; all links from `SITE_URL` | `SITE_URL`, `metadataBase`, sitemap, emails | L D | `resend-smtp` (links in verification and reset emails) |
| No fee, no investment, no commission, no automatic deduction, no handling of project money | no such code; texts; agreement statement | L | `twigo-revenue-model` 1–4, 12 |
| Group-controlled compensation (equal, contribution, role, fixed, other); no hard-coded percentage | `group-projects.ts` termsSchema | L D | revenue tests 5–6; browser 29; walkthrough "plans a project" |
| The 15 required agreement items before commercial work; contracting models; payment recipient; legal/tax review flag | `group-projects.ts` (REQUIRED, activateProject) | L D | `twigo-projects`, browser 29 |
| Coordinator is not automatically the legal representative | agreement text, project page | L | `twigo-projects` |
| Acceptance by every participant; immutable versions; changes need renewed acceptance; coordinator cannot silently change compensation | versions DRAFT/OPEN/ACCEPTED/SUPERSEDED, fingerprint-bound acceptance, project row locks | L D | `twigo-projects`, revenue tests 6–8, `release-fixes` (concurrency, closed projects, archived groups) |
| Withdrawal and disputes without confiscation; documented procedures (8.4) | `withdrawFromProject`, Participation & Compensation Policy "Procedures" | L | `twigo-projects`, `release-fixes` (withdrawal after leaving the group) |
| Downloadable agreement copies with fingerprint and acceptances; audit history | `/api/agreements/[id]`, audit log | L D | `twigo-projects`, `release-fixes`, browser 29, walkthrough |
| Voluntary Community Support: public page, owner records, frozen public reports, no privileges, never deducted, payments disabled (inactive flag) | `server/community-support.ts`, `/support`, Admin → Community support | L D | revenue tests 9–11, `twigo-support-privacy`, `release-fixes` (amount limit) |
| Eight versioned legal documents; states Draft → Pending legal review → Approved → Published → Superseded; no placeholders; nothing approved automatically | `src/content/legal/*`, `server/legal.ts` | L D | `twigo-legal`, `release-fixes` (one published, one draft) |
| Legal Notices, private until confirmed | `server/legal-notices.ts` | L D | `twigo-legal`; walkthrough |
| Registration: separate acceptance (Terms, Guidelines) and acknowledgment (Privacy); records with version, hash, time, method | `onboarding.ts`, `legal.ts` | L D | `twigo-legal`, `release-fixes` (refused when a document is missing) |
| Renewed acceptance after material changes, also when a minor update follows | `pendingReacceptance`, `/legal/review` | L | `twigo-legal`, `release-fixes` |
| Members can open the exact versions they accepted; project agreements listed | Account → Agreements | L | browser 30 (accessibility) |
| Idea form with all required fields and visibility/IP acknowledgment; 2-supporter rule kept | idea form, `createIdeaAction` | L D | `twigo-support-privacy`, browser 5, walkthrough |
| Group Participation Agreement acknowledged on support/join; governance (decisions, removal with notice, disputes reportable) | groups, reports (reasons IP, DISPUTE) | L | `twigo-support-privacy`, `corrective-stage3b` |
| Admin sections (stage 8: brand/settings, legal, versions, acceptances, guidelines, ideas, groups, project agreements, compensation records, support, privacy requests, audit) | `src/app/admin/(panel)/**` | L D | browser 30 (owner pages), walkthrough Owner |
| Privacy requests (member form, owner handling, audit, export) | `server/privacy-requests.ts` | L | `twigo-support-privacy`, `release-fixes` |
| Content consistency (stage 9) | public and member pages | L | text scans (revenue test 12), visual review |

### 1.3 Email, domain, port 1010, Docker, Caddy

| Requirement | Implementation | Status | Evidence |
| --- | --- | --- | --- |
| Resend SMTP (smtp.resend.com:465, TLS, user resend), sender `Twigo <noreply@twigo.space>`, `SMTP_PASSWORD=` empty | `.env`, `.env.example`, `.env.production.example`, `src/lib/email` | L D (configuration) · X (real delivery) | `resend-smtp` (10 tests) |
| Missing key: no connection, recorded "not set up", no crash, never reported as sent | `emailConfigProblem` | L D | `resend-smtp`; Docker trial |
| Development never sends real email; production never uses the local test inbox | `devMailCatcherPort` | L | `resend-smtp` |
| Delivery statuses incl. provider-confirmed delivery via signed webhook; webhook secret never the API key | `webhook.ts` | L | `email`, `resend-smtp` |
| Next.js listens on 1010 in the container and on the host; no port 3000 in production | `server.ts`, `Dockerfile`, `docker-compose.yml` | L D | `deployment-config`; Docker socket and port checks (section 3) |
| Docker production build without secrets in the image | BuildKit secret, `.dockerignore` | D | image contents checked |
| Graceful shutdown in Docker | `node --import tsx` as the process, `init: true` | D | section 3 (exit code after `docker stop`) |
| Central Caddy registration of `twigo.space` (no Caddy in the project) | specification in `docs/TWIGO-RESEND-CADDY-INTEGRATION-REPORT.md` §C and `docs/DEPLOYMENT.md` §5 | U · V | no access to the VPS; must include `trusted_proxies` for Cloudflare |
| HTTPS on twigo.space, WebSocket through Caddy and Cloudflare | — | V X | currently Cloudflare 525 (nothing served for twigo.space on the server yet) |

## 2. Release acceptance criteria

| # | Criterion | Result |
| --- | --- | --- |
| 1 | All agreed features implemented | **Met** within the agreed scope (section 1). Items that depend on outside facts are listed in section 4 |
| 2 | Critical and high-priority defects resolved | **Met.** The independent review of 23 November found 1 high authorization defect, 1 high agreement-concurrency defect and 1 high deployment risk; all three fixed and tested (section 5) |
| 3 | No known critical security vulnerability | **Met** for the application. The 4 npm advisories are in Prisma's command-line tool, not in the running site (unchanged, no fix available) |
| 4 | Automated tests pass | **Met**: `npx vitest run` → **430 passed, 0 failed, 0 skipped** (37 files); `tsc` and ESLint clean |
| 5 | Browser tests pass | **Met**: `npx playwright test` on a fresh production build → **23 passed, 0 failed** |
| 6 | Complete user journeys work | **Met locally and in Docker**: the 61-step role walkthrough covers visitor → registration → email verification → application → approval → member access → idea → supporters → group formation → membership → chat, meetings, notes → project creation → agreement → acceptance by every participant → project activity, plus administrator and owner work: **61 of 61 in the Docker production build** (section 3). On the VPS: pending (section 6) |
| 7 | Database migrations validated | **Met**: applied to test databases, the development database (with rehearsal, 0 differences) and in Docker (10 migrations) |
| 8 | Backup and recovery tested | **Met in Docker**: the owner's "Back up now" backup (encrypted) was restored into a separate database inside the Docker setup and verified table by table. On the VPS: pending (section 6) |
| 9 | Docker production build succeeds | **Met**: image built from `Dockerfile` with Docker 29.7 / Compose 5.5 (BuildKit) in WSL Ubuntu 24.04 |
| 10 | Next.js runs on port 1010 | **Met (D)**: the only application socket in the container is `0.0.0.0:1010`; `docker port` → `1010/tcp -> 127.0.0.1:1010`; nothing on 3000 |
| 11 | No development-only secrets in production configuration | **Met**: `.env.production.example` has empty secrets; startup refuses development values; the image contains no settings file |
| 12 | Email integration correctly implemented | **Met in software; real delivery pending** the Resend key (X) |
| 13 | Central Caddy integration correctly prepared | **Prepared (U)**, registration itself awaits the founder (V) |
| 14 | Documentation reflects the implementation | **Met** (`docs/DEPLOYMENT.md`, `docs/EMAIL.md`, reports updated for every change in this round) |

**Why "pending verification":** criteria 12 (real email delivery) and 13 (Caddy registration) and the
production-only checks (HTTPS, WebSocket through Cloudflare and Caddy, backup restore on the VPS) can
only be completed on the server, and the legal documents are still awaiting a lawyer's review.

## 3. Verification in the Docker production build

Run with `bash scripts/audit/docker-verify.sh` (development computer only; never on the VPS). It builds
the production image, seeds a throw-away demo database inside the Docker PostgreSQL, starts the app with
`docker-compose.yml` plus `docker-compose.verify.yml` (which only adds a test mail catcher sharing the
app's network and points the app at the demo database), then runs the browser walkthrough against
`http://127.0.0.1:1010`. Final run on 23 November 2026:

| Check | Result |
| --- | --- |
| Image build | Succeeded |
| Next.js listening port inside the container | `0.0.0.0:1010` (the only application socket) |
| Host port | `1010/tcp -> 127.0.0.1:1010` |
| Health | `{"status":"ok","db":"ok"}` |
| Role walkthrough (visitor, applicant, member, group, administrator, owner) | **61 of 61 steps passed**; screenshots in `docs/twigo-docker-screenshots/` |
| Uploads (profile photo, chat attachment, group file) into the `twigo-data` volume as the unprivileged user | Passed (walkthrough steps) |
| Chat in two sessions, live | Passed (walkthrough) |
| Owner backup → restore into `twigo_restorecheck` | **Restore verified** (every table) |
| `docker stop` | **Exit code 0**, `server.shutdown` logged (graceful) |

Environment note: on this computer Docker runs inside WSL, and Windows stops an idle WSL VM (taking
Docker with it); the verification script keeps WSL awake. This does not apply to the VPS.

## 4. Remaining issues and release blockers

| # | Item | Kind | Who |
| --- | --- | --- | --- |
| 1 | Operator **Twigo** and contact **contact@twigo.space** confirmed by the founder (23 Nov; set in `.env.production.example` and shown on the Legal Notices page). **Still needed: jurisdiction / governing law** (`ORG_JURISDICTION`; the site refuses to start without it) | Release blocker (X) | Founder |
| 2 | Legal review: the founder confirmed on 23 Nov that a lawyer reviewed the eight documents. Publication is a one-time command on the VPS with the reviewer's name and date (`npm run legal:publish-reviewed`, `docs/DEPLOYMENT.md` §6, step 4); it publishes only the exact reviewed texts | Prepared (U); run on the VPS (V) | Founder |
| 3 | Deploy on the VPS (`docs/DEPLOYMENT.md` §5–6) and run the post-deployment checks (§6 of this report) | Release blocker (V) | Founder |
| 4 | Register `twigo.space` in the central Caddy with Cloudflare `trusted_proxies`; Cloudflare SSL/TLS Full (strict) | Release blocker (V, X) | Founder |
| 5 | Resend API key in `.env.production` (a new key; the one shared in chat should be deleted); one real test email | Release blocker (X) | Founder |
| 6 | Off-site copy of backups and uploaded files | Operational requirement (V) | Founder |
| 7 | Earlier administrator-run project module: keep or retire (open decision 9) | Decision | Founder |
| 8 | Group discussions are visible to every approved member (chat, meetings, notes and files are private). This is the existing, documented design (`docs/ARCHITECTURE.md`), kept unchanged | Design note | Founder may decide otherwise |
| 9 | Administrators can read a group's plan/concept/revenue/risk notes from "Ready for review" onwards, including after approval into an earlier project record (documented in the code) | Design note | — |
| 10 | Privacy Policy retention periods are text; a changed setting needs a new policy version | Known limitation | Owner procedure |

## 5. Defects found and fixed in this round

An independent three-part review (authorization and privacy; business logic; Docker, backup and
deployment) read the code without changing it. Every finding below was checked, fixed and is covered by
a test in `tests/release-fixes.test.ts` (16 tests) unless noted.

| Severity | Defect | Fix | Test |
| --- | --- | --- | --- |
| High | Groups were looked up "by id or by slug"; a crafted idea title could make one group's slug equal another group's id, letting that coordinator act on the other group | Services look groups up by id only; slugs only on the group pages (`groupAccessBySlug`) | yes |
| High | Agreement races: an OPEN version could be rewritten by a concurrent draft save, or opened with text nobody checked; a WITHDRAWN version could become ACCEPTED | All agreement changes lock the project row, re-read and re-check under the lock; updates are conditional on the expected status | yes (concurrent accept/withdraw, 4 rounds) |
| High (deployment) | Behind Cloudflare, Caddy's default replaces the forwarded chain, so every visitor would share one sign-in limit | Caddy `trusted_proxies` requirement in the registration specification and `docs/DEPLOYMENT.md`; the app now logs `proxy.forwarded_chain_too_short` when it happens | yes (detection) |
| Medium | Projects of archived or suspended groups stayed editable | Writes require an open group; reading stays possible | yes |
| Medium | A closed project could still open and accept versions | Refused for completed or cancelled projects | yes |
| Medium | A later minor policy update cancelled a pending renewed acceptance | Renewed acceptance is owed until a version at or after the flagged one is accepted | yes |
| Medium | Registration could create an account without a Terms acceptance if a document changed mid-way or had no readable version | Missing or changed documents roll the whole registration back with a clear message | yes |
| Medium | Two published versions of one document were possible (via returning a version to draft while another draft existed) | Only one draft per document; an older version cannot be published over a newer one; publishing supersedes any other published version | yes |
| Medium | An author could bring back an idea that moderators removed | Only an open idea can be closed, with a conditional update | yes |
| Medium | Any member could make a "profile photo" appear in a private group's file list | Profile photos never carry a group; group file lists show group content only | yes |
| Medium | Backups were first written unencrypted, then encrypted; an interruption could leave plaintext personal data | Compressed and encrypted in memory, written to a temporary name and renamed when complete (mode 600) | yes |
| Medium | Docs: restore path, rollback (`DATABASE_URL` is set by Compose), first start order, updating, email key in Docker, changing the database password | `docs/DEPLOYMENT.md` §5, §8; `docs/EMAIL.md`; `TWIGO_DB_NAME` variable for rollback | Docker restore verified |
| Low–medium | `tsx` as the container's main process force-killed the app 30 ms after a stop signal | `node --import tsx` is the process; `init: true`; `stop_grace_period: 30s` | Docker: `docker stop` → exit code 0, shutdown logged |
| Low–medium | A project coordinator who left the group kept edit rights after rejoining | Leaving or removal releases project coordination | yes |
| Low | Former participants could not download the agreement they are bound by, or record their withdrawal after leaving the group | Participants keep access to versions listing them; Account → Agreements lists their project agreements | yes |
| Low | The owner's download of another group's agreement skipped two-step verification and was not audited | Owner access requires two-step verification and writes `agreement.downloaded_by_owner` | yes |
| Low | Large support amounts crashed the entry (integer overflow) | Limited to 20,000,000.00 with a message | yes |
| Low | Changing a privacy request's status without a new answer erased the earlier answer | The earlier answer is kept | yes |
| Planned (P3-23) | No overview of the earlier compensation records | Owner-only list on Admin → Project agreements | browser test 30 (page check) |
| Test gap | Idea search, category filter, sorting and pagination were checked only by code review | `tests/release-gaps.test.ts` | yes |
| Test script | The role walkthrough moved on before a second status change was saved (passed locally by timing; exposed by the slower Docker run) | waits until the new status is applied | Docker walkthrough |

Reviewed and kept as designed (section 4, items 8 and 9): group discussions are visible to all approved
members; administrators read a group's plan notes from "Ready for review" onwards.

## 6. After deployment: checks to run on the VPS

1. `curl -s http://127.0.0.1:1010/api/health` on the VPS → `{"status":"ok","db":"ok"}`; `docker port twigo-app-1` → `1010/tcp -> 127.0.0.1:1010`.
2. `https://twigo.space` loads with a valid certificate; `http://` and `www.` redirect to it.
3. Sign in from two different networks; in Admin → Audit log the two are not blocked together; the
   app log has no `proxy.forwarded_chain_too_short` line.
4. Open a group chat in two browsers: messages arrive live (WebSocket through Cloudflare and Caddy).
5. Admin → Email → Check connection, then Send a test email to me (after the Resend key is set).
6. Admin → Backups → Back up now, then the restore test in `docs/DEPLOYMENT.md` §8.
7. Copy backups and the storage folder off the server.

When all of these pass and items 1–5 of section 4 are closed, the release can be labelled final.

## 7. Release package

- Git tag: `twigo-rc2-2026-11-23` on branch `feature/twigo-platform-transformation` (not merged
  into `main`, not pushed).
- Archive for upload: `release/twigo-rc2-2026-11-23.tar.gz` (all tracked files of the tag; contains no
  `.env` file, no secrets, no database, no backups) and its SHA-256 in
  `release/twigo-rc2-2026-11-23.tar.gz.sha256`.
- Upload and unpack (from PowerShell on this computer, then on the VPS):

  ```
  scp release/twigo-rc2-2026-11-23.tar.gz shabla@162.35.23.106:~/
  ssh shabla@162.35.23.106
  mkdir -p ~/twigo && tar -xzf ~/twigo-rc2-2026-11-23.tar.gz -C ~/twigo && cd ~/twigo
  cp .env.production.example .env.production   # fill in, then docs/DEPLOYMENT.md sections 5-6
  ```
