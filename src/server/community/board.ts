import "server-only";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { publishRealtime } from "@/lib/realtime-events";
import type { IdeaInput } from "@/lib/validation/community";
import { notify } from "./notifications";

const authorSelect = { id: true, profile: { select: { displayName: true } } } as const;

function shown(user: { id: string; profile: { displayName: string } | null } | null) {
  if (!user) return null;
  return { id: user.id, displayName: user.profile?.displayName ?? "Former member" };
}

export async function listArticles() {
  return db.boardArticle.findMany({
    where: { removedAt: null },
    orderBy: { lastActivityAt: "desc" },
    take: 40,
    include: { author: { select: authorSelect } },
  });
}

export async function recognizedPieces() {
  return db.boardArticle.findMany({
    where: { removedAt: null, recognitionCount: { gt: 0 } },
    orderBy: [{ recognitionCount: "desc" }, { lastActivityAt: "desc" }],
    take: 5,
    include: { author: { select: authorSelect } },
  });
}

/** Writers whose pieces have received the most member marks. */
export async function recognizedWriters() {
  const grouped = await db.boardArticle.groupBy({
    by: ["authorId"],
    where: { removedAt: null, authorId: { not: null }, recognitionCount: { gt: 0 } },
    _sum: { recognitionCount: true },
    orderBy: { _sum: { recognitionCount: "desc" } },
    take: 5,
  });
  const ids = grouped.flatMap((g) => (g.authorId ? [g.authorId] : []));
  const profiles = ids.length ? await db.memberProfile.findMany({ where: { userId: { in: ids } }, select: { userId: true, displayName: true } }) : [];
  const names = new Map(profiles.map((p) => [p.userId, p.displayName]));
  return grouped.flatMap((g) =>
    g.authorId ? [{ id: g.authorId, displayName: names.get(g.authorId) ?? "Former member", marks: g._sum.recognitionCount ?? 0 }] : [],
  );
}

export async function getArticle(id: string) {
  const article = await db.boardArticle.findUnique({
    where: { id },
    include: {
      author: { select: authorSelect },
      ideas: {
        where: { status: { not: "REMOVED" } },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, title: true, status: true, authorId: true, endorsementCount: true, group: { select: { slug: true, name: true } } },
      },
    },
  });
  if (!article || article.removedAt) return null;
  return article;
}

export async function viewerMarked(articleId: string, userId: string) {
  const row = await db.articleRecognition.findUnique({ where: { articleId_userId: { articleId, userId } }, select: { articleId: true } });
  return Boolean(row);
}

/** The author and everyone with a visible comment. These are the people who can propose an idea from the piece. */
export async function discussionParticipants(articleId: string) {
  const [article, comments] = await Promise.all([
    db.boardArticle.findUnique({ where: { id: articleId }, select: { author: { select: authorSelect } } }),
    db.comment.findMany({
      where: { articleId, deletedAt: null, removedAt: null, authorId: { not: null } },
      distinct: ["authorId"],
      select: { author: { select: authorSelect } },
    }),
  ]);
  const people = new Map<string, string>();
  const author = shown(article?.author ?? null);
  if (author) people.set(author.id, author.displayName);
  for (const c of comments) {
    const person = shown(c.author);
    if (person) people.set(person.id, person.displayName);
  }
  return [...people].map(([id, displayName]) => ({ id, displayName }));
}

export async function createArticle(authorId: string, input: { title: string; body: string }) {
  if (!rateLimit(`article:create:${authorId}`, 8, 24 * 3600_000).ok) {
    return { ok: false as const, error: "You have published several pieces today. Please try again tomorrow." };
  }
  const article = await db.boardArticle.create({ data: { authorId, title: input.title, body: input.body } });
  await publishRealtime(db, { t: "board.updated", articleId: article.id });
  return { ok: true as const, id: article.id };
}

export async function removeArticle(userId: string, articleId: string) {
  const article = await db.boardArticle.findUnique({ where: { id: articleId }, select: { authorId: true, removedAt: true } });
  if (!article || article.removedAt || article.authorId !== userId) return { ok: false as const, error: "You can only remove your own piece." };
  await db.boardArticle.update({ where: { id: articleId }, data: { removedAt: new Date(), removedReason: "Removed by the author." } });
  await publishRealtime(db, { t: "board.updated", articleId });
  return { ok: true as const };
}

/** Toggles one member's mark. The author cannot mark their own piece, and each member marks a piece once. */
export async function recognizeArticle(userId: string, articleId: string) {
  const article = await db.boardArticle.findUnique({ where: { id: articleId }, select: { authorId: true, removedAt: true } });
  if (!article || article.removedAt) return { ok: false as const, error: "This piece is not available." };
  if (article.authorId === userId) return { ok: false as const, error: "You cannot mark your own piece." };
  const existing = await db.articleRecognition.findUnique({ where: { articleId_userId: { articleId, userId } }, select: { articleId: true } });
  await db.$transaction(async (tx) => {
    if (existing) await tx.articleRecognition.delete({ where: { articleId_userId: { articleId, userId } } });
    else await tx.articleRecognition.create({ data: { articleId, userId } });
    const n = await tx.articleRecognition.count({ where: { articleId } });
    await tx.boardArticle.update({ where: { id: articleId }, data: { recognitionCount: n } });
  });
  await publishRealtime(db, { t: "board.updated", articleId });
  return { ok: true as const, marked: !existing };
}

/**
 * A person who wrote the piece or commented on it proposes a business idea linked to it.
 * The existing support rule still opens the project group: the idea's author does not count,
 * and the group opens only after the configured number of other members support it.
 */
export async function createIdeaFromDiscussion(authorId: string, articleId: string, input: IdeaInput) {
  if (!rateLimit(`idea:create:${authorId}`, 10, 24 * 3600_000).ok) {
    return { ok: false as const, error: "You have published many ideas today. Please try again tomorrow." };
  }
  const article = await db.boardArticle.findUnique({ where: { id: articleId }, select: { id: true, title: true, removedAt: true } });
  if (!article || article.removedAt) return { ok: false as const, error: "This discussion is not available." };
  const people = await discussionParticipants(articleId);
  if (!people.some((p) => p.id === authorId)) {
    return { ok: false as const, error: "Only people who took part in this discussion can propose an idea from it. Comment on the piece first." };
  }
  const existing = await db.businessIdea.findFirst({ where: { sourceArticleId: articleId, status: { not: "REMOVED" } }, select: { id: true } });
  if (existing) return { ok: false as const, error: "This discussion already has an idea. Support that idea to help open a project group." };
  const idea = await db.businessIdea.create({ data: { ...input, authorId, sourceArticleId: articleId } });
  await publishRealtime(db, { t: "board.updated", articleId });
  await notify(
    people.map((p) => p.id),
    {
      type: "DISCUSSION_REPLY",
      title: `An idea was proposed from “${article.title}”`,
      body: "Read it and support it if you want to investigate it together. A project group opens when enough members besides the author support it.",
      link: `/community/ideas/${idea.id}`,
    },
    { exclude: authorId },
  );
  return { ok: true as const, id: idea.id };
}
