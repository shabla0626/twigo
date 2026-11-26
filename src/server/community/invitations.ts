import "server-only";
import { db } from "@/lib/db";
import { isStaffRole } from "@/lib/auth/member-where";
import { hasCommunityAccess } from "@/lib/auth/session-core";
import { rateLimit } from "@/lib/rate-limit";
import { admitMember } from "./groups";
import { notify } from "./notifications";

/** Projects this member belongs to and can invite someone into. */
export async function groupsICanInvite(userId: string) {
  return db.researchGroup.findMany({
    where: {
      suspendedAt: null,
      status: { not: "ARCHIVED" },
      memberships: { some: { userId, status: "ACTIVE" } },
    },
    select: { id: true, slug: true, name: true },
    orderBy: { name: "asc" },
  });
}

export async function pendingInviteFor(userId: string, groupId: string) {
  return db.groupInvitation.findFirst({
    where: { inviteeId: userId, groupId, status: "PENDING" },
    select: { id: true },
  });
}

/** A group member invites an approved community member. Acceptance adds them to the group. */
export async function inviteToGroup(inviterId: string, groupId: string, inviteeId: string) {
  if (inviterId === inviteeId) return { ok: false as const, error: "You cannot invite yourself." };
  if (!rateLimit(`invite:${inviterId}`, 20, 24 * 3600_000).ok) return { ok: false as const, error: "You have sent many invitations today. Please try again tomorrow." };
  const group = await db.researchGroup.findUnique({
    where: { id: groupId },
    select: { id: true, name: true, slug: true, suspendedAt: true, status: true },
  });
  if (!group || group.suspendedAt || group.status === "ARCHIVED") return { ok: false as const, error: "This project is not open to invitations." };
  const inviter = await db.groupMembership.findUnique({ where: { groupId_userId: { groupId, userId: inviterId } } });
  if (!inviter || inviter.status !== "ACTIVE") return { ok: false as const, error: "You are not a member of this project." };
  const invitee = await db.user.findUnique({
    where: { id: inviteeId },
    select: { role: true, status: true, emailVerifiedAt: true, membershipStatus: true, profile: { select: { userId: true } } },
  });
  const approved = !!invitee?.profile && invitee.status === "ACTIVE" && hasCommunityAccess({ status: invitee.status, role: invitee.role, emailVerified: Boolean(invitee.emailVerifiedAt), membership: invitee.membershipStatus });
  if (!approved || isStaffRole(invitee!.role)) return { ok: false as const, error: "Only an approved community member can be invited." };
  const already = await db.groupMembership.findUnique({ where: { groupId_userId: { groupId, userId: inviteeId } } });
  if (already?.status === "ACTIVE") return { ok: false as const, error: "That member is already in this project." };
  if (already?.status === "REMOVED") return { ok: false as const, error: "That member was removed from this project." };
  const pending = await db.groupInvitation.findFirst({ where: { groupId, inviteeId, status: "PENDING" }, select: { id: true } });
  if (pending) return { ok: false as const, error: "An invitation is already waiting for that member." };
  const invite = await db.groupInvitation.create({ data: { groupId, inviterId, inviteeId, status: "PENDING" } });
  await notify([inviteeId], {
    type: "GROUP_MEMBERSHIP",
    title: `You are invited to the project “${group.name}”`,
    body: "A member of the project invited you. You can accept the invitation or join from the project page. Accepting does not replace community membership approval.",
    link: `/community/groups/${group.slug}`,
  });
  return { ok: true as const, id: invite.id };
}

export async function acceptInvitation(userId: string, invitationId: string) {
  const invite = await db.groupInvitation.findUnique({ where: { id: invitationId }, select: { id: true, groupId: true, inviteeId: true, status: true, group: { select: { slug: true, name: true } } } });
  if (!invite || invite.inviteeId !== userId || invite.status !== "PENDING") return { ok: false as const, error: "This invitation is no longer open." };
  const admitted = await admitMember(userId, invite.groupId);
  if (!admitted.ok) return admitted;
  await db.groupInvitation.update({ where: { id: invite.id }, data: { status: "ACCEPTED", respondedAt: new Date() } });
  return { ok: true as const, slug: invite.group.slug };
}

export async function declineInvitation(userId: string, invitationId: string) {
  const invite = await db.groupInvitation.findUnique({ where: { id: invitationId }, select: { inviteeId: true, status: true, group: { select: { slug: true } } } });
  if (!invite || invite.inviteeId !== userId || invite.status !== "PENDING") return { ok: false as const, error: "This invitation is no longer open." };
  await db.groupInvitation.update({ where: { id: invitationId }, data: { status: "DECLINED", respondedAt: new Date() } });
  return { ok: true as const, slug: invite.group.slug };
}
