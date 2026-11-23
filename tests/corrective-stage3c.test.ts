/**
 * Regression tests for the corrective implementation plan, Stage 3 (low-priority findings).
 * P3-16: leftovers of the earlier invitation flow are gone, and what remains cannot bring back a blocked account.
 * P3-17: a confirmation link is not a way around two-step verification; the address is not in the page address.
 * P3-19: one email rule, limited password-change attempts, idle sign-out for administrators.
 */
import { existsSync, readFileSync } from "node:fs";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { ADMIN_IDLE_MINUTES, PENDING_EMAIL_COOKIE, SESSION_COOKIE } from "@/lib/auth/constants";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { createSession } from "@/lib/auth/session";
import { lookupSession } from "@/lib/auth/session-core";
import { issueToken } from "@/lib/auth/tokens";
import { registerSchema } from "@/lib/validation/account";
import { loginSchema } from "@/lib/validation/admin";
import { contactSchema } from "@/lib/validation/contact";
import { normalizeEmail } from "@/lib/validation/email";
import { createOrResetAdmin } from "@/ops/admin-accounts";
import { changePassword, inviteAdministrator, requestEmailChange, sendInvitation } from "@/server/accounts";
import { updateApplicationStatus } from "@/server/admin/applications";
import { authorizeDownload, storeUpload } from "@/server/community/files";
import { changeUnverifiedEmail } from "@/server/onboarding";
import { registerAction, verifyEmailAction } from "@/app/(auth)/actions";
import { PASSWORD, cookieJar, createLegacyApplication, createMember, createUser, resetDb } from "./helpers";

beforeEach(async () => {
  await resetDb();
  cookieJar.clear();
});
afterAll(async () => {
  await db.$disconnect();
});

const form = (data: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(data)) fd.set(k, v);
  return fd;
};
const redirectOf = async (p: Promise<unknown>) => p.then(() => "").catch((e: Error) => (e.message.startsWith("REDIRECT:") ? e.message.slice(9) : Promise.reject(e)));

describe("P3-19: one rule for email addresses", () => {
  const SAMPLES = ["Ada@Example.Test", "  ada.lovelace+work@example.co.uk ", "a@b", "a@b.c", "a b@c.de", "a@@b.de", "ada@", "@example.test", "ada@example", "ada@exa mple.test", "", "x".repeat(250) + "@example.test"];

  it("every form and tool accepts exactly the same addresses", async () => {
    const owner = await createUser({ email: "owner@example.test", totp: true });
    const fresh = await db.user.create({ data: { email: "fresh@example.test", name: "Fresh", role: "MEMBER", status: "ACTIVE", passwordHash: "x" } });
    for (const sample of SAMPLES) {
      const expected = normalizeEmail(sample) !== null;
      const base = { fullName: "Ada Example", password: "a-strong-password-1", confirm: "a-strong-password-1", acceptTerms: true, acceptGuidelines: true, ackPrivacy: true };
      expect(registerSchema.safeParse({ ...base, email: sample }).success, `sign-up: ${sample}`).toBe(expected);
      expect(loginSchema.safeParse({ email: sample, password: "x" }).success, `sign-in: ${sample}`).toBe(expected);
      expect(contactSchema.shape.email.safeParse(sample).success, `contact: ${sample}`).toBe(expected);
      if (!expected) {
        expect((await inviteAdministrator(owner.id, sample, "New Admin", "ADMIN")).ok, `invite: ${sample}`).toBe(false);
        expect((await requestEmailChange(owner.id, sample)).message, `change: ${sample}`).toBe("Enter a valid email address.");
        expect(await changeUnverifiedEmail(fresh.id, sample), `typo fix: ${sample}`).toEqual({ ok: false, error: "Please enter a valid email address." });
        expect((await createOrResetAdmin(db, { email: sample, password: "a-strong-password-1" })).ok, `command line: ${sample}`).toBe(false);
      }
    }
    // Nothing was created or changed by the refused addresses.
    expect(await db.user.count()).toBe(2);
    expect(normalizeEmail("Ada@Example.Test")).toBe("ada@example.test");
    expect(normalizeEmail(undefined)).toBeNull();
    expect(normalizeEmail(42)).toBeNull();
  });

  it("no hand-written address pattern is left in the account code", () => {
    for (const f of ["src/server/accounts.ts", "src/server/onboarding.ts", "src/ops/admin-accounts.ts"]) {
      expect(readFileSync(f, "utf8"), f).not.toContain("[^@\\s]+@");
    }
  });
});

