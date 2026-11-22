/**
 * Regression tests for the corrective implementation plan: accounts and sign-in.
 * P1-5: two-step verification setup; P0-1: command-line administrator tools.
 */
import { Secret, TOTP } from "otpauth";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import { SESSION_COOKIE } from "@/lib/auth/constants";
import { createSession } from "@/lib/auth/session";
import { lookupSession } from "@/lib/auth/session-core";
import { verifyPassword } from "@/lib/auth/password";
import { confirmTotpAction, startTotpAction } from "@/app/account/actions";
import { createOrResetAdmin, resetTwoStepVerification } from "@/ops/admin-accounts";
import { cookieJar, createMember, createUser, PASSWORD, resetDb } from "./helpers";

beforeEach(async () => {
  await resetDb();
  cookieJar.clear();
});
afterAll(async () => {
  await db.$disconnect();
});

const redirectOf = async (p: Promise<unknown>) => decodeURIComponent(await p.then(() => "returned").catch((e: Error) => e.message));
const codeFor = (secret: string) => new TOTP({ secret: Secret.fromBase32(secret), digits: 6, period: 30 }).generate();
const form = (data: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(data)) fd.set(k, v);
  return fd;
};
/** Signs in for code that reads the session cookie and returns the session row id. */
async function signInAs(userId: string, role: "OWNER" | "ADMIN" | "MEMBER", opts: { minutesAgo?: number } = {}) {
  const s = await createSession(userId, role, { mfaVerified: true });
  cookieJar.set(SESSION_COOKIE, s.token);
  const info = (await lookupSession(db, s.token))!;
  if (opts.minutesAgo) await db.session.update({ where: { id: info.sessionId }, data: { reauthAt: new Date(Date.now() - opts.minutesAgo * 60_000) } });
  return { token: s.token, sessionId: info.sessionId };
}

describe("P1-5: setting up two-step verification needs a recent proof of identity", () => {
  it("a session whose password confirmation is old is sent to confirm identity; nothing is changed", async () => {
    const owner = await createUser({ email: "owner@example.test" });
    await signInAs(owner.id, "OWNER", { minutesAgo: 30 });
    expect(await redirectOf(startTotpAction())).toBe("REDIRECT:/account/confirm?next=/account/security");
    const u = await db.user.findUniqueOrThrow({ where: { id: owner.id } });
    expect(u.totpPendingEnc).toBeNull();
    expect(u.totpEnabledAt).toBeNull();
  });

  it("confirming the code with an old confirmation asks for the password and returns to the same step", async () => {
    const owner = await createUser({ email: "owner@example.test" });
    const { sessionId } = await signInAs(owner.id, "OWNER");
    expect(await redirectOf(startTotpAction())).toBe("REDIRECT:/account/security?setup=1");
    const secret = decryptSecret((await db.user.findUniqueOrThrow({ where: { id: owner.id } })).totpPendingEnc!);
    await db.session.update({ where: { id: sessionId }, data: { reauthAt: new Date(Date.now() - 30 * 60_000) } });
    expect(await redirectOf(confirmTotpAction(undefined, form({ code: codeFor(secret) })))).toBe("REDIRECT:/account/confirm?next=/account/security?setup=1");
    expect((await db.user.findUniqueOrThrow({ where: { id: owner.id } })).totpEnabledAt).toBeNull();
  });

  it("right after signing in it works, and every other session of the account is ended", async () => {
    const owner = await createUser({ email: "owner@example.test" });
    const older = await createSession(owner.id, "OWNER", { mfaVerified: true });
    const { token } = await signInAs(owner.id, "OWNER");
    await redirectOf(startTotpAction());
    const secret = decryptSecret((await db.user.findUniqueOrThrow({ where: { id: owner.id } })).totpPendingEnc!);
    expect(await redirectOf(confirmTotpAction(undefined, form({ code: codeFor(secret) })))).toBe("REDIRECT:/account/security?codes=1");
    expect((await db.user.findUniqueOrThrow({ where: { id: owner.id } })).totpEnabledAt).not.toBeNull();
    expect(await lookupSession(db, older.token)).toBeNull(); // opened before the setup: ended
    expect(await lookupSession(db, token)).not.toBeNull(); // the device that did the setup stays signed in
    expect(await db.recoveryCode.count({ where: { userId: owner.id } })).toBe(10);
  });
});

