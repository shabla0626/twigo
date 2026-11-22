# Architecture (Phase 1)

## Overview

```
Browser ──HTTPS──▶ server.ts (one Node.js process)
                    ├─ Next.js 16 (App Router): public site, /community, /account, /admin, /api
                    ├─ Socket.IO (/socket.io): chat, presence, typing, live notification badge
                    └─ Scheduler: daily retention + backup (advisory-locked)
                         │
                         ▼
                    PostgreSQL ◀── LISTEN/NOTIFY "cowork_realtime" (server code → sockets)
                    STORAGE_DIR (private uploads)      SMTP provider      Google Meet (links only)
```

## Identity and sessions
- One `User` table for owners, administrators and members (the former `AdminUser`
  table was renamed in a non-destructive migration; ids and audit history kept).
- `role`: OWNER | ADMIN | MEMBER. `status`: INVITED | ACTIVE | SUSPENDED | DEACTIVATED.
  People create their own account (status ACTIVE after confirming their email); community
  access is a separate field (`membershipStatus`) granted when an application is accepted.
  INVITED exists only for administrators invited by the owner, until they activate.
- Sessions are database rows (`Session`); the cookie holds a random token, the table
  stores its SHA-256. This allows per-device sign-out, "sign out everywhere",
  revocation on suspension/password change, and a short-lived `mfaPending` stage.
- Two-step verification: TOTP (RFC 6238) with `otpauth`; secrets AES-256-GCM encrypted
  with `ENCRYPTION_KEY`; 10 hashed single-use recovery codes; replay protection.
  Mandatory for OWNER/ADMIN (`ADMIN_REQUIRE_2FA`).
- Sensitive actions (email change, data export, deactivation, settings, roles) need a
  re-confirmation of password (+ code) within 10 minutes (`Session.reauthAt`).
- Single-use, expiring tokens (`AccountToken`: INVITE 7 d, VERIFY_EMAIL 24 h,
  RESET_PASSWORD 1 h); only hashes stored; consumed with a conditional update so two
  concurrent uses cannot both succeed.

## Authorization
- Organization permissions: `src/lib/auth/permissions.ts`. ADMIN has an explicit list;
  OWNER-only: settings, administrators, compensation/finance, data exports, retention
  runs, backups, email template wording, applicant erasure.
- Every admin page/action calls `requireAdmin("<permission>")`; member pages call
  `requireMember()`; the proxy (`src/proxy.ts`) only does an optimistic redirect.
- Group roles (COORDINATOR / MEMBER) are checked in `src/server/community/access.ts`
  and never grant organization permissions.
- Community-visible: group overview, discussions, member list. Members-only: chat,
  meetings, research workspace, files (enforced in services, route handlers and sockets).
- Administrators have no hidden access to private conversations:
  - There is no tool to browse a chat. The only moderation view is the text of a message
    that a group member reported (a stored copy); looking at reported chat messages is
    itself written to the audit log (`moderation.private_reports_viewed`).
  - An owner or administrator may join a group like any member. Every join, leave,
    removal and coordinator change is written into the group's chat as a system line
    (`ChatMessage.kind = SYSTEM`, in the same transaction as the change) and into the
    audit log (`group.member_joined`, `group.member_left`). Staff are labelled
    "Administrator" in the member list, in the chat and in those lines.
  - For an owner or administrator the chat begins when they joined
    (`ChannelAccess.historyFrom` in `src/realtime/chat-service.ts`): earlier messages are
    not in the history, are not pushed to them when edited or deleted, are not quoted to
    them in replies, cannot be answered or reported by them, and their attachments cannot
    be listed or downloaded. Leaving and joining again starts a new boundary. Ordinary
    members still receive the full history when they join.
  - When a group asks for review, administrators see only its proposal notes (PLAN,
    CONCEPT, REVENUE, RISKS), never its other notes, chat, meetings or files.

