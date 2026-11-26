import "server-only";
import type { CulturalKind } from "@prisma/client";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

export async function listCulturalWorks() {
  return db.culturalWork.findMany({
    where: { removedAt: null },
    orderBy: { createdAt: "desc" },
    take: 60,
    include: { author: { select: { id: true, profile: { select: { displayName: true } } } } },
  });
}

export async function createCulturalWork(authorId: string, input: { kind: CulturalKind; seriesTitle: string | null; title: string; body: string }) {
  if (!rateLimit(`culture:${authorId}`, 8, 24 * 3600_000).ok) return { ok: false as const, error: "You have published several installments today. Please try again tomorrow." };
  const work = await db.culturalWork.create({ data: { authorId, ...input } });
  return { ok: true as const, id: work.id };
}

export async function removeCulturalWork(userId: string, id: string) {
  const work = await db.culturalWork.findUnique({ where: { id }, select: { authorId: true, removedAt: true } });
  if (!work || work.removedAt || work.authorId !== userId) return { ok: false as const, error: "You can only remove your own installment." };
  await db.culturalWork.update({ where: { id }, data: { removedAt: new Date(), removedReason: "Removed by the author." } });
  return { ok: true as const };
}