describe("P1-5 / P0-1: command-line administrator tools", () => {
  it("resetting two-step verification removes it, ends the sessions, keeps the password and is audited", async () => {
    const admin = await createUser({ email: "admin@example.test", role: "ADMIN", totp: true });
    await db.recoveryCode.create({ data: { userId: admin.id, codeHash: "x" } });
    const s = await createSession(admin.id, "ADMIN", { mfaVerified: true });
    const res = await resetTwoStepVerification(db, "Admin@Example.test");
    expect(res.ok).toBe(true);
    const u = await db.user.findUniqueOrThrow({ where: { id: admin.id } });
    expect([u.totpEnabledAt, u.totpSecretEnc, u.totpPendingEnc]).toEqual([null, null, null]);
    expect(await verifyPassword(PASSWORD, u.passwordHash!)).toBe(true);
    expect(await db.recoveryCode.count({ where: { userId: admin.id } })).toBe(0);
    expect(await lookupSession(db, s.token)).toBeNull();
    expect(await db.auditLog.count({ where: { action: "admin.2fa_reset_cli", entityId: admin.id } })).toBe(1);
    expect((await resetTwoStepVerification(db, "admin@example.test")).ok).toBe(false); // nothing left to reset
    expect((await resetTwoStepVerification(db, "nobody@example.test")).ok).toBe(false);
  });

  it("creates a new owner, and resets the password of an existing administrator without changing the role", async () => {
    expect(await createOrResetAdmin(db, { email: "Founder@Example.test", name: "Founder", password: "a-long-password-123" })).toMatchObject({ ok: true });
    const created = await db.user.findUniqueOrThrow({ where: { email: "founder@example.test" } });
    expect(created).toMatchObject({ role: "OWNER", status: "ACTIVE", totpEnabledAt: null });
    expect(created.emailVerifiedAt).not.toBeNull();

    const admin = await createUser({ email: "admin@example.test", role: "ADMIN", totp: true });
    const s = await createSession(admin.id, "ADMIN", { mfaVerified: true });
    expect(await createOrResetAdmin(db, { email: "admin@example.test", password: "another-long-password-456" })).toMatchObject({ ok: true });
    const after = await db.user.findUniqueOrThrow({ where: { id: admin.id } });
    expect(after.role).toBe("ADMIN"); // was silently turned into OWNER before
    expect(await verifyPassword("another-long-password-456", after.passwordHash!)).toBe(true);
    expect(await lookupSession(db, s.token)).toBeNull();
  });

  it("never gives an existing account more power without the explicit flag", async () => {
    const member = await createMember("Mia");
    const admin = await createUser({ email: "admin@example.test", role: "ADMIN", totp: true, status: "SUSPENDED" });
    const password = "a-long-password-123";

    const refusedMember = await createOrResetAdmin(db, { email: member.email, password });
    expect(refusedMember).toMatchObject({ ok: false, error: expect.stringContaining("--promote") });
    const refusedRole = await createOrResetAdmin(db, { email: "admin@example.test", role: "OWNER", password });
    expect(refusedRole).toMatchObject({ ok: false, error: expect.stringContaining("--promote") });
    const refusedSuspended = await createOrResetAdmin(db, { email: "admin@example.test", password });
    expect(refusedSuspended).toMatchObject({ ok: false, error: expect.stringContaining("reactivate") });
    expect(await db.user.findUniqueOrThrow({ where: { id: member.id } })).toMatchObject({ role: "MEMBER" });
    expect(await db.user.findUniqueOrThrow({ where: { id: admin.id } })).toMatchObject({ role: "ADMIN", status: "SUSPENDED" });
    expect(await verifyPassword(PASSWORD, (await db.user.findUniqueOrThrow({ where: { id: member.id } })).passwordHash!)).toBe(true);

    expect(await createOrResetAdmin(db, { email: member.email, role: "ADMIN", password, promote: true })).toMatchObject({ ok: true });
    expect(await db.user.findUniqueOrThrow({ where: { id: member.id } })).toMatchObject({ role: "ADMIN" });
  });

  it("rejects weak passwords and invalid input", async () => {
    expect((await createOrResetAdmin(db, { email: "x@example.test", password: "short" })).ok).toBe(false);
    expect((await createOrResetAdmin(db, { email: "not-an-address", password: "a-long-password-123" })).ok).toBe(false);
    expect(await db.user.count()).toBe(0);
  });
});
