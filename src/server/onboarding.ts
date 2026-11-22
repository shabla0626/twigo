import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { siteUrl } from "@/lib/env";
import { deliverTemplate, type SendResult } from "@/lib/email";
import { rateLimit } from "@/lib/rate-limit";
import { TOKEN_TTL_HOURS } from "@/lib/auth/constants";
import { hashPassword, passwordPolicyError, simulatePasswordCheck } from "@/lib/auth/password";
import { logger } from "@/lib/logger";
import { grantAcceptedMembership } from "./membership-grant";
import { revokeUserSessions } from "@/lib/auth/session";
import { consumeToken, describeTtl, issueToken } from "@/lib/auth/tokens";
import { PRIVACY_NOTICE_VERSION } from "@/lib/validation/application";
import { registerSchema } from "@/lib/validation/account";

export const TERMS_VERSION = PRIVACY_NOTICE_VERSION;
/** Minimum time between two verification emails for the same account. */
export const RESEND_COOLDOWN_SECONDS = 60;

type FieldErrors = Record<string, string[] | undefined>;

export type RegisterResult =
  | { ok: true; email: string; mailStatus: SendResult["status"] | "skipped" }
  | { ok: false; error?: string; fieldErrors?: FieldErrors };

/**
 * Creates a free account (name, email, password, consent). The response is
 * the same whether or not the address already has an account, so the form
 * cannot be used to find out who is registered: in that case the owner of
 * the address gets an email saying they already have an account.
 */
export async function registerAccount(raw: unknown, ctx: { ipHash: string }): Promise<RegisterResult> {
  const parsed = registerSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  const { fullName, email, password } = parsed.data;
  const policy = passwordPolicyError(password);
  if (policy) return { ok: false, fieldErrors: { password: [policy] } };
  if (!rateLimit(`register:ip:${ctx.ipHash}`, 10, 60 * 60_000).ok || !rateLimit(`register:email:${email}`, 5, 60 * 60_000).ok)
    return { ok: false, error: "Too many attempts. Please wait a while and try again." };

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    await simulatePasswordCheck();
    const res = await deliverTemplate(
      "account_exists",
      email,
      { name: existing.name, signInLink: siteUrl("/login"), resetLink: siteUrl("/forgot-password") },
      { userId: existing.id },
    );
    return { ok: true, email, mailStatus: res.status };
  }

  const passwordHash = await hashPassword(password);
  const now = new Date();
  const user = await db.user
    .create({
      data: {
        email,
        name: fullName,
        role: "MEMBER",
        status: "ACTIVE",
        passwordHash,
        passwordChangedAt: now,
        termsAcceptedAt: now,
        termsVersion: TERMS_VERSION,
      },
    })
    .catch((err: unknown) => {
      // Two simultaneous sign-ups with the same address: the database keeps exactly one.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return null;
      throw err;
    });
  if (!user) return { ok: true, email, mailStatus: "skipped" };
  await audit(user.id, "account.registered", "User", user.id);
  const res = await sendVerificationEmail(user.id, { ignoreCooldown: true });
  return { ok: true, email, mailStatus: res.ok ? res.mailStatus : "skipped" };
}

export type VerificationSend = { ok: true; mailStatus: SendResult["status"]; error?: string } | { ok: false; reason: "cooldown" | "verified" | "unavailable"; retryInSeconds?: number };

