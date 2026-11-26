import "server-only";
import { anonymousLabel } from "@/lib/anonymous-label";
import { db } from "@/lib/db";

export { anonymousLabel };

/** The viewer and everyone who shares an active project group with them. */
export async function teammateIds(viewerId: string): Promise<Set<string>> {
  const rows = await db.groupMembership.findMany({
    where: { userId: viewerId, status: "ACTIVE" },
    select: { group: { select: { memberships: { where: { status: "ACTIVE" }, select: { userId: true } } } } },
  });
  const ids = new Set<string>([viewerId]);
  for (const row of rows) for (const m of row.group.memberships) ids.add(m.userId);
  return ids;
}

/** Real name for yourself and for people you share a project with. Everyone else stays an anonymous account. */
export function memberLabel(id: string | null | undefined, displayName: string | null | undefined, teammates: Set<string>) {
  if (!id) return "Former member";
  if (teammates.has(id)) return displayName?.trim() || "Member";
  return anonymousLabel(id);
}
