import "server-only";
import type { Prisma } from "@prisma/client";

/**
 * Gives community access to a person whose application was ACCEPTED but who
 * could not receive access at that moment (no account yet, email not confirmed,
 * account suspended). It is called at every point where that obstacle can
 * disappear: approving again, reactivating the account, confirming the email
 * address, linking an earlier application.
 *
 * It acts only when ALL of this is true:
 *   - the account is active and its email address is confirmed;
 *   - the person has an accepted application;
 *   - their community membership is "none".
 * It never restores access that an administrator paused or removed: that is a
 * separate, deliberate decision on the member page.
 *
 * Returns true when access was granted now. Must run inside a transaction.
 */
export async function grantAcceptedMembership(tx: Prisma.TransactionClient, userId: string, opts: { byAdminId?: string | null; reason: string }): Promise<boolean> {
  const user = await tx.user.findUnique({ where: { id: userId } });
  if (!user || user.status !== "ACTIVE" || !user.emailVerifiedAt || user.membershipStatus !== "NONE") return false;
  const applicant = await tx.applicant.findUnique({
    where: { userId },
    include: {
      applications: { where: { status: "ACCEPTED" }, orderBy: { decidedAt: "desc" }, take: 1, select: { id: true } },
      participant: { select: { id: true, user: { select: { id: true } } } },
    },
  });
  const accepted = applicant?.applications[0];
  if (!applicant || !accepted) return false;
  const participantFree = applicant.participant && (!applicant.participant.user || applicant.participant.user.id === userId);
  await tx.user.update({
    where: { id: userId },
    data: {
      membershipStatus: "ACTIVE",
      membershipChangedAt: new Date(),
      membershipChangedById: opts.byAdminId ?? null,
      ...(participantFree && !user.participantId ? { participantId: applicant.participant!.id } : {}),
    },
  });
  await tx.memberProfile.upsert({ where: { userId }, create: { userId, displayName: user.name.slice(0, 60) }, update: {} });
  await tx.auditLog.create({
    data: { actorId: opts.byAdminId ?? userId, action: "membership.granted", entityType: "User", entityId: userId, metadata: { applicationId: accepted.id, reason: opts.reason } },
  });
  return true;
}

export type AccessState = "can_enter" | "no_account" | "email_unconfirmed" | "account_inactive" | "access_paused" | "access_removed" | "not_accepted";

/** Why a person with this account state can or cannot enter the community right now. */
export function accessState(user: { status: string; emailVerifiedAt: Date | null; membershipStatus: string } | null | undefined): AccessState {
  if (!user) return "no_account";
  if (user.status !== "ACTIVE") return "account_inactive";
  if (!user.emailVerifiedAt) return "email_unconfirmed";
  if (user.membershipStatus === "ACTIVE") return "can_enter";
  if (user.membershipStatus === "SUSPENDED") return "access_paused";
  if (user.membershipStatus === "REVOKED") return "access_removed";
  return "not_accepted";
}

/** What the administrator is told after approving: always the person's REAL situation. */
export const APPROVAL_MESSAGE: Record<AccessState, string> = {
  can_enter: "Approved. This person can now enter the member community with the email and password they already have.",
  no_account: "Accepted. This applicant has no account yet: community access starts automatically when they create an account and confirm this email address.",
  email_unconfirmed: "Accepted. This person has not confirmed their email address yet: community access starts automatically when they do.",
  account_inactive: "Accepted, but this person's account is suspended or deactivated, so they cannot enter yet. Access starts automatically when the account is reactivated.",
  access_paused: "Accepted, but this person's community access is paused. Restore it on their member page when appropriate.",
  access_removed: "Accepted, but this person's community access was removed. Restore it on their member page when appropriate.",
  not_accepted: "Accepted, but community access could not be given. Open the person's member page to see their account state.",
};
