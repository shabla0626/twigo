import "server-only";
import type { GroupMembership, ResearchGroup } from "@prisma/client";
import { db } from "@/lib/db";

export class AccessError extends Error {
  constructor(message = "You do not have access to this.") {
    super(message);
    this.name = "AccessError";
  }
}

export type GroupAccess = {
  group: ResearchGroup;
  membership: GroupMembership | null;
  /** Active group member (may use chat, meetings, research, files). */
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
export async function groupAccess(groupIdOrSlug: string, userId: string): Promise<GroupAccess | null> {
  const group = await db.researchGroup.findFirst({ where: { OR: [{ id: groupIdOrSlug }, { slug: groupIdOrSlug }] } });
  if (!group) return null;
  const membership = await db.groupMembership.findUnique({ where: { groupId_userId: { groupId: group.id, userId } } });
  const isMember = membership?.status === "ACTIVE" && !group.suspendedAt;
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

/** Ids of active members of a group (for notifications). */
export async function activeMemberIds(groupId: string): Promise<string[]> {
  const rows = await db.groupMembership.findMany({ where: { groupId, status: "ACTIVE", user: { status: "ACTIVE" } }, select: { userId: true } });
  return rows.map((r) => r.userId);
}
