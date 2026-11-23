import "server-only";
import type { User } from "@prisma/client";
import { db } from "../db";
import { audit } from "../audit";
import { decryptSecret } from "../crypto";
import { rateLimit, rateLimitReached } from "../rate-limit";
import { hashPassword, needsRehash, simulatePasswordCheck, verifyPassword } from "./password";
import { LOCKOUT_MINUTES, MAX_FAILED_LOGINS } from "./constants";
import { createSession } from "./session";
import { hashRecoveryCode, verifyTotp } from "./totp";
import { lookupSession } from "./session-core";

export type LoginResult =
  | { ok: true; token: string; expiresAt: Date; stage: "done" | "mfa"; role: User["role"] }
  | { ok: false; error: string };

const GENERIC = "Invalid email or password.";

/**
 * After MAX_FAILED_LOGINS wrong passwords (or wrong two-step codes) for one
 * account FROM ONE NETWORK, further attempts for that account from that
 * network are refused for LOCKOUT_MINUTES. The refusal looks exactly like a
 * wrong password, so it does not reveal that the account exists, and it is
 * tied to the network, so one outsider cannot lock out a person who signs in
 * from somewhere else.
 */
const failKey = (email: string, ipHash: string) => `login:fail:${email}:${ipHash}`;
const FAIL_WINDOW_MS = LOCKOUT_MINUTES * 60_000;
/** Backstop against guessing one account from many networks at once. */
const ACCOUNT_CEILING = 50;

/**
 * Password step for every account type. Applies per-IP and per-account rate
 * limits, lockout after repeated failures, and equalized timing for unknown
 * accounts. Accounts with 2FA get a short-lived "mfa pending" session that
 * can only be used to complete the second factor.
 */
export async function authenticate(
  emailRaw: string,
  password: string,
  ctx: { ipHash: string; userAgent?: string | null },
): Promise<LoginResult> {
  const email = emailRaw.trim().toLowerCase();
  const ipLimit = rateLimit(`login:ip:${ctx.ipHash}`, 20, 15 * 60_000);
  if (!ipLimit.ok) return { ok: false, error: "Too many attempts. Please wait and try again." };
  // Locked for this account from this network: answered like a wrong password, after the same amount of work.
  if (rateLimitReached(failKey(email, ctx.ipHash), MAX_FAILED_LOGINS)) {
    await simulatePasswordCheck(password);
    return { ok: false, error: GENERIC };
  }
  if (!rateLimit(`login:acct:${email}`, ACCOUNT_CEILING, 15 * 60_000).ok) return { ok: false, error: "Too many attempts. Please wait and try again." };

  const user = await db.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash) {
    await simulatePasswordCheck(password);
    rateLimit(failKey(email, ctx.ipHash), MAX_FAILED_LOGINS, FAIL_WINDOW_MS); // unknown addresses lock the same way
    return { ok: false, error: GENERIC };
  }
  // A lock set by an earlier version of the site (stored on the account) is still honoured until it runs out.
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await simulatePasswordCheck(password);
    return { ok: false, error: GENERIC };
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    const nowLocked = !rateLimit(failKey(email, ctx.ipHash), MAX_FAILED_LOGINS, FAIL_WINDOW_MS).remaining;
    await db.user.update({ where: { id: user.id }, data: { failedLogins: { increment: 1 } } });
    await audit(user.id, nowLocked ? "auth.locked" : "auth.login_failed", "User", user.id);
    return { ok: false, error: GENERIC };
  }

  // Status is only revealed after a correct password.
  if (user.status === "SUSPENDED") return { ok: false, error: "This account is suspended. Please contact the administrators." };
  if (user.status !== "ACTIVE") return { ok: false, error: GENERIC };

  // Upgrade older password hashes (bcrypt) to the current scheme while we know the password.
  const upgraded = needsRehash(user.passwordHash) ? await hashPassword(password) : undefined;
  await db.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null, ...(upgraded ? { passwordHash: upgraded } : {}) } });

  if (user.totpEnabledAt && user.totpSecretEnc) {
    const s = await createSession(user.id, user.role, { mfaPending: true, ...ctx });
    return { ok: true, token: s.token, expiresAt: s.expiresAt, stage: "mfa", role: user.role };
  }
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await audit(user.id, "auth.login", "User", user.id);
  const s = await createSession(user.id, user.role, ctx);
  return { ok: true, token: s.token, expiresAt: s.expiresAt, stage: "done", role: user.role };
}

export type MfaResult = { ok: true; token: string; expiresAt: Date; role: User["role"] } | { ok: false; error: string; restart?: boolean };

/**
 * Second step. Accepts a 6-digit TOTP code or a single-use recovery code.
 * On success the pending session is revoked and a full session is issued
 * (new token, so a token seen before 2FA can never become fully authenticated).
 */
export async function completeSecondFactor(
  pendingToken: string | undefined,
  code: string,
  ctx: { ipHash: string; userAgent?: string | null },
): Promise<MfaResult> {
  const pending = await lookupSession(db, pendingToken);
  if (!pending || !pending.mfaPending) return { ok: false, error: "Your sign-in expired. Please start again.", restart: true };

  const limit = rateLimit(`mfa:${pending.sessionId}`, 5, 10 * 60_000);
  if (!limit.ok) {
    await db.session.update({ where: { id: pending.sessionId }, data: { revokedAt: new Date() } });
    return { ok: false, error: "Too many incorrect codes. Please sign in again.", restart: true };
  }

  const user = await db.user.findUnique({ where: { id: pending.user.id } });
  if (!user || user.status !== "ACTIVE" || !user.totpSecretEnc) return { ok: false, error: "Sign-in is not possible.", restart: true };

  let method: "totp" | "recovery" | null = null;
  if (/^\s*\d{3}\s?\d{3}\s*$/.test(code)) {
    if (verifyTotp(decryptSecret(user.totpSecretEnc), code, user.id)) method = "totp";
  } else {
    const hash = hashRecoveryCode(code);
    const used = await db.recoveryCode.updateMany({ where: { userId: user.id, codeHash: hash, usedAt: null }, data: { usedAt: new Date() } });
    if (used.count === 1) method = "recovery";
  }
  if (!method) {
    // Wrong codes count like wrong passwords (same account, same network).
    rateLimit(failKey(user.email, ctx.ipHash), MAX_FAILED_LOGINS, FAIL_WINDOW_MS);
    await audit(user.id, "auth.mfa_failed", "User", user.id);
    return { ok: false, error: "That code is not valid. Try again." };
  }

  await db.session.update({ where: { id: pending.sessionId }, data: { revokedAt: new Date() } });
  const s = await createSession(user.id, user.role, { ...ctx, mfaVerified: true });
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await audit(user.id, method === "recovery" ? "auth.login_recovery_code" : "auth.login", "User", user.id, { mfa: true });
  return { ok: true, token: s.token, expiresAt: s.expiresAt, role: user.role };
}
