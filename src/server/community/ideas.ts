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

/** The parts of an idea that are kept in its history, with the names shown to members. */
export const IDEA_TEXT_FIELDS = {
  title: "Title",
  summary: "What the idea is",
  category: "Area",
  problem: "Problem or opportunity",
  proposal: "What would be offered",
  customers: "Customers",
  revenueModel: "How it could earn money",
  description: "More details",
  skillsNeeded: "Skills needed",
  timeEstimate: "Time needed",
  links: "Links",
} as const;
type IdeaTextField = keyof typeof IDEA_TEXT_FIELDS;
export type IdeaChangeKind = "MINOR" | "MATERIAL";

const same = (x: unknown, y: unknown) => JSON.stringify(x ?? null) === JSON.stringify(y ?? null);

/**
 * Edits an idea (author only). Founder decision 5:
 *
 * - Every edit is recorded: the text as it was before, who changed it, when.
 *   Members can read this history on the idea page.
 * - Nobody supports the idea yet: it can be edited freely.
 * - People support it, no group yet: the author says what kind of change it is.
 *     MINOR    (wording, typos, clarity): support is kept; supporters are told and can withdraw.
 *     MATERIAL (business purpose, revenue model, scope, area): support is reset;
 *              supporters are told and can support the new version.
 *   Changing the area is always material.
 * - A research group exists: only minor corrections. The direction now belongs
 *   to the group and is changed there, openly (see updateGroupInfo).
 */
export async function updateIdea(userId: string, ideaId: string, input: IdeaInput, opts: { kind?: IdeaChangeKind } = {}) {
  const threshold = await getSetting("community.endorsementThreshold");
  const outcome = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "BusinessIdea" WHERE "id" = ${ideaId} FOR UPDATE`;
    const idea = await tx.businessIdea.findUnique({ where: { id: ideaId }, include: { group: { select: { id: true } }, endorsements: { select: { userId: true } } } });
    if (!idea || idea.authorId !== userId) return { ok: false as const, error: "Only the author can edit this idea." };
    if (idea.status === "REMOVED") return { ok: false as const, error: "This idea was removed by moderation." };

    const changed = (Object.keys(IDEA_TEXT_FIELDS) as IdeaTextField[]).filter((f) => !same(idea[f], input[f]));
    if (!changed.length) return { ok: true as const, changed: false as const };

    const supporters = idea.endorsements.map((e) => e.userId);
    let kind: IdeaChangeKind = opts.kind ?? "MINOR";
    if (idea.group) {
      if (opts.kind === "MATERIAL" || changed.includes("category")) {
        return { ok: false as const, error: "This idea already has a research group, so only minor corrections can be made here. A change of direction is made in the group (coordinator tools), where everyone sees it." };
      }
      kind = "MINOR";
    } else if (supporters.length > 0) {
      if (!opts.kind) return { ok: false as const, error: "People already support this idea. Please say whether this is a minor correction or a material change." };
      if (changed.includes("category") && opts.kind !== "MATERIAL") return { ok: false as const, error: "Changing the area is a material change. Choose “Material change” to save it." };
    }
    const reset = kind === "MATERIAL" && supporters.length > 0;

    const before = Object.fromEntries((Object.keys(IDEA_TEXT_FIELDS) as IdeaTextField[]).map((f) => [f, idea[f] ?? null]));
    await tx.ideaRevision.create({ data: { ideaId, editorId: userId, kind, before, changedFields: changed, supportersBefore: supporters.length, supportReset: reset } });
    await tx.businessIdea.update({ where: { id: ideaId }, data: { ...input, editedAt: new Date(), lastActivityAt: new Date() } });
    if (reset) {
      await tx.ideaEndorsement.deleteMany({ where: { ideaId } });
      await evaluateIdea(tx, { id: ideaId, authorId: idea.authorId, status: idea.status }, threshold);
    }
    return { ok: true as const, changed: true as const, kind, reset, supporters, title: input.title };
  });
  if (!outcome.ok || !outcome.changed) return outcome.ok ? { ok: true as const } : outcome;

  // Supporters are always told when an idea they support changes.
  if (outcome.supporters.length) {
    await afterSaved("notify supporters of change", () =>
      notify(
        outcome.supporters,
        outcome.reset
          ? {
              type: "IDEA_CHANGED",
              title: `The idea “${outcome.title}” was changed materially`,
              body: "Its author changed what the idea is about, so earlier support no longer counts. Read the new version and support it again if you still agree.",
              link: `/community/ideas/${ideaId}`,
            }
          : {
              type: "IDEA_CHANGED",
              title: `The idea “${outcome.title}” was corrected`,
              body: "Its author made a minor correction. Your support still counts. You can see what changed on the idea page and withdraw your support if you no longer agree.",
              link: `/community/ideas/${ideaId}#history`,
            },
      ),
    );
  }
  return { ok: true as const, reset: outcome.reset };
}

