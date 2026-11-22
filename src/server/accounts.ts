import "server-only";
import type { CommunityMembership, UserRole } from "@prisma/client";
import { brand } from "@/config/brand";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { siteUrl } from "@/lib/env";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { deliver, deliverTemplate, renderEmail } from "@/lib/email";
import { publishRealtime } from "@/lib/realtime-events";
import { rateLimit } from "@/lib/rate-limit";
import { TOKEN_TTL_HOURS } from "@/lib/auth/constants";
import { hashPassword, passwordPolicyError, simulatePasswordCheck, verifyPassword } from "@/lib/auth/password";
import { revokeUserSessions } from "@/lib/auth/session";
import { consumeToken, describeTtl, issueToken } from "@/lib/auth/tokens";
import { generateRecoveryCodes, generateTotpSecret, hashRecoveryCode, totpSetupData, verifyTotp } from "@/lib/auth/totp";

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const LINK_PLACEHOLDER = "{{activationLink}}";

// ---------------------------------------------------------------- invitations

export type InvitationTarget = { userId: string | null; email: string; name: string; alreadyActive: boolean };

/** Who an invitation for this application would go to (no side effects). */
export async function invitationTarget(applicationId: string): Promise<Result<{ target: InvitationTarget }>> {
  const app = await db.application.findUnique({
    where: { id: applicationId },
    select: { status: true, applicant: { select: { email: true, fullName: true } }, participant: { select: { id: true, user: true } } },
  });
  if (!app) return { ok: false, error: "Application not found." };
  if (app.status !== "ACCEPTED" || !app.participant) return { ok: false, error: "Only accepted applicants can be invited." };
  const existing = app.participant.user ?? (await db.user.findUnique({ where: { email: app.applicant.email } }));
  return {
    ok: true,
    target: {
      userId: existing?.id ?? null,
      email: app.applicant.email,
      name: app.applicant.fullName,
      alreadyActive: existing?.status === "ACTIVE",
    },
  };
}

/** The editable invitation draft shown to the admin before sending. */
export async function invitationDraft(name: string) {
  return renderEmail("account_invitation", {
    name,
    activationLink: LINK_PLACEHOLDER,
    expiresIn: describeTtl(TOKEN_TTL_HOURS.INVITE),
  });
}

/**
 * Creates (or reuses) the member account for an accepted applicant, issues a
 * single-use activation token and emails it. The raw link is never shown to
 * the administrator. Sending is always an explicit admin action.
 */
export async function sendInvitation(
  adminId: string,
  applicationId: string,
  draft: { subject: string; body: string },
): Promise<Result<{ status: string }>> {
  if (!draft.body.includes(LINK_PLACEHOLDER)) return { ok: false, error: `The message must contain ${LINK_PLACEHOLDER}.` };
  const t = await invitationTarget(applicationId);
  if (!t.ok) return t;
  if (t.target.alreadyActive) return { ok: false, error: "This person already has an active member account." };

  const app = await db.application.findUniqueOrThrow({ where: { id: applicationId }, select: { participant: { select: { id: true } } } });
  const participantId = app.participant!.id;

  const { user, token } = await db.$transaction(async (tx) => {
    const other = await tx.user.findUnique({ where: { email: t.target.email } });
    if (other && other.participantId && other.participantId !== participantId) throw new Error("EMAIL_IN_USE");
    const user = other
      ? await tx.user.update({ where: { id: other.id }, data: { participantId, status: other.status === "ACTIVE" ? "ACTIVE" : "INVITED" } })
      : await tx.user.create({ data: { email: t.target.email, name: t.target.name, role: "MEMBER", status: "INVITED", participantId } });
    const issued = await issueToken(user.id, "INVITE", { createdById: adminId }, tx);
    return { user, token: issued.token };
  }).catch((err: Error) => {
    if (err.message === "EMAIL_IN_USE") return { user: null, token: "" };
    throw err;
  });
  if (!user) return { ok: false, error: "That email address belongs to a different account." };

  const link = siteUrl(`/activate/${token}`);
  const res = await deliver({
    to: user.email,
    subject: draft.subject,
    text: draft.body.split(LINK_PLACEHOLDER).join(link),
    templateKey: "account_invitation",
    sentById: adminId,
    applicationId,
    userId: user.id,
  });
  await audit(adminId, "member.invited", "User", user.id, { emailStatus: res.status });
  if (res.status === "sent") return { ok: true, status: "Invitation accepted by the email provider." };
  // Without a working email provider the invitation cannot reach the person.
  await db.accountToken.updateMany({ where: { userId: user.id, kind: "INVITE", usedAt: null }, data: { usedAt: new Date() } });
  return { ok: false, error: `The invitation was not sent. ${res.error}` };
}

