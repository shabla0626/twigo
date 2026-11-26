import "server-only";
import type { GroupMembership, ResearchGroup } from "@prisma/client";
import { db } from "@/lib/db";
import { GROUP_PARTICIPANT, isStaffRole } from "@/lib/auth/member-where";

export class AccessError extends Error {
  constructor(message = "You do not have access to this.") {
    super(message);
    this.name = "AccessError";
  }
}

export type GroupAccess = {
  group: ResearchGroup;
  membership: GroupMembership | null;
  /** Active group member (may use chat, meetings, research, projects, and see profiles). */
  isMember: boolean;
  isCoordinator: boolean;
  /** Group accepts new activity (not archived or suspended). */
  isOpen: boolean;
};

/**
 * Resolves what the given member may do in a group. Community-visible parts
 * (overview, discussions, member list) only require an active organization
 * member; private parts require an ACTIVE group membership.
 */
export async function groupAccess(groupId: string, userId: string): Promise<GroupAccess | null> {
  // By id only. A lookup by "id or slug" could resolve a value to a different group than the one the
  // caller then writes to (a slug can be made equal to another group's id through an idea's title).
  const group = await db.researchGroup.findUnique({ where: { id: groupId } });
  return group ? accessFor(group, userId) : null;
}

/** For the group pages, whose address contains the slug. */
export async function groupAccessBySlug(slug: string, userId: string): Promise<GroupAccess | null> {
  const group = await db.researchGroup.findUnique({ where: { slug } });
  return group ? accessFor(group, userId) : null;
}

async function accessFor(group: ResearchGroup, userId: string): Promise<GroupAccess> {
  const [membership, user] = await Promise.all([
    db.groupMembership.findUnique({ where: { groupId_userId: { groupId: group.id, userId } } }),
    db.user.findUnique({ where: { id: userId }, select: { role: true } }),
  ]);
  // Owner and administrator accounts never count as group members, even if an old membership row
  // exists: staff see a group's private areas only through an owner-approved investigation grant,
  // which is checked separately (src/server/admin/group-access.ts), never through these pages.
  const isMember = membership?.status === "ACTIVE" && !group.suspendedAt && !!user && !isStaffRole(user.role);
  return {
    group,
    membership,
    isMember,
    isCoordinator: isMember && membership?.role === "COORDINATOR",
    isOpen: !group.suspendedAt && group.status !== "ARCHIVED",
  };
}

export async function requireGroupMember(groupId: string, userId: string): Promise<GroupAccess> {
  const a = await groupAccess(groupId, userId);
  if (!a || a.group.suspendedAt) throw new AccessError("This group is not available.");
  if (!a.isMember) throw new AccessError("Join the group to use this.");
  return a;
}

export async function requireOpenGroupMember(groupId: string, userId: string): Promise<GroupAccess> {
  const a = await requireGroupMember(groupId, userId);
  if (!a.isOpen) throw new AccessError("This group is archived; its content is read-only.");
  return a;
}

export async function requireCoordinator(groupId: string, userId: string): Promise<GroupAccess> {
  const a = await requireOpenGroupMember(groupId, userId);
  if (!a.isCoordinator) throw new AccessError("Only the group coordinator can do this.");
  return a;
}

/** Ids of the group's members who can take part right now (for notifications). */
export async function activeMemberIds(groupId: string): Promise<string[]> {
  const rows = await db.groupMembership.findMany({ where: { groupId, status: "ACTIVE", user: GROUP_PARTICIPANT }, select: { userId: true } });
  return rows.map((r) => r.userId);
}
