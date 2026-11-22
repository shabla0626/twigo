import "server-only";
import { cookies, headers } from "next/headers";
import type { Prisma, UserRole } from "@prisma/client";
import { db } from "../db";
import { env } from "../env";
import { randomToken, sha256 } from "../crypto";
import { publishRealtime } from "../realtime-events";
import { MFA_PENDING_MINUTES, SESSION_COOKIE } from "./constants";
import { isAdminRole } from "./permissions";

export function sessionTtlHours(role: UserRole): number {
  return isAdminRole(role) ? env().SESSION_TTL_HOURS : env().MEMBER_SESSION_TTL_HOURS;
}

/**
 * Creates a database session and returns the raw token (only its hash is stored).
 * A session with `mfaPending` only allows completing the second factor.
 */
export async function createSession(
  userId: string,
  role: UserRole,
  opts: { mfaPending?: boolean; mfaVerified?: boolean; ipHash?: string; userAgent?: string | null } = {},
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomToken(32);
  const now = Date.now();
  const expiresAt = opts.mfaPending
    ? new Date(now + MFA_PENDING_MINUTES * 60_000)
    : new Date(now + sessionTtlHours(role) * 3600_000);
  await db.session.create({
    data: {
      tokenHash: sha256(token),
      userId,
      mfaPending: Boolean(opts.mfaPending),
      mfaVerifiedAt: opts.mfaVerified ? new Date(now) : null,
      reauthAt: opts.mfaPending ? null : new Date(now),
      ipHash: opts.ipHash,
      userAgent: opts.userAgent?.slice(0, 300) ?? null,
      expiresAt,
    },
  });
  return { token, expiresAt };
}

export async function setSessionCookie(token: string, expiresAt: Date) {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    // Lax so links from notification emails open signed in. Server actions
    // verify the Origin header and custom POST routes check it explicitly.
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function readSessionToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value;
}

/**
 * The ONE place where sessions are ended. Besides marking them revoked it tells
 * the live-chat server which sessions ended, so their open connections are
 * closed at once (a signed-out session must not keep chatting).
 */
async function endSessions(where: Prisma.SessionWhereInput): Promise<number> {
  const rows = await db.session.findMany({ where: { ...where, revokedAt: null }, select: { id: true } });
  if (!rows.length) return 0;
  const ids = rows.map((r) => r.id);
  await db.session.updateMany({ where: { id: { in: ids }, revokedAt: null }, data: { revokedAt: new Date() } });
  // Notification payloads are limited in size: send the ids in small batches.
  for (let i = 0; i < ids.length; i += 100) await publishRealtime(db, { t: "sessions.ended", sessionIds: ids.slice(i, i + 100) });
  return ids.length;
}

export async function revokeSessionByToken(token: string | undefined) {
  if (!token) return;
  await endSessions({ tokenHash: sha256(token) });
}

/** Ends one session of a user ("sign out this device" on the security page). */
export async function revokeSessionById(userId: string, sessionId: string): Promise<number> {
  return endSessions({ id: sessionId, userId });
}

/** Revokes every session of a user, optionally keeping one. Returns the number revoked. */
export async function revokeUserSessions(userId: string, exceptSessionId?: string): Promise<number> {
  return endSessions({ userId, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) });
}

export async function userAgent(): Promise<string | null> {
  return (await headers()).get("user-agent");
}
