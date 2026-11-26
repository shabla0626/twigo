import "server-only";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

export async function listBroadcasts(groupId: string) {
  return db.projectBroadcast.findMany({
    where: { groupId, removedAt: null },
    orderBy: { createdAt: "desc" },
    take: 40,
    include: { author: { select: { id: true, profile: { select: { displayName: true } } } } },
  });
}

export async function getBroadcast(id: string) {
  const post = await db.projectBroadcast.findUnique({
    where: { id },
    include: {
      author: { select: { id: true, profile: { select: { displayName: true } } } },
      comments: {
        where: { removedAt: null },
        orderBy: { createdAt: "asc" },
        take: 200,
        include: { author: { select: { id: true, profile: { select: { displayName: true } } } } },
      },
      group: { select: { id: true, slug: true, name: true, suspendedAt: true } },
    },
  });
  if (!post || post.removedAt || post.group.suspendedAt) return null;
  return post;
}

export async function createBroadcast(authorId: string, groupId: string, input: { title: string; body: string }) {
  if (!rateLimit(`broadcast:${authorId}`, 8, 24 * 3600_000).ok) return { ok: false as const, error: "You have published several pieces today. Please try again tomorrow." };
  const member = await db.groupMembership.findUnique({ where: { groupId_userId: { groupId, userId: authorId } } });
  if (!member || member.status !== "ACTIVE") return { ok: false as const, error: "Only members of this project can publish on its channel." };
  const post = await db.projectBroadcast.create({ data: { groupId, authorId, ...input } });
  return { ok: true as const, id: post.id };
}

export async function removeBroadcast(userId: string, postId: string) {
  const post = await db.projectBroadcast.findUnique({ where: { id: postId }, select: { authorId: true, removedAt: true, group: { select: { slug: true } } } });
  if (!post || post.removedAt || post.authorId !== userId) return { ok: false as const, error: "You can only remove your own piece." };
  await db.projectBroadcast.update({ where: { id: postId }, data: { removedAt: new Date(), removedReason: "Removed by the author." } });
  return { ok: true as const, slug: post.group.slug };
}

export async function commentOnBroadcast(userId: string, postId: string, body: string) {
  if (!rateLimit(`broadcast-comment:${userId}`, 30, 10 * 60_000).ok) return { ok: false as const, error: "You are commenting very quickly. Please wait a moment." };
  const post = await db.projectBroadcast.findUnique({ where: { id: postId }, select: { id: true, removedAt: true, group: { select: { slug: true, suspendedAt: true } } } });
  if (!post || post.removedAt || post.group.suspendedAt) return { ok: false as const, error: "This piece is not available." };
  await db.$transaction(async (tx) => {
    await tx.projectBroadcastComment.create({ data: { postId, authorId: userId, body } });
    await tx.projectBroadcast.update({ where: { id: postId }, data: { commentCount: { increment: 1 } } });
  });
  return { ok: true as const, slug: post.group.slug };
}