describe("P3-19: password change attempts are limited", () => {
  it("after five wrong attempts even the right password is refused for a while", async () => {
    const m = await createMember("Pat");
    const s = await db.session.create({ data: { userId: m.id, tokenHash: "t", expiresAt: new Date(Date.now() + 3600_000) } });
    for (let i = 0; i < 5; i++) {
      expect(await changePassword(m.id, s.id, "wrong-password", "a-new-strong-password-1")).toEqual({ ok: false, error: "Your current password is incorrect." });
    }
    const blocked = await changePassword(m.id, s.id, PASSWORD, "a-new-strong-password-1");
    expect(blocked).toEqual({ ok: false, error: "Too many attempts. Please wait 15 minutes and try again." });
    // The limit is per account: someone else is not affected.
    const other = await createMember("Quinn");
    const s2 = await db.session.create({ data: { userId: other.id, tokenHash: "t2", expiresAt: new Date(Date.now() + 3600_000) } });
    expect((await changePassword(other.id, s2.id, PASSWORD, "a-new-strong-password-1")).ok).toBe(true);
  });
});

describe("P3-19: an idle administrator is signed out", () => {
  const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000);
  async function sessionFor(role: "OWNER" | "ADMIN" | "MEMBER", idleMinutes: number) {
    const u = role === "MEMBER" ? await createMember(`M${idleMinutes}`) : await createUser({ email: `${role.toLowerCase()}${idleMinutes}@example.test`, role, totp: true });
    const s = await createSession(u.id, role, { mfaVerified: true });
    const row = await db.session.findFirstOrThrow({ where: { userId: u.id } });
    await db.session.update({ where: { id: row.id }, data: { lastSeenAt: minutesAgo(idleMinutes) } });
    return { token: s.token, id: row.id };
  }

  it("an owner or administrator session unused for an hour ends; a member session does not", async () => {
    expect(ADMIN_IDLE_MINUTES).toBe(60);
    for (const role of ["OWNER", "ADMIN"] as const) {
      const idle = await sessionFor(role, 61);
      expect(await lookupSession(db, idle.token)).toBeNull();
      expect((await db.session.findUniqueOrThrow({ where: { id: idle.id } })).revokedAt).not.toBeNull();
      // Once ended it stays ended, also for a later request.
      expect(await lookupSession(db, idle.token)).toBeNull();
    }
    const member = await sessionFor("MEMBER", 600);
    expect(await lookupSession(db, member.token)).not.toBeNull();
  });

  it("activity keeps the session; a background connection does not count as activity", async () => {
    const active = await sessionFor("ADMIN", 30);
    // The realtime connection checks the session without refreshing "last seen".
    expect(await lookupSession(db, active.token, new Date(), { touch: false })).not.toBeNull();
    const before = (await db.session.findUniqueOrThrow({ where: { id: active.id } })).lastSeenAt;
    expect(Date.now() - before.getTime()).toBeGreaterThan(29 * 60_000);
    // A page request does refresh it.
    expect(await lookupSession(db, active.token)).not.toBeNull();
    const after = (await db.session.findUniqueOrThrow({ where: { id: active.id } })).lastSeenAt;
    expect(Date.now() - after.getTime()).toBeLessThan(60_000);
    expect(readFileSync("src/realtime/server.ts", "utf8")).toContain("{ touch: false }");
  });
});