// ---------------------------------------------------------------- activation

export async function activateAccount(
  token: string,
  input: { password: string; displayName: string },
): Promise<Result<{ userId: string; role: UserRole }>> {
  const policy = passwordPolicyError(input.password);
  if (policy) return { ok: false, error: policy };
  const displayName = input.displayName.trim();
  if (displayName.length < 2 || displayName.length > 60) return { ok: false, error: "Display name must be 2–60 characters." };
  const passwordHash = await hashPassword(input.password);

  const result = await db.$transaction(async (tx) => {
    const t = await consumeToken(tx, token, "INVITE");
    if (!t.ok) return { ok: false as const, error: t.reason === "expired" ? "This activation link has expired. Ask the organization for a new one." : "This activation link is not valid or was already used." };
    const user = await tx.user.findUniqueOrThrow({ where: { id: t.userId } });
    if (user.status === "SUSPENDED" || user.status === "DEACTIVATED") return { ok: false as const, error: "This account cannot be activated." };
    const now = new Date();
    await tx.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        status: "ACTIVE",
        emailVerifiedAt: now,
        passwordChangedAt: now,
        failedLogins: 0,
        lockedUntil: null,
        // Invitations were only ever sent to accepted applicants.
        ...(user.role === "MEMBER" ? { membershipStatus: "ACTIVE" as const, membershipChangedAt: now } : {}),
      },
    });
    await tx.memberProfile.upsert({ where: { userId: user.id }, create: { userId: user.id, displayName }, update: {} });
    return { ok: true as const, userId: user.id, role: user.role };
  });
  if (result.ok) await audit(result.userId, "member.activated", "User", result.userId);
  return result;
}

// ---------------------------------------------------------------- passwords

const RESET_SENT = "If an active account exists for that address, we sent a link to reset the password.";

export async function requestPasswordReset(emailRaw: string, ipHash: string): Promise<{ message: string }> {
  const email = emailRaw.trim().toLowerCase();
  const ok = rateLimit(`reset:ip:${ipHash}`, 10, 60 * 60_000).ok && rateLimit(`reset:acct:${email}`, 3, 60 * 60_000).ok;
  if (!ok) return { message: RESET_SENT };
  const user = await db.user.findUnique({ where: { email } });
  if (!user || user.status !== "ACTIVE" || !user.passwordHash) {
    await simulatePasswordCheck();
    return { message: RESET_SENT };
  }
  const { token } = await issueToken(user.id, "RESET_PASSWORD");
  await deliverTemplate(
    "password_reset",
    user.email,
    { name: user.name, resetLink: siteUrl(`/reset-password/${token}`), expiresIn: describeTtl(TOKEN_TTL_HOURS.RESET_PASSWORD) },
    { userId: user.id },
  );
  await audit(user.id, "auth.reset_requested", "User", user.id);
  return { message: RESET_SENT };
}