/** Issues a fresh verification link (older links stop working) and emails it. */
export async function sendVerificationEmail(userId: string, opts: { ignoreCooldown?: boolean } = {}): Promise<VerificationSend> {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || user.status !== "ACTIVE") return { ok: false, reason: "unavailable" };
  if (user.emailVerifiedAt) return { ok: false, reason: "verified" };
  const lastMail = await db.emailDelivery.findFirst({ where: { userId, templateKey: "account_verification" }, orderBy: { createdAt: "desc" }, select: { status: true } });
  const lastMailFailed = Boolean(lastMail && !["ACCEPTED", "DELIVERED", "CAPTURED_LOCALLY"].includes(lastMail.status));
  if (!opts.ignoreCooldown && !lastMailFailed) {
    const last = await db.accountToken.findFirst({ where: { userId, kind: "VERIFY_EMAIL" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
    const wait = last ? RESEND_COOLDOWN_SECONDS - Math.floor((Date.now() - last.createdAt.getTime()) / 1000) : 0;
    if (wait > 0) return { ok: false, reason: "cooldown", retryInSeconds: wait };
  }
  if (!opts.ignoreCooldown && !rateLimit(`verify-send:${userId}`, 8, 60 * 60_000).ok) return { ok: false, reason: "cooldown", retryInSeconds: 600 };
  const { token } = await issueToken(userId, "VERIFY_EMAIL", { email: user.email });
  const res = await deliverTemplate(
    "account_verification",
    user.email,
    { name: user.name, verifyLink: siteUrl(`/verify-email/${token}`), expiresIn: describeTtl(TOKEN_TTL_HOURS.VERIFY_EMAIL) },
    { userId },
  );
  return { ok: true, mailStatus: res.status, error: res.status === "sent" ? undefined : res.error };
}

/** "Resend" from the public check-your-email page. Always answers the same way. */
export async function resendVerificationByEmail(emailRaw: string, ipHash: string): Promise<{ message: string; done: Promise<void> }> {
  const email = emailRaw.trim().toLowerCase();
  const message = "If that address has an account waiting for confirmation, we sent a new link. You can ask again after one minute.";
  // Same work before answering for every address; the email is sent afterwards (see requestPasswordReset).
  const allowed = rateLimit(`verify-public:${ipHash}`, 10, 60 * 60_000).ok;
  const user = await db.user.findUnique({ where: { email } });
  await simulatePasswordCheck();
  if (!allowed || !user || user.emailVerifiedAt) return { message, done: Promise.resolve() };
  const done = sendVerificationEmail(user.id)
    .then(() => undefined)
    .catch((err) => logger.error("auth.verification_email_failed", { err }));
  return { message, done };
}

/**
 * Before the address is confirmed, the signed-in person may correct a typo.
 * The new address must not belong to another account; a new link is sent to it.
 */
export async function changeUnverifiedEmail(userId: string, newEmailRaw: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const email = newEmailRaw.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254) return { ok: false, error: "Please enter a valid email address." };
  if (!rateLimit(`verify-change:${userId}`, 5, 60 * 60_000).ok) return { ok: false, error: "Too many changes. Please wait a while and try again." };
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.emailVerifiedAt) return { ok: false, error: "Your email address is already confirmed. Change it in Account Settings." };
  if (email === user.email) return { ok: false, error: "That is already the address on your account." };
  const updated = await db.user.update({ where: { id: userId }, data: { email } }).catch((err: unknown) => {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return null;
    throw err;
  });
  if (!updated) return { ok: false, error: "That address cannot be used. Please enter a different one." };
  await audit(userId, "account.email_corrected_before_verification", "User", userId);
  await sendVerificationEmail(userId, { ignoreCooldown: true });
  return { ok: true };
}

export type VerifyResult =
  | { ok: true; kind: "registration"; userId: string; role: Prisma.UserGetPayload<object>["role"]; membershipGranted: boolean }
  | { ok: true; kind: "change"; userId: string }
  | { ok: false; error: string };

/**
 * Consumes a link from an email. The token is single-use, time-limited, stored
 * only as a hash, and bound to one account AND one address: a link for an old
 * address cannot verify a new one.
 * - Registration links confirm the account's current address.
 * - Email-change links move the account to the new, confirmed address.
 */
