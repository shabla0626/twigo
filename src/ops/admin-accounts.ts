// Administrator account operations for the command line (scripts/create-admin.ts).
// They need access to the server and its database settings, which only the
// owner has. Everything here is written to the audit log.
import type { PrismaClient, UserRole } from "@prisma/client";
import { hashPassword, passwordPolicyError } from "../lib/auth/password";
import { publishRealtime } from "../lib/realtime-events";

export type AdminCliResult = { ok: true; message: string } | { ok: false; error: string };

async function endAllSessions(db: PrismaClient, userId: string) {
  await db.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  await publishRealtime(db, { t: "user.revoked", userId });
}

/**
 * Creates an administrator, or resets the password of an existing one.
 *
 * An existing account is never changed silently in a way that gives it more
 * power: turning a member into an administrator, changing an administrator's
 * role, or bringing back a suspended or deactivated account all require
 * `promote: true` (the --promote flag).
 */
export async function createOrResetAdmin(
  db: PrismaClient,
  input: { email: string; name?: string; role?: UserRole; password: string; promote?: boolean },
): Promise<AdminCliResult> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: "Provide --email <address>" };
  if (input.role && !["OWNER", "ADMIN"].includes(input.role)) return { ok: false, error: "--role must be OWNER or ADMIN" };
  const policy = passwordPolicyError(input.password);
  if (policy) return { ok: false, error: policy };

  const now = new Date();
  const passwordHash = await hashPassword(input.password);
  const existing = await db.user.findUnique({ where: { email } });

  if (!existing) {
    const role = input.role ?? "OWNER";
    const created = await db.user.create({
      data: { email, name: input.name?.trim() || "Administrator", role, passwordHash, status: "ACTIVE", emailVerifiedAt: now, passwordChangedAt: now },
    });
    await db.auditLog.create({ data: { actorId: created.id, action: "admin.created_cli", entityType: "User", entityId: created.id } });
    return { ok: true, message: `Created administrator ${email} (${role}). They must set up two-step verification at their first sign-in.` };
  }

  const role = input.role ?? (existing.role === "MEMBER" ? "OWNER" : existing.role);
  const changes: string[] = [];
  if (existing.role === "MEMBER") changes.push(`make the existing MEMBER account an ${role}`);
  else if (role !== existing.role) changes.push(`change its role from ${existing.role} to ${role}`);
  if (existing.status !== "ACTIVE") changes.push(`reactivate it (it is ${existing.status.toLowerCase()})`);
  if (changes.length && !input.promote) {
    return { ok: false, error: `An account with ${email} already exists. Continuing would ${changes.join(" and ")}. Nothing was changed. Add --promote if that is what you intend.` };
  }

  await db.user.update({
    where: { id: existing.id },
    data: {
      passwordHash,
      ...(input.name ? { name: input.name.trim() } : {}),
      role,
      status: "ACTIVE",
      emailVerifiedAt: existing.emailVerifiedAt ?? now,
      passwordChangedAt: now,
      failedLogins: 0,
      lockedUntil: null,
      deactivatedAt: null,
      suspendedAt: null,
    },
  });
  await endAllSessions(db, existing.id);
  await db.auditLog.create({
    data: { actorId: existing.id, action: "admin.password_reset_cli", entityType: "User", entityId: existing.id, ...(changes.length ? { metadata: { roleFrom: existing.role, roleTo: role, statusFrom: existing.status } } : {}) },
  });
  return { ok: true, message: `Updated administrator ${email}${changes.length ? ` (${changes.join("; ")})` : ""}. Existing sessions were ended.` };
}

/**
 * Recovery when an owner or administrator lost their authenticator and their
 * recovery codes: removes two-step verification from the account and ends its
 * sessions. At the next sign-in the person must set it up again before the
 * admin area opens. The password is not changed.
 */
export async function resetTwoStepVerification(db: PrismaClient, emailRaw: string): Promise<AdminCliResult> {
  const email = emailRaw.trim().toLowerCase();
  const user = await db.user.findUnique({ where: { email } });
  if (!user) return { ok: false, error: `No account with ${email}.` };
  if (!user.totpEnabledAt && !user.totpSecretEnc && !user.totpPendingEnc) return { ok: false, error: `${email} has no two-step verification to reset.` };
  await db.$transaction([
    db.user.update({ where: { id: user.id }, data: { totpSecretEnc: null, totpPendingEnc: null, totpEnabledAt: null } }),
    db.recoveryCode.deleteMany({ where: { userId: user.id } }),
  ]);
  await endAllSessions(db, user.id);
  await db.auditLog.create({ data: { actorId: null, action: "admin.2fa_reset_cli", entityType: "User", entityId: user.id } });
  return { ok: true, message: `Two-step verification was removed from ${email} and its sessions were ended. It must be set up again at the next sign-in.` };
}