export async function resetPassword(token: string, password: string): Promise<Result> {
  const policy = passwordPolicyError(password);
  if (policy) return { ok: false, error: policy };
  const passwordHash = await hashPassword(password);
  const res = await db.$transaction(async (tx) => {
    const t = await consumeToken(tx, token, "RESET_PASSWORD");
    if (!t.ok) return { ok: false as const, error: "This reset link is not valid, expired or was already used." };
    const before = await tx.user.findUniqueOrThrow({ where: { id: t.userId }, select: { emailVerifiedAt: true } });
    await tx.user.update({
      where: { id: t.userId },
      // Opening the emailed link proves the person controls this address.
      data: { passwordHash, passwordChangedAt: new Date(), failedLogins: 0, lockedUntil: null, emailVerifiedAt: before.emailVerifiedAt ?? new Date() },
    });
    return { ok: true as const, userId: t.userId };
  });
  if (!res.ok) return res;
  await revokeUserSessions(res.userId);
  await publishRealtime(db, { t: "user.revoked", userId: res.userId });
  await audit(res.userId, "auth.password_reset", "User", res.userId);
  return { ok: true };
}

export async function changePassword(userId: string, sessionId: string, current: string, next: string): Promise<Result> {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user?.passwordHash || !(await verifyPassword(current, user.passwordHash))) return { ok: false, error: "Your current password is incorrect." };
  const policy = passwordPolicyError(next);
  if (policy) return { ok: false, error: policy };
  if (await verifyPassword(next, user.passwordHash)) return { ok: false, error: "Choose a password different from the current one." };
  await db.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(next), passwordChangedAt: new Date() } });
  const revoked = await revokeUserSessions(userId, sessionId);
  await audit(userId, "auth.password_changed", "User", userId, { otherSessionsRevoked: revoked });
  return { ok: true };
}

// ---------------------------------------------------------------- reauthentication

/** Confirms identity for sensitive actions (password, plus 2FA code when enabled). */
export async function confirmIdentity(userId: string, sessionId: string, password: string, code?: string): Promise<Result> {
  if (!rateLimit(`reauth:${sessionId}`, 5, 10 * 60_000).ok) return { ok: false, error: "Too many attempts. Please wait a few minutes." };
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user?.passwordHash || !(await verifyPassword(password, user.passwordHash))) return { ok: false, error: "Incorrect password." };
  if (user.totpEnabledAt && user.totpSecretEnc) {
    if (!code || !verifyTotp(decryptSecret(user.totpSecretEnc), code, user.id)) return { ok: false, error: "Enter a valid code from your authenticator app." };
  }
  await db.session.update({ where: { id: sessionId }, data: { reauthAt: new Date() } });
  return { ok: true };
}

// ---------------------------------------------------------------- email change

export async function requestEmailChange(userId: string, newEmailRaw: string): Promise<{ message: string }> {
  const email = newEmailRaw.trim().toLowerCase();
  const message = "If that address can be used, we sent a confirmation link to it. Your email changes after you click the link.";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254) return { message: "Enter a valid email address." };
  if (!rateLimit(`email-change:${userId}`, 3, 60 * 60_000).ok) return { message };
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (email === user.email) return { message: "That is already your email address." };
  const taken = await db.user.findUnique({ where: { email } });
  if (taken) return { message };
  const { token } = await issueToken(userId, "VERIFY_EMAIL", { email });
  await deliverTemplate(
    "email_verification",
    email,
    { name: user.name, verifyLink: siteUrl(`/verify-email/${token}`), expiresIn: describeTtl(TOKEN_TTL_HOURS.VERIFY_EMAIL) },
    { userId },
  );
  await audit(userId, "account.email_change_requested", "User", userId);
  return { message };
}

export async function confirmEmailChange(token: string): Promise<Result> {
  const res = await db.$transaction(async (tx) => {
    const t = await consumeToken(tx, token, "VERIFY_EMAIL");
    if (!t.ok || !t.email) return { ok: false as const, error: "This confirmation link is not valid, expired or was already used." };
    const taken = await tx.user.findUnique({ where: { email: t.email } });
    if (taken) return { ok: false as const, error: "That email address is already in use." };
    await tx.user.update({ where: { id: t.userId }, data: { email: t.email, emailVerifiedAt: new Date() } });
    return { ok: true as const, userId: t.userId };
  });
  if (res.ok) await audit(res.userId, "account.email_changed", "User", res.userId);
  return res.ok ? { ok: true } : res;
}

