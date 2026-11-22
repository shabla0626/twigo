import { chatBoundary } from "@/realtime/chat-service";
import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireMember } from "@/lib/auth/guard";
import { groupAccess } from "./access";
import { getGroupOverview } from "./groups";
import { activeMeeting } from "./meetings";

/**
 * Loads a group for its pages (cached per request). Suspended groups are
 * only visible to their members (read-only notice); archived groups are
 * visible to everyone read-only.
 */
export const loadGroupPage = cache(async (slug: string) => {
  const user = await requireMember();
  const access = await groupAccess(slug, user.id);
  if (!access || access.group.slug !== slug) notFound();
  if (access.group.suspendedAt && access.membership?.status !== "ACTIVE") notFound();
  return { user, ...access };
});

// The pieces below are used by both the group layout and its pages. React's
// cache() makes each run once per request, however many components ask.

/** The group's default chat channel. */
export const groupChannel = cache((groupId: string) => db.groupChannel.findFirst({ where: { groupId, isDefault: true }, select: { id: true } }));

/** The meeting in progress, if any. */
export const groupMeetingNow = cache((groupId: string) => activeMeeting(groupId));

/** Community-visible overview (description, members, announcements). */
export const groupOverview = cache((slug: string) => getGroupOverview(slug));

/** Unread chat messages for this member in the group's default channel. */
export const groupUnread = cache(async (groupId: string, userId: string) => {
  const channel = await groupChannel(groupId);
  if (!channel) return 0;
  const [read, membership, person] = await Promise.all([
    db.channelReadState.findUnique({ where: { channelId_userId: { channelId: channel.id, userId } }, select: { lastReadAt: true } }),
    db.groupMembership.findUnique({ where: { groupId_userId: { groupId, userId } }, select: { joinedAt: true } }),
    db.user.findUnique({ where: { id: userId }, select: { role: true } }),
  ]);
  const boundary = membership && person ? chatBoundary(person.role, membership.joinedAt) : null;
  const since = new Date(Math.max(read?.lastReadAt.getTime() ?? 0, boundary?.getTime() ?? 0));
  return db.chatMessage.count({
    where: { channelId: channel.id, kind: "USER", deletedAt: null, authorId: { not: userId }, createdAt: { gt: since } },
  });
});