describe("P3-17: confirmation links", () => {
  async function unconfirmed(opts: { role?: "MEMBER" | "ADMIN"; totp?: boolean } = {}) {
    const u = await createUser({ email: "new@example.test", role: opts.role ?? "MEMBER", totp: opts.totp });
    await db.user.update({ where: { id: u.id }, data: { emailVerifiedAt: null } });
    const { token } = await issueToken(u.id, "VERIFY_EMAIL", { email: u.email });
    return { u, token };
  }

  it("an ordinary new account is signed in by its confirmation link", async () => {
    const { u, token } = await unconfirmed();
    expect(await redirectOf(verifyEmailAction(undefined, form({ token })))).toBe("/continue?verified=1");
    expect(cookieJar.has(SESSION_COOKIE)).toBe(true);
    expect((await db.user.findUniqueOrThrow({ where: { id: u.id } })).emailVerifiedAt).not.toBeNull();
  });

  it("an account with two-step verification is confirmed but must sign in the normal way", async () => {
    const { u, token } = await unconfirmed({ totp: true });
    expect(await redirectOf(verifyEmailAction(undefined, form({ token })))).toBe("/login?confirmed=1");
    expect(cookieJar.has(SESSION_COOKIE)).toBe(false);
    expect(await db.session.count({ where: { userId: u.id } })).toBe(0);
    expect((await db.user.findUniqueOrThrow({ where: { id: u.id } })).emailVerifiedAt).not.toBeNull();
    expect(readFileSync("src/app/(auth)/login/page.tsx", "utf8")).toContain("sp.confirmed");
  });

  it("the same holds for an administrator, with or without two-step verification", async () => {
    const { u, token } = await unconfirmed({ role: "ADMIN" });
    expect(await redirectOf(verifyEmailAction(undefined, form({ token })))).toBe("/login?confirmed=1");
    expect(await db.session.count({ where: { userId: u.id } })).toBe(0);
  });

  it("after sign-up the address is not part of the page address", async () => {
    const to = await redirectOf(registerAction(undefined, form({ fullName: "Ada Example", email: "ada@example.test", password: "a-strong-password-1", confirm: "a-strong-password-1", acceptTerms: "on", acceptGuidelines: "on", ackPrivacy: "on" })));
    expect(to.startsWith("/verify-email?sent=1")).toBe(true);
    expect(to).not.toContain("ada");
    expect(to).not.toContain("email=");
    expect(cookieJar.get(PENDING_EMAIL_COOKIE)).toBe("ada@example.test");
    const page = readFileSync("src/app/(auth)/verify-email/page.tsx", "utf8");
    expect(page).not.toContain("sp.email");
    expect(page).toContain("PENDING_EMAIL_COOKIE");
  });
});

describe("P3-16: leftovers of the earlier invitation flow", () => {
  it("the unused pieces are gone", () => {
    expect(existsSync("src/app/admin/(panel)/applications/[id]/invite/page.tsx")).toBe(false);
    expect(readFileSync("src/app/admin/(panel)/members/[id]/page.tsx", "utf8")).not.toContain("Send a new invitation");
    expect(readFileSync("src/app/admin/actions/community.ts", "utf8")).not.toContain("sendInvitationAction");
    expect(readFileSync("src/server/accounts.ts", "utf8")).not.toContain("confirmEmailChange");
    expect((PERMISSIONS as readonly string[]).includes("finance.view")).toBe(false);
    expect(readFileSync("src/server/community/files.ts", "utf8")).not.toContain("IDEA_ATTACHMENT");
  });

  it("an idea attachment can neither be uploaded nor downloaded", async () => {
    const m = await createMember("Uma");
    expect(await storeUpload(m.id, { scope: "IDEA_ATTACHMENT", name: "a.png", bytes: Buffer.from("not empty") })).toEqual({ ok: false, error: "Invalid upload." });
    const f = await db.storedFile.create({ data: { ownerId: m.id, scope: "IDEA_ATTACHMENT", originalName: "a.png", mimeType: "image/png", size: 3, sha256: "x", storageKey: "none/a.png" } });
    expect(await authorizeDownload(m.id, f.id)).toBeNull();
  });

  it("an invitation can never bring back a suspended or deactivated account", async () => {
    const owner = await createUser({ email: "owner@example.test", totp: true });
    for (const status of ["SUSPENDED", "DEACTIVATED"] as const) {
      const blocked = await createUser({ email: `${status.toLowerCase()}@example.test`, role: "MEMBER", status });
      const res = await inviteAdministrator(owner.id, blocked.email, "Back Again", "ADMIN");
      expect(res.ok).toBe(false);
      const after = await db.user.findUniqueOrThrow({ where: { id: blocked.id } });
      expect([after.status, after.role]).toEqual([status, "MEMBER"]);
    }
    // The older applicant invitation (kept only so that an old invitation email can be retried).
    const { application } = await createLegacyApplication("gone@example.test");
    await updateApplicationStatus(owner.id, application.id, "ACCEPTED");
    const gone = await createUser({ email: "gone@example.test", role: "MEMBER", status: "SUSPENDED" });
    const res = await sendInvitation(owner.id, application.id, { subject: "Activate", body: "{{activationLink}}" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("suspended or deactivated");
    expect((await db.user.findUniqueOrThrow({ where: { id: gone.id } })).status).toBe("SUSPENDED");
    expect(await db.accountToken.count({ where: { userId: gone.id } })).toBe(0);
    expect(await db.emailDelivery.count({ where: { to: "gone@example.test" } })).toBe(0);
  });
});