// ---------------------------------------------------------------- two-factor

export async function beginTotpSetup(userId: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  const secret = generateTotpSecret();
  await db.user.update({ where: { id: userId }, data: { totpPendingEnc: encryptSecret(secret) } });
  return totpSetupData(secret, user.email);
}

export async function pendingTotpSetup(userId: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.totpPendingEnc) return null;
  return totpSetupData(decryptSecret(user.totpPendingEnc), user.email);
}

/**
 * Verifies the first code, enables 2FA and returns new recovery codes (shown once).
 * All other sessions of the account are ended (`keepSessionId` is the session
 * doing the setup), so no session opened before two-step verification survives it.
 */
export async function confirmTotpSetup(userId: string, code: string, keepSessionId?: string): Promise<Result<{ recoveryCodes: string[] }>> {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.totpPendingEnc) return { ok: false, error: "Start the setup again." };
  const secret = decryptSecret(user.totpPendingEnc);
  if (!verifyTotp(secret, code, user.id)) return { ok: false, error: "That code did not match. Check the time on your phone and try again." };
  const codes = generateRecoveryCodes();
  await db.$transaction([
    db.user.update({ where: { id: userId }, data: { totpSecretEnc: encryptSecret(secret), totpPendingEnc: null, totpEnabledAt: new Date() } }),
    db.recoveryCode.deleteMany({ where: { userId } }),
    db.recoveryCode.createMany({ data: codes.map((c) => ({ userId, codeHash: hashRecoveryCode(c) })) }),
  ]);
  const ended = await revokeUserSessions(userId, keepSessionId);
  await audit(userId, "auth.2fa_enabled", "User", userId, { otherSessionsEnded: ended });
  return { ok: true, recoveryCodes: codes };
}

export async function regenerateRecoveryCodes(userId: string): Promise<string[]> {
  const codes = generateRecoveryCodes();
  await db.$transaction([
    db.recoveryCode.deleteMany({ where: { userId } }),
    db.recoveryCode.createMany({ data: codes.map((c) => ({ userId, codeHash: hashRecoveryCode(c) })) }),
  ]);
  await audit(userId, "auth.recovery_codes_regenerated", "User", userId);
  return codes;
}

export async function disableTotp(userId: string): Promise<Result> {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.role !== "MEMBER") return { ok: false, error: "Two-factor authentication is required for administrators." };
  await db.$transaction([
    db.user.update({ where: { id: userId }, data: { totpSecretEnc: null, totpPendingEnc: null, totpEnabledAt: null } }),
    db.recoveryCode.deleteMany({ where: { userId } }),
  ]);
  await audit(userId, "auth.2fa_disabled", "User", userId);
  return { ok: true };
}

// ---------------------------------------------------------------- account status

/**
 * Who may act on whose account (enforced here, on the server, for every
 * status and membership action): only the owner may act on an owner or
 * administrator account. Returns an error message, or null when allowed.
 */
async function staffRuleError(actorId: string, target: { role: UserRole }, verb: string): Promise<string | null> {
  if (target.role === "MEMBER") return null;
  const actor = await db.user.findUnique({ where: { id: actorId }, select: { role: true } });
  return actor?.role === "OWNER" ? null : `Only the owner can ${verb} administrators.`;
}

/** Whether this person counts as a supporter may have changed: bring the ideas they supported up to date. */
async function recheckSupport(userId: string) {
  const { reevaluateIdeas } = await import("./community/ideas");
  await reevaluateIdeas(userId);
}

async function endAccess(userId: string) {
  await revokeUserSessions(userId);
  await publishRealtime(db, { t: "user.revoked", userId });
}

// ---------------------------------------------------------------- community membership

const MEMBERSHIP_TRANSITIONS: Record<CommunityMembership, CommunityMembership[]> = {
  NONE: [], // only an approved application grants membership
  ACTIVE: ["SUSPENDED", "REVOKED"],
  SUSPENDED: ["ACTIVE", "REVOKED"],
  REVOKED: ["ACTIVE"],
};

