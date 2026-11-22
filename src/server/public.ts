import "server-only";
import { db } from "@/lib/db";
import { PROJECT_STATUSES } from "@/lib/labels";
import { logger } from "@/lib/logger";

/**
 * Public, published project opportunities. Selects ONLY fields intended for
 * public display: never participants, assignments or compensation.
 */
export async function getPublishedOpportunities() {
  try {
    const projects = await db.project.findMany({
      where: { isPublished: true, status: { in: ["SEEKING_PARTICIPANTS", "PLANNING", "READY"] } },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        publicSummary: true,
        category: true,
        status: true,
        roles: { select: { title: true, skills: { select: { skill: { select: { label: true } } } } } },
      },
    });
    return projects.map((p) => ({
      id: p.id,
      title: p.title,
      publicSummary: p.publicSummary,
      category: p.category,
      statusLabel: PROJECT_STATUSES[p.status],
      roles: p.roles.map((r) => ({ title: r.title, skills: r.skills.map((s) => s.skill.label) })),
    }));
  } catch (err) {
    logger.error("public.opportunities_failed", { err });
    return [];
  }
}
