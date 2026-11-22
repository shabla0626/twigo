import "server-only";
import type { IdeaCategory, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ACTIVE_MEMBER } from "@/lib/auth/member-where";
import { audit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import type { IdeaInput } from "@/lib/validation/community";
import { getSetting } from "../settings";
import { createGroupFromIdea } from "./groups";
import { notify } from "./notifications";

export type IdeaSort = "recent" | "endorsed" | "active";

export async function createIdea(authorId: string, input: IdeaInput) {
  if (!rateLimit(`idea:create:${authorId}`, 10, 24 * 3600_000).ok) return { ok: false as const, error: "You have published many ideas today. Please try again tomorrow." };
  const idea = await db.businessIdea.create({ data: { ...input, authorId } });
  logger.info("idea.created", { ideaId: idea.id });
  return { ok: true as const, id: idea.id };
}

export async function updateIdea(userId: string, ideaId: string, input: IdeaInput) {
  const idea = await db.businessIdea.findUnique({ where: { id: ideaId } });
  if (!idea || idea.authorId !== userId) return { ok: false as const, error: "Only the author can edit this idea." };
  if (idea.status === "REMOVED") return { ok: false as const, error: "This idea was removed by moderation." };
  await db.businessIdea.update({ where: { id: ideaId }, data: { ...input, editedAt: new Date() } });
  return { ok: true as const };
}

export async function closeIdea(userId: string, ideaId: string) {
  const idea = await db.businessIdea.findUnique({ where: { id: ideaId }, include: { group: { select: { id: true } } } });
  if (!idea || idea.authorId !== userId) return { ok: false as const, error: "Only the author can close this idea." };
  if (idea.group) return { ok: false as const, error: "This idea already has a research group; it stays open as its origin." };
  await db.businessIdea.update({ where: { id: ideaId }, data: { status: "CLOSED" } });
  return { ok: true as const };
}

const listSelect = {
  id: true,
  title: true,
  summary: true,
  category: true,
  status: true,
  endorsementCount: true,
  commentCount: true,
  createdAt: true,
  lastActivityAt: true,
  author: { select: { id: true, profile: { select: { displayName: true } } } },
  group: { select: { slug: true, name: true } },
} satisfies Prisma.BusinessIdeaSelect;

export type IdeaListItem = Prisma.BusinessIdeaGetPayload<{ select: typeof listSelect }>;

export async function listIdeas(opts: {
  q?: string;
  category?: IdeaCategory;
  sort?: IdeaSort;
  cursor?: string;
  take?: number;
  includeClosed?: boolean;
  authorId?: string;
}) {
  const take = Math.min(opts.take ?? 20, 50);
  const where: Prisma.BusinessIdeaWhereInput = {
    status: { in: opts.includeClosed ? ["OPEN", "GROUP_FORMED", "CLOSED"] : ["OPEN", "GROUP_FORMED"] },
    ...(opts.category ? { category: opts.category } : {}),
    ...(opts.authorId ? { authorId: opts.authorId } : {}),
    ...(opts.q
      ? { OR: [{ title: { contains: opts.q, mode: "insensitive" } }, { summary: { contains: opts.q, mode: "insensitive" } }] }
      : {}),
  };
  const orderBy: Prisma.BusinessIdeaOrderByWithRelationInput[] =
    opts.sort === "endorsed"
      ? [{ endorsementCount: "desc" }, { createdAt: "desc" }, { id: "desc" }]
      : opts.sort === "active"
        ? [{ lastActivityAt: "desc" }, { id: "desc" }]
        : [{ createdAt: "desc" }, { id: "desc" }];
  const rows = await db.businessIdea.findMany({
    where,
    orderBy,
    take: take + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    select: listSelect,
  });
  return { items: rows.slice(0, take), nextCursor: rows.length > take ? rows[take - 1]!.id : null };
}

export async function getIdea(ideaId: string, viewerId: string) {
  const idea = await db.businessIdea.findUnique({
    where: { id: ideaId },
    include: {
      author: { select: { id: true, status: true, profile: { select: { displayName: true } } } },
      group: { select: { id: true, slug: true, name: true, status: true, memberCount: true } },
      endorsements: {
        orderBy: { createdAt: "asc" },
        select: { createdAt: true, user: { select: { id: true, profile: { select: { displayName: true } } } } },
      },
    },
  });
  if (!idea || idea.status === "REMOVED") return null;
  return { ...idea, endorsedByViewer: idea.endorsements.some((e) => e.user.id === viewerId) };
}

export type EndorseResult =
  | { ok: true; endorsed: boolean; groupCreated: { slug: string } | null; count: number }
  | { ok: false; error: string };

/**
 * Endorses an idea. When the number of distinct ACTIVE endorsers other than
 * the author reaches the configured threshold, exactly one research group is
 * created in the same transaction.
 *
 * Concurrency: the idea row is locked with SELECT ... FOR UPDATE, so
 * simultaneous endorsements are processed one after another; the unique
 * constraint on ResearchGroup.ideaId is a second, absolute guard.
 */
export async function endorseIdea(userId: string, ideaId: string): Promise<EndorseResult> {
  const threshold = await getSetting("community.endorsementThreshold");
  const endorser = await db.user.findFirst({ where: { id: userId, ...ACTIVE_MEMBER }, select: { id: true } });
  if (!endorser) return { ok: false, error: "Only active members can support ideas." };

  const created: { group: { id: string; slug: string; name: string; memberIds: string[]; authorId: string | null } | null } = { group: null };
  let authorId: string | null = null;
  let title = "";
  let newlyEndorsed = false;

  const outcome = await db.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: string; authorId: string | null; status: string; title: string }[]>`
      SELECT "id", "authorId", "status"::text AS "status", "title" FROM "BusinessIdea" WHERE "id" = ${ideaId} FOR UPDATE`;
    const idea = locked[0];
    if (!idea) return { ok: false as const, error: "Idea not found." };
    authorId = idea.authorId;
    title = idea.title;
    if (idea.authorId === userId) return { ok: false as const, error: "You cannot support your own idea." };
    if (idea.status !== "OPEN") {
      return { ok: false as const, error: idea.status === "GROUP_FORMED" ? "This idea already has a research group. You can join the group instead." : "This idea is no longer open for support." };
    }

    const inserted = await tx.ideaEndorsement.createMany({ data: [{ ideaId, userId }], skipDuplicates: true });
    newlyEndorsed = inserted.count === 1;
    const count = await tx.ideaEndorsement.count({ where: { ideaId } });
    await tx.businessIdea.update({ where: { id: ideaId }, data: { endorsementCount: count, lastActivityAt: new Date() } });

    const eligible = await tx.ideaEndorsement.findMany({
      where: { ideaId, user: ACTIVE_MEMBER, ...(idea.authorId ? { userId: { not: idea.authorId } } : {}) },
      orderBy: { createdAt: "asc" },
      select: { userId: true },
    });
    if (eligible.length >= threshold) {
      const existing = await tx.researchGroup.findUnique({ where: { ideaId }, select: { id: true } });
      if (!existing) {
        created.group = await createGroupFromIdea(tx, ideaId, eligible.map((e) => e.userId));
      }
    }
    return { ok: true as const, count };
  });

  if (!outcome.ok) return outcome;

  // Notifications are sent after the transaction committed.
  if (newlyEndorsed && authorId) {
    await notify([authorId], {
      type: "IDEA_ENDORSED",
      title: `Your idea “${title}” has a new supporter`,
      link: `/community/ideas/${ideaId}`,
      dedupeKey: `endorse:${ideaId}`,
    });
  }
  const g = created.group;
  if (g) {
    await audit(null, "group.auto_created", "ResearchGroup", g.id, { ideaId, threshold, initialMembers: g.memberIds.length });
    if (g.authorId)
      await notify([g.authorId], {
        type: "IDEA_GROUP_CREATED",
        title: `Your idea “${title}” has attracted enough support. A research group has been created.`,
        body: "You coordinate the group. This means the idea is ready to investigate together, not that its success is proven.",
        link: `/community/groups/${g.slug}`,
      });
    await notify(
      g.memberIds,
      {
        type: "GROUP_MEMBERSHIP",
        title: `You are a founding member of “${g.name}”`,
        body: "Your support helped create this research group to investigate the idea. You can leave the group at any time.",
        link: `/community/groups/${g.slug}`,
      },
      { exclude: g.authorId ?? undefined },
    );
  }
  return { ok: true, endorsed: true, groupCreated: g ? { slug: g.slug } : null, count: outcome.count };
}

/** Withdraws an endorsement. If a group already exists it is NOT affected. */
export async function withdrawEndorsement(userId: string, ideaId: string) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "BusinessIdea" WHERE "id" = ${ideaId} FOR UPDATE`;
    const res = await tx.ideaEndorsement.deleteMany({ where: { ideaId, userId } });
    const count = await tx.ideaEndorsement.count({ where: { ideaId } });
    await tx.businessIdea.update({ where: { id: ideaId }, data: { endorsementCount: count } });
    return { ok: true as const, removed: res.count === 1, count };
  });
}