/** The history of an idea, newest first, with who made each change. */
export async function ideaRevisions(ideaId: string) {
  return db.ideaRevision.findMany({
    where: { ideaId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, kind: true, before: true, changedFields: true, supportersBefore: true, supportReset: true, createdAt: true, editor: { select: { profile: { select: { displayName: true } } } } },
  });
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

type CreatedGroup = { id: string; slug: string; name: string; memberIds: string[]; authorId: string | null };

/**
 * Something that happens after the main change was saved (a notification, an
 * audit entry). If it fails, the failure is logged and the next step still
 * runs; it never turns a saved change into an error for the person.
 */
async function afterSaved(label: string, step: () => Promise<unknown>) {
  try {
    await step();
  } catch (err) {
    logger.error("idea.followup_failed", { label, err });
  }
}

/**
 * The ONE place that decides how much support an idea has. Must run inside a
 * transaction that holds the idea's row lock.
 *
 * Only supporters who are active members right now count (not the author, not
 * people whose account is suspended or whose community access is paused or
 * removed). That number is stored on the idea, so the number shown to members
 * is always the number used for the decision. When it reaches the threshold
 * and the idea is still open, the research group is created.
 */
async function evaluateIdea(tx: Prisma.TransactionClient, idea: { id: string; authorId: string | null; status: string }, threshold: number): Promise<{ count: number; group: CreatedGroup | null }> {
  const eligible = await tx.ideaEndorsement.findMany({
    where: { ideaId: idea.id, user: ACTIVE_MEMBER, ...(idea.authorId ? { userId: { not: idea.authorId } } : {}) },
    orderBy: { createdAt: "asc" },
    select: { userId: true },
  });
  await tx.businessIdea.update({ where: { id: idea.id }, data: { endorsementCount: eligible.length } });
  let group: CreatedGroup | null = null;
  if (idea.status === "OPEN" && eligible.length >= threshold) {
    const existing = await tx.researchGroup.findUnique({ where: { ideaId: idea.id }, select: { id: true } });
    if (!existing) group = await createGroupFromIdea(tx, idea.id, eligible.map((e) => e.userId));
  }
  return { count: eligible.length, group };
}

/** Audit entry and notifications for an automatically created group (after the transaction committed). */
async function announceGroupCreated(g: CreatedGroup, ideaId: string, title: string, threshold: number) {
  await afterSaved("audit group.auto_created", () => audit(null, "group.auto_created", "ResearchGroup", g.id, { ideaId, threshold, initialMembers: g.memberIds.length }));
  if (g.authorId) {
    await afterSaved("notify author", () =>
      notify([g.authorId!], {
        type: "IDEA_GROUP_CREATED",
        title: `Your idea “${title}” has attracted enough support. A research group has been created.`,
        body: "You coordinate the group. This means the idea is ready to investigate together, not that its success is proven.",
        link: `/community/groups/${g.slug}`,
      }),
    );
  }
  await afterSaved("notify founding members", () =>
    notify(
      g.memberIds,
      {
        type: "GROUP_MEMBERSHIP",
        title: `You are a founding member of “${g.name}”`,
        body: "Your support helped create this research group to investigate the idea. You can leave the group at any time.",
        link: `/community/groups/${g.slug}`,
      },
      { exclude: g.authorId ?? undefined },
    ),
  );
}

/**
 * Endorses an idea. Concurrency-safe: the idea row is locked FOR UPDATE, so
 * simultaneous endorsements are processed one after another and exactly one
 * group can be created when the threshold is reached. The database unique
 * constraint on ResearchGroup.ideaId is a second, absolute guard.
 */
export async function endorseIdea(userId: string, ideaId: string): Promise<EndorseResult> {
  const threshold = await getSetting("community.endorsementThreshold");
  const endorser = await db.user.findFirst({ where: { id: userId, ...ACTIVE_MEMBER }, select: { id: true } });
  if (!endorser) return { ok: false, error: "Only active members can support ideas." };

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
    await tx.businessIdea.update({ where: { id: ideaId }, data: { lastActivityAt: new Date() } });
    const evaluated = await evaluateIdea(tx, idea, threshold);
    return { ok: true as const, ...evaluated };
  });

  if (!outcome.ok) return outcome;

  // Follow-up steps run after the transaction committed; none of them can undo or hide the saved support.
  if (newlyEndorsed && authorId) {
    await afterSaved("notify idea author", () =>
      notify([authorId!], {
        type: "IDEA_ENDORSED",
        title: `Your idea “${title}” has a new supporter`,
        link: `/community/ideas/${ideaId}`,
        dedupeKey: `endorse:${ideaId}`,
      }),
    );
  }
  const g = outcome.group;
  if (g) await announceGroupCreated(g, ideaId, title, threshold);
  return { ok: true, endorsed: true, groupCreated: g ? { slug: g.slug } : null, count: outcome.count };
}

