import "server-only";
import { STARTER_IDEAS } from "@/content/opening";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { isReservedTestAddress } from "@/ops/launch-checks";

/**
 * Publishes the founder's two starting ideas once, with no endorsements.
 * A removed or closed copy is left alone. A missing owner means nothing is created.
 */
export async function ensureStarterIdeas() {
  try {
    const owners = await db.user.findMany({
      where: { role: "OWNER", status: "ACTIVE" },
      orderBy: { createdAt: "asc" },
      select: { id: true, email: true, name: true },
    });
    const owner = owners.find((u) => !isReservedTestAddress(u.email));
    if (!owner) return;

    await db.memberProfile.upsert({
      where: { userId: owner.id },
      update: {},
      create: {
        userId: owner.id,
        displayName: owner.name.slice(0, 60) || "Founder",
      },
    });

    for (const idea of STARTER_IDEAS) {
      await db.$transaction(async (tx) => {
        const existing = await tx.businessIdea.findFirst({
          where: { description: { contains: idea.marker } },
          select: { id: true },
        });
        if (existing) return;
        await tx.businessIdea.create({
          data: {
            authorId: owner.id,
            title: idea.title,
            summary: idea.summary,
            description: idea.description,
            problem: idea.problem,
            proposal: idea.proposal,
            category: idea.category,
            links: [],
          },
        });
        logger.info("idea.starter_created", { key: idea.key });
      });
    }
  } catch (err) {
    logger.error("idea.starter_failed", { err });
  }
}
