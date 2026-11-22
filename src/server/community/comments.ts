import "server-only";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import { notify } from "./notifications";

const MAX_DEPTH = 3;

type Target = { ideaId: string } | { discussionId: string };

async function targetInfo(t: Target) {
  if ("ideaId" in t) {
    const idea = await db.businessIdea.findUnique({ where: { id: t.ideaId }, select: { id: true, title: true, authorId: true, status: true } });
    if (!idea || idea.status === "REMOVED") return null;
    return { kind: "idea" as const, id: idea.id, title: idea.title, ownerId: idea.authorId, link: `/community/ideas/${idea.id}` };
  }
  const d = await db.groupDiscussion.findUnique({
    where: { id: t.discussionId },
    select: { id: true, title: true, authorId: true, deletedAt: true, removedAt: true, group: { select: { slug: true, suspendedAt: true, status: true } } },
  });
  if (!d || d.removedAt || d.deletedAt || d.group.suspendedAt) return null;
  return { kind: "discussion" as const, id: d.id, title: d.title, ownerId: d.authorId, link: `/community/groups/${d.group.slug}/discussions/${d.id}`, archived: d.group.status === "ARCHIVED" };
}

export async function addComment(userId: string, target: Target, input: { body: string; parentId: string | null }) {
  if (!rateLimit(`comment:${userId}`, 30, 10 * 60_000).ok) return { ok: false as const, error: "You are commenting very quickly. Please wait a moment." };
  const info = await targetInfo(target);
  if (!info) return { ok: false as const, error: "This conversation is not available." };
  if ("archived" in info && info.archived) return { ok: false as const, error: "This group is archived." };

  let depth = 0;
  let parentAuthor: string | null = null;
  if (input.parentId) {
    const parent = await db.comment.findUnique({ where: { id: input.parentId } });
    const same = parent && ("ideaId" in target ? parent.ideaId === target.ideaId : parent.discussionId === target.discussionId);
    if (!parent || !same) return { ok: false as const, error: "The comment you replied to no longer exists." };
    depth = Math.min(parent.depth + 1, MAX_DEPTH);
    parentAuthor = parent.authorId;
  }
  const comment = await db.$transaction(async (tx) => {
    const c = await tx.comment.create({
      data: { authorId: userId, body: input.body, parentId: input.parentId, depth, ...("ideaId" in target ? { ideaId: target.ideaId } : { discussionId: target.discussionId }) },
    });
    if (info.kind === "idea") await tx.businessIdea.update({ where: { id: info.id }, data: { commentCount: { increment: 1 }, lastActivityAt: new Date() } });
    else {
      const d = await tx.groupDiscussion.update({ where: { id: info.id }, data: { commentCount: { increment: 1 }, lastActivityAt: new Date() }, select: { groupId: true } });
      await tx.researchGroup.update({ where: { id: d.groupId }, data: { lastActivityAt: new Date() } });
    }
    return c;
  });

  const link = `${info.link}#comment-${comment.id}`;
  if (parentAuthor && parentAuthor !== userId) {
    await notify([parentAuthor], { type: "COMMENT_REPLY", title: `New reply to your comment on “${info.title}”`, link });
  }
  if (info.ownerId && info.ownerId !== userId && info.ownerId !== parentAuthor) {
    await notify([info.ownerId], {
      type: info.kind === "idea" ? "IDEA_COMMENT" : "DISCUSSION_REPLY",
      title: info.kind === "idea" ? `New comments on your idea “${info.title}”` : `New replies in “${info.title}”`,
      link,
      dedupeKey: `comments:${info.id}`,
    });
  }
  return { ok: true as const, id: comment.id };
}

export async function editComment(userId: string, commentId: string, body: string) {
  const c = await db.comment.findUnique({ where: { id: commentId } });
  if (!c || c.authorId !== userId || c.deletedAt || c.removedAt) return { ok: false as const, error: "You can only edit your own comments." };
  await db.comment.update({ where: { id: commentId }, data: { body, editedAt: new Date() } });
  return { ok: true as const };
}

/** Soft delete: the text is hidden immediately and purged after the retention period. */
export async function deleteComment(userId: string, commentId: string) {
  const c = await db.comment.findUnique({ where: { id: commentId } });
  if (!c || c.authorId !== userId || c.deletedAt) return { ok: false as const, error: "You can only delete your own comments." };
  await db.comment.update({ where: { id: commentId }, data: { deletedAt: new Date() } });
  await audit(userId, "comment.deleted_by_author", "Comment", commentId);
  return { ok: true as const };
}

export type CommentNode = {
  id: string;
  body: string;
  depth: number;
  createdAt: Date;
  editedAt: Date | null;
  state: "visible" | "deleted" | "removed";
  author: { id: string; displayName: string } | null;
  replies: CommentNode[];
};

export async function commentTree(target: Target): Promise<CommentNode[]> {
  const rows = await db.comment.findMany({
    where: "ideaId" in target ? { ideaId: target.ideaId } : { discussionId: target.discussionId },
    orderBy: { createdAt: "asc" },
    take: 1000,
    include: { author: { select: { id: true, profile: { select: { displayName: true } } } } },
  });
  const nodes = new Map<string, CommentNode>();
  for (const r of rows) {
    const state = r.removedAt ? "removed" : r.deletedAt ? "deleted" : "visible";
    nodes.set(r.id, {
      id: r.id,
      body: state === "visible" ? r.body : "",
      depth: r.depth,
      createdAt: r.createdAt,
      editedAt: r.editedAt,
      state,
      author: state === "visible" && r.author ? { id: r.author.id, displayName: r.author.profile?.displayName ?? "Former member" } : null,
      replies: [],
    });
  }
  const roots: CommentNode[] = [];
  for (const r of rows) {
    const n = nodes.get(r.id)!;
    const parent = r.parentId ? nodes.get(r.parentId) : null;
    (parent ? parent.replies : roots).push(n);
  }
  return roots;
}

// ---------------------------------------------------------------- group discussions

export async function createDiscussion(userId: string, groupId: string, input: { title: string; body: string }) {
  if (!rateLimit(`discussion:${userId}`, 10, 3600_000).ok) return { ok: false as const, error: "Please wait before starting another discussion." };
  const g = await db.researchGroup.findUnique({ where: { id: groupId } });
  if (!g || g.suspendedAt || g.status === "ARCHIVED") return { ok: false as const, error: "This group is not accepting new discussions." };
  const d = await db.groupDiscussion.create({ data: { groupId, authorId: userId, ...input } });
  await db.researchGroup.update({ where: { id: groupId }, data: { lastActivityAt: new Date() } });
  return { ok: true as const, id: d.id };
}

export async function deleteDiscussion(userId: string, discussionId: string) {
  const d = await db.groupDiscussion.findUnique({ where: { id: discussionId } });
  if (!d || d.authorId !== userId) return { ok: false as const, error: "You can only delete your own discussions." };
  await db.groupDiscussion.update({ where: { id: discussionId }, data: { deletedAt: new Date() } });
  await audit(userId, "discussion.deleted_by_author", "GroupDiscussion", discussionId);
  return { ok: true as const };
}

export async function listDiscussions(groupId: string) {
  return db.groupDiscussion.findMany({
    where: { groupId, deletedAt: null, removedAt: null },
    orderBy: { lastActivityAt: "desc" },
    take: 100,
    include: { author: { select: { id: true, profile: { select: { displayName: true } } } } },
  });
}
