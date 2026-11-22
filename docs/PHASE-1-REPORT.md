# Phase 1 report: member collaboration community

Date: 2026-11-21. Scope: the founder's "Phase 1 Master Development Instruction".
Status labels: **Implemented and verified** (automated test executed and passed),
**Implemented** (built, not independently verified end to end), **Partially
implemented**, **Blocked**, **Not implemented**, **Changed by founder decision**.

Phase 2 has not been started and will not be without the founder's approval.

## 1. Repository inspection findings
- Next.js 16 (webpack), React 19, TypeScript, Tailwind 4, PostgreSQL, Prisma 6 in
  Rust-free mode with a custom migration runner (native Prisma engines and Turbopack
  crash on the development machine). 61 tests passed before Phase 1.
- Admin-only authentication (JWT cookie, `AdminUser`); OWNER and ADMIN behaved the same;
  no 2FA, no password screen, no member accounts.
- All 28 owner-supplied photos present at their original paths (kept unchanged).
- No git repository, no `pg_dump`, no Docker on the machine; Microsoft Edge installed
  (used for browser tests, no download).
- IPv6 loopback connections are blocked on this machine; the dev server binds to 127.0.0.1.

## 2. Final architecture
One always-on Node.js process (`server.ts`, founder's hosting decision) runs Next.js,
Socket.IO (`/socket.io`) and the daily jobs, with PostgreSQL `LISTEN/NOTIFY` connecting
server code to sockets. Details: [ARCHITECTURE.md](ARCHITECTURE.md).

## 3. Implemented functionality

| Requirement | Status |
| --- | --- |
| Membership lifecycle: apply → review → accept → invitation → email verification → password → active member | Implemented and verified (e2e steps 1–4) |
| Login, logout, password reset, password change, email change with verification | Implemented and verified (login/logout/activation e2e; reset, change and email change by integration/unit tests of the services) |
| Secure sessions, revocation, suspension, deactivation, auth rate limiting, lockout | Implemented and verified (integration tests) |
| OWNER / ADMIN / MEMBER roles with explicit permissions; group COORDINATOR / MEMBER | Implemented and verified (unit + integration tests) |
| Admin 2FA (TOTP) with recovery codes, reauthentication for sensitive actions | Implemented and verified (2FA login in e2e; TOTP/recovery/replay unit tests) |
| Member profiles with visibility controls and optional photo | Implemented (profile creation verified in e2e; photo upload covered by upload tests) |
| Community portal (home feed, navigation, empty states, real data only) | Implemented and verified (e2e, accessibility scan) |
| Business idea submission, feed, search, filter, sorting, pagination | Implemented and verified (submission/feed in e2e; search/sort by code review) |
| Threaded comments, edit/delete own, notifications | Implemented and verified (integration tests) |
| Endorsement rules and automatic group creation at 2 endorsements (configurable) | Implemented and verified (e2e steps 6–13; integration tests incl. 6 simultaneous endorsements → exactly 1 group) |
| Group directory, dedicated group pages with 7 tabs, join / leave / rejoin | Implemented and verified (e2e steps 13, 20–26) |
| Coordinator succession; archive when empty | Implemented and verified (integration test) |
| Real-time group chat: persistence, replies, edit/delete, unread, presence, typing, attachments, reconnection, pagination | Implemented and verified for real-time delivery, persistence after reload, access revocation on leave, outsider refusal (e2e + Socket.IO integration test). Replies, edit, delete, typing and attachments: implemented; edit/attachment rules verified by integration tests; UI interaction not separately browser-tested |
| Voice and video meetings | **Changed by founder decision**: Google Meet. In-app start/join/end, member-only links, notifications and attendance metadata are implemented and verified (e2e 16–18). Microphone/camera selection, muting and media quality are handled by Google Meet and were **not tested by us**. In-app WebRTC: **Not implemented** |
| Research workspace: notes per section, tasks, decisions, links, files | Implemented and verified (notes/tasks in e2e; files/links by integration tests) |
| Group stages FORMING → … → READY_FOR_REVIEW; admin approval → linked project | Implemented (status changes and approval are code-reviewed; approval not covered by an automated test) |
| Notifications: read/unread, history, mark read, preferences, coalescing, live badge | Implemented and verified (integration tests; badge via Socket.IO event) |
| Admin: members, ideas, groups, reports & moderation, email, privacy, backups, administrators, settings, audit | Implemented; moderation + audit verified in e2e step 27 |
| Reporting (fraud, harassment, spam, fee requests, solicitation, illegal, privacy) | Implemented and verified (e2e + integration) |
| No hidden admin access to private chats | Implemented and verified (admins see only reported snapshots; tested) |
| Editable email templates, preview + confirm, delivery log, no automatic status emails | Implemented and verified against a local SMTP server (invitations in e2e; failure logging in integration tests) |
| Real email provider delivery | **Blocked**: no provider configured or purchased. Must be tested before public recruitment |
| Self-service data export, admin applicant export, CSV export with formula protection | Implemented and verified (unit test for CSV; exports by code review) |
| Configurable per-category retention, dry run, daily job | Implemented and verified (integration test) |
| Backups and restore into a separate database | Implemented and verified (dev database backed up before migration and restore-verified; automated test) |
| Public site: community model explained, honest Work With Us page, community rules, member sign-in | Implemented and verified (pages render; accessibility scans pass) |
| Centralized branding | Implemented (`src/config/brand.ts`, env variables) |
| Draft legal documents and open questions | Implemented as drafts (`docs/legal/`); attorney review **Blocked** on the founder |
| Deployment to production | **Not implemented** by design: nothing purchased or published |

## 4. Modified and new files
About 190 files. Main groups:
- **New:** `server.ts`; `src/config/*`; `src/lib/auth/{permissions,session-core,tokens,totp}.ts`,
  `src/lib/{crypto,csv,db-core,realtime-events}.ts`, `src/lib/files/sniff.ts`,
  `src/lib/validation/community.ts`; `src/realtime/*`; `src/ops/*`;
  `src/server/accounts.ts`, `src/server/{privacy,settings,flash}.ts`, `src/server/community/*`;
  `src/app/(auth)/*`, `src/app/account/*`, `src/app/community/*`, `src/app/api/*`,
  admin pages for members, reports, ideas, groups, email, privacy, backups, admins,
  settings; `src/components/community/*`; public pages `work-with-us`, `community-rules`;
  scripts `backup.ts`, `dev-mail.ts`; Playwright config and `tests/e2e/*`;
  `tests/{community,phase1-unit}.test.ts`; docs `ARCHITECTURE.md`,
  `FINANCIAL-TRANSPARENCY.md`, `legal/*`, this report.
- **Modified:** Prisma schema; auth `service/session/guard/constants`; email module and
  templates; env validation; existing admin pages/actions (explicit permissions,
  compensation OWNER-only, applicant email/invite/export); home, How It Works, privacy,
  contact, header/footer/nav; `next.config.ts` (WebSocket CSP, private-route headers);
  existing tests updated for the new auth model; README, DEPLOYMENT, LEGAL-REVIEW.

## 5–6. Database changes and migrations
Migration `20261121000000_phase1_community` (hand-reviewed, non-destructive):
- `AdminUser` **renamed** to `User` (ids, audit history and note authorship kept);
  `AdminRole` replaced by `UserRole` (adds MEMBER); `isActive` converted to `status`;
  existing admins marked email-verified.
- New tables: Session, AccountToken, RecoveryCode, MemberProfile, OrgSetting,
  BusinessIdea, IdeaEndorsement, Comment (with a one-parent check constraint),
  ResearchGroup, GroupMembership, GroupAnnouncement, GroupDiscussion, GroupChannel,
  ChatMessage, ChannelReadState, StoredFile, GroupMeeting, MeetingAttendance,
  ResearchNote, ResearchTask, GroupDecision, GroupLink, Notification,
  NotificationPreference, ContentReport, EmailTemplate, EmailDelivery, JobRun.
- New columns: `Project.researchGroupId`, `ContactInquiry.organization/timeline`.

Safety procedure followed: backup of the dev database
(`backups/cowork-20261121-212248-before-phase1.cwbak.gz`) → verified restore into
`cowork_restore_check` (18 tables, all row counts and checksums matched) → migration
applied to the restored copy → its structure compared column-by-column, index-by-index
and constraint-by-constraint with a database built directly from the new schema:
**identical** → data checked (both owner accounts and 13 audit entries intact) → applied
to the dev database.

## 7. Member authorization model
See [ARCHITECTURE.md](ARCHITECTURE.md#authorization). OWNER-only: settings, administrators,
compensation/finance, data exports, retention runs, backups, email template wording,
applicant erasure. ADMIN: applications, members (invite/suspend members), moderation,
groups, projects (no compensation), email sending, content, inquiries, audit view.
MEMBER: no admin permissions. Group coordinators: group-level only.

## 8. Endorsement and automatic group creation
See [ARCHITECTURE.md](ARCHITECTURE.md#ideas--endorsements--groups): row lock + unique
constraint; threshold in settings (default 2, author excluded, only ACTIVE endorsers count);
endorsers become founding members; withdrawing never deletes a group.

## 9. Real-time communication
Socket.IO on the same origin; cookie session checked on connect; membership re-checked
on every operation; Origin check against cross-site WebSocket hijacking; messages
persisted before broadcast; idempotent resends; access revoked live via LISTEN/NOTIFY.

## 10. Voice and video
Founder decision: Google Meet for now. The site validates and stores the Meet link per
meeting, shows it only to current group members, notifies members, records start/end
and who opened the link, and never records media. Limitation: a Meet link works for
anyone who has it; the page advises a fresh link per meeting and Meet's host controls.
A future self-hosted provider (e.g. LiveKit) fits the existing `GroupMeeting.provider`
field.

## 11. Security improvements
Mandatory admin 2FA (encrypted secrets, recovery codes, replay protection); database
sessions with revocation; reauthentication for sensitive actions; explicit permissions;
compensation restricted to the owner; single-use hashed tokens; generic auth errors,
lockout and rate limits; upload type detection by content, image re-encoding, private
storage, authorized downloads with sandbox CSP; WebSocket origin check; CSP extended
only for the site's own WebSocket; `no-store`, `noindex` and `no-referrer` on private and
token URLs; production refuses to start with weak or development secrets.

## 12. Privacy improvements
Privacy notice extended to member data (version `2026-11-draft-2`); member self-export
and deactivation; owner applicant export; CSV export protection; per-category retention
with dry run and job history; admins cannot browse chats; profile visibility controls;
image metadata (e.g. GPS) stripped; no raw IPs stored.

## 13. Testing results (executed on 2026-11-21)

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed (0 errors) |
| `npm run lint` | Passed (0 problems) |
| `npm test` (Vitest unit + PostgreSQL integration) | **103 passed**, 0 failed (61 original, updated for the new auth model, + 42 new) |
| `npm run test:e2e` (Playwright, Microsoft Edge, production build) | **14 passed**, 0 failed: the full 28-step founder scenario in independent sessions, security checks, accessibility scans and mobile layouts |
| Accessibility (axe, WCAG 2 A/AA, serious/critical) | Passed on home, How It Works, Work With Us, Community rules, login, community home, idea page, group members, admin audit (after fixing contrast and list markup found by the scan) |
| Production build (`next build --webpack`) | Passed (built as part of the e2e run) |
| Backup and restore | Passed (dev DB before migration; automated test) |
| Real email provider, Google Meet audio/video, production hosting | **Not tested** (not available / outside the app) |

Notable integration tests: simultaneous endorsements → exactly one group; suspended
endorsers do not count; cross-group chat isolation; a real Socket.IO client is refused
without a session, from another origin and when suspended, and loses access on leave;
disguised SVG/HTML uploads refused; outsiders cannot download files or report private
messages; invitation tokens single-use and expiring; provider failures logged as failed;
OWNER-only permissions refused to ADMIN.

## 14. Browser verification evidence
- Playwright HTML report: `playwright-report/index.html` (run `npx playwright show-report`).
- Mobile chat screenshot: `test-results/mobile-chat.png`.
- Manual check in the browser pane on the dev server: idea publishing and the idea page.

## 15. Deployment requirements
See [DEPLOYMENT.md](DEPLOYMENT.md): one always-on server with WebSocket support,
PostgreSQL, persistent disk for uploads, SMTP provider, HTTPS reverse proxy, systemd
restart, off-site backup copies, health check at `/api/health`.

## 16. Estimated operating costs (about 30 members)
Roughly **$10–75 per month** (server $6–25, database $0–25, backup storage $1–5, email
$0–15, domain ~$1–2, Google Workspace optional ~$7+ per organizer). Prices to be verified
at purchase; nothing was bought.

## 17. Known limitations
- Single instance (in-memory rate limits and presence).
- Voice/video depend on Google Meet; Meet links can be shared outside the group.
- Email delivery to real inboxes unverified.
- Files on local disk (needs a persistent disk or S3 in production).
- No automated test for group-to-project approval, search/sort filters, member photo
  upload UI, chat edit/delete/attachment UI, password reset UI, or email change UI
  (their services are covered by tests or code review).
- CSP still allows inline scripts (Next.js without nonces).
- The dev server's hot reload can interrupt a form submission while a route compiles
  (development only; the e2e suite therefore runs on a production build).

## 18. Unresolved founder decisions
1. Final organization name, domain and official contact email.
2. Hosting provider and budget approval; email provider.
3. Whether to keep Google Meet or later add an in-app meeting server.
4. Retention periods per category (defaults are set; confirm with legal advice).
5. Ownership of ideas and group research; revenue distribution policy.
6. Legal entity timing (the ~30-member milestone is not a legal exemption) and
   participant classification.

## 19. Remaining public-launch blockers
- Attorney review of privacy notice, terms, community rules and agreement templates;
  operator identity filled in.
- Real email provider configured and verified with a real inbox.
- Hosting purchased (with approval), HTTPS, WebSockets through the proxy, off-site
  backups, restore test on the server.
- Owner account created on production with 2FA; no test accounts.
- Full scenario re-run on staging.

## 20. Recommended Phase 2 preparation
- Founder decisions above; legal review of `docs/legal/`.
- Pilot with 3–5 trusted members on a staging server to gather feedback on ideas,
  groups and chat.
- Decide on meeting infrastructure based on pilot use (Meet time limits, privacy).
- Consider: email digests, @mentions in chat, idea templates, group proposal export,
  Redis for multi-instance scaling, CSP nonces.