const MEMBERSHIP_MESSAGES: Record<CommunityMembership, string> = {
  NONE: "",
  ACTIVE: "Your access to the member community has been restored. You can sign in and enter the community again.",
  SUSPENDED: "Your access to the member community has been paused by an administrator.",
  REVOKED: "Your access to the member community has been removed by an administrator.",
};

/**
 * Pauses, removes or restores someone's access to the member community
 * (their account itself is not changed). Removing access disconnects any
 * open chat immediately; the person can still sign in to see their status.
 */
export async function setMembership(actorId: string, userId: string, to: CommunityMembership, opts: { notify?: boolean } = {}): Promise<Result> {
  if (actorId === userId) return { ok: false, error: "You cannot change your own membership." };
  const target = await db.user.findUnique({ where: { id: userId } });
  if (!target) return { ok: false, error: "Account not found." };
  const refused = await staffRuleError(actorId, target, "change the community access of");
  if (refused) return { ok: false, error: refused };
  if (!MEMBERSHIP_TRANSITIONS[target.membershipStatus].includes(to)) {
    return { ok: false, error: target.membershipStatus === "NONE" ? "This person is not a member. Membership is granted by approving their application." : "That change is not possible." };
  }
  const res = await db.user.updateMany({
    where: { id: userId, membershipStatus: target.membershipStatus },
    data: { membershipStatus: to, membershipChangedAt: new Date(), membershipChangedById: actorId },
  });
  if (res.count !== 1) return { ok: false, error: "The membership changed meanwhile. Please reload the page." };
  if (to !== "ACTIVE") await publishRealtime(db, { t: "user.revoked", userId });
  // Groups: paused = keeps the place, but groups they coordinate get a new coordinator;
  // removed = group memberships end; restored = returns as an ordinary member.
  const groups = await import("./community/groups");
  if (to === "SUSPENDED") await groups.reassignCoordinatorsOf(userId);
  else if (to === "REVOKED") await groups.leaveAllGroups(userId);
  else await groups.fillVacantCoordinators(userId);
  await recheckSupport(userId);
  await audit(actorId, `membership.${to.toLowerCase()}`, "User", userId, { from: target.membershipStatus });
  if (opts.notify) {
    await deliverTemplate(
      "membership_status",
      target.email,
      { name: target.name, change: MEMBERSHIP_MESSAGES[to], contactEmail: brand().contactEmail || "the organization" },
      { sentById: actorId, userId },
    );
  }
  return { ok: true };
}

export async function suspendUser(actorId: string, userId: string, reason: string): Promise<Result> {
  if (actorId === userId) return { ok: false, error: "You cannot suspend your own account." };
  const target = await db.user.findUnique({ where: { id: userId } });
  if (!target) return { ok: false, error: "Account not found." };
  const refused = await staffRuleError(actorId, target, "suspend");
  if (refused) return { ok: false, error: refused };
  await db.user.update({ where: { id: userId }, data: { status: "SUSPENDED", suspendedAt: new Date(), suspendedReason: reason.slice(0, 500) || null } });
  await endAccess(userId);
  // A suspended person cannot act as coordinator: their groups get a new one now.
  const { reassignCoordinatorsOf } = await import("./community/groups");
  await reassignCoordinatorsOf(userId);
  await recheckSupport(userId);
  await audit(actorId, "member.suspended", "User", userId);
  return { ok: true };
}

export async function reactivateUser(actorId: string, userId: string): Promise<Result> {
  if (actorId === userId) return { ok: false, error: "You cannot reactivate your own account." };
  const target = await db.user.findUnique({ where: { id: userId } });
  if (!target) return { ok: false, error: "Account not found." };
  const refused = await staffRuleError(actorId, target, "reactivate");
  if (refused) return { ok: false, error: refused };
  if (target.status !== "SUSPENDED" && target.status !== "DEACTIVATED") return { ok: false, error: "The account is not suspended or deactivated." };
  // A deactivated account without a password must go through a new invitation.
  const status = target.passwordHash ? "ACTIVE" : "INVITED";
  await db.user.update({ where: { id: userId }, data: { status, suspendedAt: null, suspendedReason: null, deactivatedAt: null } });
  const { fillVacantCoordinators } = await import("./community/groups");
  await fillVacantCoordinators(userId);
  await recheckSupport(userId);
  await audit(actorId, "member.reactivated", "User", userId);
  return { ok: true };
}