export async function verifyEmailToken(token: string): Promise<VerifyResult> {
  const res = await db.$transaction(async (tx) => {
    const t = await consumeToken(tx, token, "VERIFY_EMAIL");
    if (!t.ok)
      return {
        ok: false as const,
        error: t.reason === "expired" ? "This link has expired. Sign in and ask for a new one." : "This link is not valid or was already used. If your email is confirmed, just sign in.",
      };
    const user = await tx.user.findUniqueOrThrow({ where: { id: t.userId } });
    if (user.status !== "ACTIVE") return { ok: false as const, error: "This account cannot be confirmed. Please contact the organization." };
    if (t.email && t.email === user.email) {
      await tx.user.update({ where: { id: user.id }, data: { emailVerifiedAt: user.emailVerifiedAt ?? new Date() } });
      const linkedGrant = await linkLegacyApplicant(tx, user.id, user.email);
      // An application accepted before the address was confirmed gives access now.
      const granted = linkedGrant || (await grantAcceptedMembership(tx, user.id, { reason: "email confirmed" }));
      return { ok: true as const, kind: "registration" as const, userId: user.id, role: user.role, membershipGranted: granted };
    }
    if (!t.email) return { ok: false as const, error: "This link is not valid." };
    const taken = await tx.user.findUnique({ where: { email: t.email } });
    if (taken) return { ok: false as const, error: "That email address is already in use." };
    // The application record carries the address too, and addresses are unique there. If an
    // earlier application of someone else already uses the new address, changing it would fail
    // inside the database and undo everything, so it is refused here with a clear answer.
    // (An earlier application without an account has no userId: it must count as "someone else" too.)
    const clash = await tx.applicant.findFirst({ where: { email: t.email, OR: [{ userId: null }, { userId: { not: user.id } }] }, select: { id: true } });
    if (clash) return { ok: false as const, error: "That email address is already used by an earlier application. Your address was not changed. Please contact the organization." };
    await tx.user.update({ where: { id: user.id }, data: { email: t.email, emailVerifiedAt: new Date() } });
    await tx.applicant.updateMany({ where: { userId: user.id }, data: { email: t.email } });
    await grantAcceptedMembership(tx, user.id, { reason: "email confirmed" });
    return { ok: true as const, kind: "change" as const, userId: user.id };
  });
  if (res.ok) await audit(res.userId, res.kind === "registration" ? "account.email_verified" : "account.email_changed", "User", res.userId);
  if (res.ok && res.kind === "change") await revokeUserSessions(res.userId);
  return res;
}

/**
 * Applications made before accounts existed are stored by email address.
 * Once someone PROVES they own that address (by opening the verification
 * link), the application is connected to their account. Typing an address is
 * never enough. If that application was already accepted by an administrator,
 * membership is granted now (the decision was already made).
 */
async function linkLegacyApplicant(tx: Prisma.TransactionClient, userId: string, email: string): Promise<boolean> {
  const already = await tx.applicant.findUnique({ where: { userId } });
  if (already) return false;
  const legacy = await tx.applicant.findFirst({
    where: { email, userId: null },
    include: { applications: { orderBy: { createdAt: "desc" }, take: 1 }, participant: { select: { id: true, user: { select: { id: true } } } } },
  });
  if (!legacy) return false;
  await tx.applicant.update({ where: { id: legacy.id }, data: { userId } });
  if (legacy.applications[0]?.status !== "ACCEPTED") return false;
  const participantFree = legacy.participant && (!legacy.participant.user || legacy.participant.user.id === userId);
  const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
  await tx.user.update({
    where: { id: userId },
    data: {
      membershipStatus: "ACTIVE",
      membershipChangedAt: new Date(),
      ...(participantFree && !user.participantId ? { participantId: legacy.participant!.id } : {}),
    },
  });
  await tx.memberProfile.upsert({ where: { userId }, create: { userId, displayName: user.name.slice(0, 60) }, update: {} });
  await tx.auditLog.create({ data: { actorId: userId, action: "membership.granted_previously_accepted", entityType: "User", entityId: userId } });
  return true;
}