## Ideas → endorsements → groups
`src/server/community/ideas.ts` `endorseIdea()` runs in one transaction:
1. `SELECT … FOR UPDATE` on the idea row (serializes concurrent endorsements).
2. Insert the endorsement (`@@id([ideaId, userId])`, duplicates ignored).
3. Count endorsers who are ACTIVE and not the author.
4. If the count reaches `community.endorsementThreshold` (OrgSetting, default 2) and no
   group exists, `createGroupFromIdea()` creates the group, its `general` channel and the
   memberships (author = coordinator, endorsers = founding members) and marks the idea
   `GROUP_FORMED`.
`ResearchGroup.ideaId` is unique, so a duplicate group is impossible even if the lock
were bypassed. Notifications are sent after commit. Withdrawing an endorsement never
deletes a group. Covered by `tests/community.test.ts` (including 6 simultaneous
endorsements → exactly one group).

## Coordinator succession
`ensureCoordinator()` in `groups.ts` runs whenever a group may have lost its coordinator:
the coordinator leaves, their account is suspended, or their community access is paused or
removed. "Eligible" means an active group member who currently has community access.
1. The longest-standing eligible coordinator stays. Any other coordinator row (for example
   of a suspended person) becomes an ordinary member, so a group never has two.
2. Otherwise the longest-standing eligible member becomes coordinator, is notified, and a
   line in the chat says so.
3. If nobody is eligible: when no member is left at all the group is archived and flagged
   `adminManaged`; when members remain but none is eligible right now it is only flagged.
A person who regains access returns as an ordinary member; the role is never restored
automatically. Every change of a group's memberships runs under a lock on the group's row
(`withGroupLock()`), so simultaneous changes cannot collide.

## Group stages
FORMING → RESEARCHING → VALIDATING → PLANNING → READY_FOR_REVIEW (set by the
coordinator) → APPROVED_FOR_PROJECT (admin only, `groups.approve_project`, creates a
linked `Project` in PLANNING after a checklist confirmation) / ARCHIVED. Approval does
not authorize commercial work; agreements and compensation terms come first.

## Real-time chat
- `src/realtime/server.ts`: handshake checks the Origin against `SITE_URL` and resolves
  the session cookie in the database; suspended/revoked sessions are refused.
- Every join/send/edit/delete re-checks membership (`chat-service.ts`). Messages are
  persisted in PostgreSQL before broadcast; a client-generated id makes resends after a
  reconnect idempotent (`@@unique([authorId, clientId])`). Unsent messages survive a
  page reload (sessionStorage) and are retried on reconnect.
- Presence and typing are in memory. Rate limits: 20 messages / 10 s per user.
- Server-side events (left group, suspension, new notification) travel over
  `LISTEN/NOTIFY`; sockets of a user who left are removed from the rooms immediately.

## Meetings (Google Meet)
Founder decision for Phase 1. A member pastes a `https://meet.google.com/…` link
(validated), chooses voice or video; members are notified; "Join" records attendance
and redirects. Only metadata is stored; nothing is recorded. `GroupMeeting.provider`
allows a self-hosted provider (e.g. LiveKit) later without schema changes.

## Files
Private `STORAGE_DIR`; type detected from content (magic bytes, allow-list); SVG/HTML
refused; raster images re-encoded (metadata such as GPS removed); random storage keys;
downloads through `/api/files/[id]` with an access check, `nosniff`, `attachment` for
non-images and a sandbox CSP. Unauthorized and missing files both return 404.

## Data protection
- Exports: member self-export (JSON), admin per-applicant export (OWNER), applications
  CSV with formula-injection protection.
- Retention (`src/ops/retention.ts`): per-category periods in OrgSetting, daily job,
  dry-run preview at `/admin/privacy`, every run in `JobRun` + audit log. Never deletes
  compensation records, projects, active members, or audit logs.
- Backups (`src/ops/backup.ts`): logical, consistent snapshot of all tables (COPY),
  optional encryption, verified restore into a separate database only.