/** Member closes their own account, or an admin deactivates it. Group memberships end. */
export async function deactivateUser(actorId: string, userId: string): Promise<Result> {
  const target = await db.user.findUnique({ where: { id: userId } });
  if (!target) return { ok: false, error: "Account not found." };
  // Closing your own account is allowed (it goes through the account page, with identity confirmation).
  if (actorId !== userId) {
    const refused = await staffRuleError(actorId, target, "deactivate");
    if (refused) return { ok: false, error: refused };
  }
  if (target.role === "OWNER") {
    const owners = await db.user.count({ where: { role: "OWNER", status: "ACTIVE" } });
    if (owners <= 1) return { ok: false, error: "The last owner account cannot be deactivated." };
  }
  await db.user.update({ where: { id: userId }, data: { status: "DEACTIVATED", deactivatedAt: new Date() } });
  const { leaveAllGroups } = await import("./community/groups");
  await leaveAllGroups(userId);
  await endAccess(userId);
  await recheckSupport(userId);
  await audit(actorId, actorId === userId ? "member.self_deactivated" : "member.deactivated", "User", userId);
  return { ok: true };
}

// ---------------------------------------------------------------- administrators (OWNER only)

export async function setUserRole(ownerId: string, userId: string, role: UserRole): Promise<Result> {
  const owner = await db.user.findUniqueOrThrow({ where: { id: ownerId } });
  if (owner.role !== "OWNER") return { ok: false, error: "Only the owner can change roles." };
  const target = await db.user.findUnique({ where: { id: userId } });
  if (!target) return { ok: false, error: "Account not found." };
  if (target.role === "OWNER" && role !== "OWNER") {
    const owners = await db.user.count({ where: { role: "OWNER", status: "ACTIVE" } });
    if (owners <= 1) return { ok: false, error: "There must always be at least one active owner." };
  }
  await db.user.update({ where: { id: userId }, data: { role } });
  // New role: new sessions (admin sessions have a shorter lifetime and need 2FA).
  await endAccess(userId);
  await audit(ownerId, "admin.role_changed", "User", userId, { from: target.role, to: role });
  return { ok: true };
}

/** Owner invites a new administrator by email (no application involved). */
export async function inviteAdministrator(ownerId: string, emailRaw: string, name: string, role: "ADMIN" | "OWNER"): Promise<Result<{ status: string }>> {
  const email = emailRaw.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: "Enter a valid email address." };
  const existing = await db.user.findUnique({ where: { email } });
  if (existing?.status === "ACTIVE") return { ok: false, error: "That person already has an account. Change their role instead." };
  const user = existing
    ? await db.user.update({ where: { id: existing.id }, data: { role, name, status: "INVITED" } })
    : await db.user.create({ data: { email, name, role, status: "INVITED" } });
  const { token } = await issueToken(user.id, "INVITE", { createdById: ownerId });
  const res = await deliverTemplate(
    "account_invitation",
    email,
    { name, activationLink: siteUrl(`/activate/${token}`), expiresIn: describeTtl(TOKEN_TTL_HOURS.INVITE) },
    { sentById: ownerId, userId: user.id },
  );
  await audit(ownerId, "admin.invited", "User", user.id, { role, emailStatus: res.status });
  if (res.status !== "sent") {
    await db.accountToken.updateMany({ where: { userId: user.id, kind: "INVITE", usedAt: null }, data: { usedAt: new Date() } });
    return { ok: false, error: `The invitation was not sent. ${res.error}` };
  }
  return { ok: true, status: "Invitation accepted by the email provider." };
}
