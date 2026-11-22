import Link from "next/link";
import { AdminHeader, Empty, Table, fmtDate } from "@/components/admin/ui";
import { Badge } from "@/components/ui/primitives";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/guard";
import { GROUP_STATUS_LABELS } from "@/server/community/group-labels";

export default async function GroupsAdminPage() {
  await requireAdmin("groups.manage");
  const groups = await db.researchGroup.findMany({
    orderBy: [{ status: "asc" }, { lastActivityAt: "desc" }],
    include: { memberships: { where: { status: "ACTIVE", role: "COORDINATOR" }, select: { user: { select: { profile: { select: { displayName: true } } } } } }, project: { select: { id: true } } },
  });
  return (
    <>
      <AdminHeader title="Research groups" description="Groups that need attention appear first: ready for review, without a coordinator, or suspended." />
      <div className="mt-6">
        <Table head={["Group", "Stage", "Members", "Coordinator", "Last activity", "Flags"]} empty={!groups.length && <Empty>No groups yet. Groups form automatically from endorsed ideas.</Empty>}>
          {[...groups]
            .sort((a, b) => Number(b.status === "READY_FOR_REVIEW" || b.adminManaged || Boolean(b.suspendedAt)) - Number(a.status === "READY_FOR_REVIEW" || a.adminManaged || Boolean(a.suspendedAt)))
            .map((g) => (
              <tr key={g.id}>
                <td className="px-4 py-3">
                  <Link href={`/admin/groups/${g.id}`} className="font-medium text-accent-700 hover:underline">
                    {g.name}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <Badge tone={g.status === "READY_FOR_REVIEW" ? "warn" : g.status === "APPROVED_FOR_PROJECT" ? "success" : "neutral"}>{GROUP_STATUS_LABELS[g.status]}</Badge>
                </td>
                <td className="px-4 py-3 tabular-nums">{g.memberCount}</td>
                <td className="px-4 py-3">{g.memberships[0]?.user.profile?.displayName ?? <span className="text-amber-700">None</span>}</td>
                <td className="px-4 py-3 text-ink-600">{fmtDate(g.lastActivityAt)}</td>
                <td className="space-x-1 px-4 py-3">
                  {g.suspendedAt && <Badge tone="danger">Suspended</Badge>}
                  {g.adminManaged && <Badge tone="warn">Needs coordinator</Badge>}
                  {g.project && <Badge tone="success">Project</Badge>}
                </td>
              </tr>
            ))}
        </Table>
      </div>
    </>
  );
}