/** Withdraws an endorsement. If a group already exists it is NOT affected. */
export async function withdrawEndorsement(userId: string, ideaId: string) {
  const threshold = await getSetting("community.endorsementThreshold");
  return db.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: string; authorId: string | null; status: string }[]>`
      SELECT "id", "authorId", "status"::text AS "status" FROM "BusinessIdea" WHERE "id" = ${ideaId} FOR UPDATE`;
    const res = await tx.ideaEndorsement.deleteMany({ where: { ideaId, userId } });
    // Withdrawing can only lower the number, so no group can form here; a formed group stays.
    const count = locked[0] ? (await evaluateIdea(tx, { ...locked[0], status: "CLOSED" }, threshold)).count : 0;
    return { ok: true as const, removed: res.count === 1, count };
  });
}

/**
 * Re-checks open ideas after something changed who counts as a supporter:
 * someone's account or community access changed (`userId`), or the threshold
 * setting changed (no argument = every open idea). Stored numbers are brought
 * up to date, and a group is created for any idea that now has enough support.
 */
export async function reevaluateIdeas(userId?: string): Promise<{ checked: number; groupsCreated: number }> {
  const threshold = await getSetting("community.endorsementThreshold");
  const ideas = await db.businessIdea.findMany({
    where: { status: "OPEN", ...(userId ? { endorsements: { some: { userId } } } : {}) },
    select: { id: true },
  });
  let groupsCreated = 0;
  for (const { id } of ideas) {
    const result = await db.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string; authorId: string | null; status: string; title: string }[]>`
        SELECT "id", "authorId", "status"::text AS "status", "title" FROM "BusinessIdea" WHERE "id" = ${id} FOR UPDATE`;
      const idea = locked[0];
      if (!idea || idea.status !== "OPEN") return null;
      return { title: idea.title, ...(await evaluateIdea(tx, idea, threshold)) };
    });
    if (result?.group) {
      groupsCreated++;
      await announceGroupCreated(result.group, id, result.title, threshold);
    }
  }
  return { checked: ideas.length, groupsCreated };
}
