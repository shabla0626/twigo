// Session lookup shared by Next.js code and the realtime (Socket.IO) server.
// No `server-only` / `next/*` imports here.
import type { AccountStatus, CommunityMembership, PrismaClient, UserRole } from "@prisma/client";
import { sha256 } from "../crypto";
import { ADMIN_IDLE_MINUTES, SESSION_COOKIE } from "./constants";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  status: AccountStatus;
  totpEnabled: boolean;
  displayName: string | null;
  photoFileId: string | null;
  emailVerified: boolean;
  membership: CommunityMembership;
  /**
   * May use the private member community: an ACTIVE account with a verified
   * email AND approved (ACTIVE) membership. Administrators are staff and may
   * take part without an application. This single flag is checked by every
   * community page, server action, API route and the realtime server.
   */
  communityAccess: boolean;
};

export function hasCommunityAccess(u: { status: AccountStatus; emailVerified: boolean; membership: CommunityMembership; role: UserRole }): boolean {
  if (u.status !== "ACTIVE" || !u.emailVerified) return false;
  return u.membership === "ACTIVE" || u.role === "OWNER" || u.role === "ADMIN";
}

export type SessionInfo = {
  sessionId: string;
  mfaPending: boolean;
  reauthAt: Date | null;
  createdAt: Date;
  user: SessionUser;
};

const TOUCH_INTERVAL_MS = 5 * 60_000;

/**
 * Resolves a raw session token. Returns null when the token is unknown,
 * revoked or expired. Account status is returned and must be checked by the
 * caller (a suspended user's session is still "found" so it can be shown a message).
 */
export async function lookupSession(
  db: PrismaClient,
  token: string | undefined | null,
  now = new Date(),
  /** `touch: false` for background checks (the realtime connection), which must not count as the person being active. */
  opts: { touch?: boolean } = {},
): Promise<SessionInfo | null> {
  if (!token || token.length > 200) return null;
  const s = await db.session.findUnique({
    where: { tokenHash: sha256(token) },
    select: {
      id: true,
      mfaPending: true,
      reauthAt: true,
      createdAt: true,
      expiresAt: true,
      revokedAt: true,
      lastSeenAt: true,
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          status: true,
          totpEnabledAt: true,
          emailVerifiedAt: true,
          membershipStatus: true,
          profile: { select: { displayName: true, photoFileId: true } },
        },
      },
    },
  });
  if (!s || s.revokedAt || s.expiresAt <= now) return null;
  // Owners and administrators: a session left unused for an hour is ended, so an unattended
  // computer does not stay signed in to the admin area for the whole working day.
  // ("Last seen" is refreshed every few minutes, so the real limit is 60 to 65 minutes.)
  const staff = s.user.role === "OWNER" || s.user.role === "ADMIN";
  if (staff && !s.mfaPending && now.getTime() - s.lastSeenAt.getTime() > ADMIN_IDLE_MINUTES * 60_000) {
    await db.session.update({ where: { id: s.id }, data: { revokedAt: now } }).catch(() => {});
    return null;
  }
  if (opts.touch !== false && now.getTime() - s.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    await db.session.update({ where: { id: s.id }, data: { lastSeenAt: now } }).catch(() => {});
  }
  const base = {
    status: s.user.status,
    emailVerified: Boolean(s.user.emailVerifiedAt),
    membership: s.user.membershipStatus,
    role: s.user.role,
  };
  return {
    sessionId: s.id,
    mfaPending: s.mfaPending,
    reauthAt: s.reauthAt,
    createdAt: s.createdAt,
    user: {
      id: s.user.id,
      email: s.user.email,
      name: s.user.name,
      role: s.user.role,
      status: s.user.status,
      totpEnabled: Boolean(s.user.totpEnabledAt),
      displayName: s.user.profile?.displayName ?? null,
      photoFileId: s.user.profile?.photoFileId ?? null,
      emailVerified: base.emailVerified,
      membership: base.membership,
      communityAccess: hasCommunityAccess(base),
    },
  };
}

/** Reads one cookie from a raw Cookie header (used by the Socket.IO handshake). */
export function readCookie(header: string | undefined, name = SESSION_COOKIE): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return undefined;
}
