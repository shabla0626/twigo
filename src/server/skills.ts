import "server-only";
import type { Prisma } from "@prisma/client";

/** Upserts skills by normalized name and returns their ids in input order. */
export async function upsertSkills(tx: Prisma.TransactionClient, labels: string[]): Promise<string[]> {
  const ids: string[] = [];
  for (const label of labels) {
    const name = label.toLowerCase();
    const skill = await tx.skill.upsert({ where: { name }, create: { name, label }, update: {}, select: { id: true } });
    ids.push(skill.id);
  }
  return ids;
}
