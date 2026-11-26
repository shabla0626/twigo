import "server-only";
import type { FieldPostKind, IdeaCategory } from "@prisma/client";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import type { FieldPostInput } from "@/lib/validation/community";

const postSelect = {
  id: true,
  title: true,
  body: true,
  links: true,
  kind: true,
  category: true,
  createdAt: true,
  author: { select: { id: true, profile: { select: { displayName: true } } } },
} as const;

export async function listFieldPosts(opts: { category?: IdeaCategory; kind?: FieldPostKind; take?: number }) {
  const take = Math.min(opts.take ?? 40, 50);
  return db.fieldPost.findMany({
    where: {
      removedAt: null,
      ...(opts.category ? { category: opts.category } : {}),
      ...(opts.kind ? { kind: opts.kind } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take,
    select: postSelect,
  });
}

export async function createFieldPost(authorId: string, input: FieldPostInput) {
  if (!rateLimit(`field:create:${authorId}`, 10, 24 * 3600_000).ok) {
    return { ok: false as const, error: "You have published many notes today. Please try again tomorrow." };
  }
  const post = await db.fieldPost.create({ data: { ...input, authorId } });
  logger.info("field_post.created", { postId: post.id, category: post.category, kind: post.kind });
  return { ok: true as const, id: post.id };
}

export async function removeFieldPost(userId: string, postId: string) {
  const post = await db.fieldPost.findUnique({ where: { id: postId }, select: { authorId: true, removedAt: true } });
  if (!post || post.removedAt) return { ok: false as const, error: "That note is not available." };
  if (post.authorId !== userId) return { ok: false as const, error: "Only the author can remove this note." };
  await db.fieldPost.update({ where: { id: postId }, data: { removedAt: new Date(), removedReason: "Removed by the author." } });
  return { ok: true as const };
}
