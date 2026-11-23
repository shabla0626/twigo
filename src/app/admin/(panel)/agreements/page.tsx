import Link from "next/link";
import { AdminHeader, Empty, Table, fmtDate } from "@/components/admin/ui";
import { Badge } from "@/components/ui/primitives";
import { requireAdmin } from "@/lib/auth/guard";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { AGREEMENT_STATUS_LABELS, PROJECT_STATUS_LABELS } from "@/server/community/group-projects";

/**
 * Group-led projects and the state of their agreements. Administrators see that an agreement exists and
 * how far acceptance has come; only the owner can open the text with its financial terms. Nobody here can
 * change an agreement: the participants decide.
 */
export default async function AdminAgreementsPage() {
  const admin = await requireAdmin("agreements.view");
  const owner = can(admin.role, "compensation.view");
  const projects = await db.groupProject.findMany({
    orderBy: { updatedAt: "desc" },
    take: 200,
    include: {
      group: { select: { name: true, id: true } },
      versions: { orderBy: { version: "desc" }, take: 1, include: { participants: { select: { acceptedAt: true } } } },
    },
  });
  return (
    <>
      <AdminHeader
        title="Project agreements"
        description="Projects created by groups. The platform is not a party to them and takes no share. Administrators cannot edit an agreement or decide compensation."
      />
      <div className="mt-6">
        <Table head={["Project", "Group", "Status", "Latest agreement", "Accepted", ""]} empty={projects.length === 0 ? <Empty>No group has created a project yet.</Empty> : undefined}>
          {projects.map((p) => {
            const v = p.versions[0];
            return (
              <tr key={p.id}>
                <td className="px-4 py-3 font-medium">{p.name}</td>
                <td className="px-4 py-3">
                  <Link href={`/admin/groups/${p.group.id}`} className="underline underline-offset-2">
                    {p.group.name}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <Badge tone={p.status === "ACTIVE" ? "success" : "neutral"}>{PROJECT_STATUS_LABELS[p.status]}</Badge>
                  {p.needsLegalReview && <span className="ml-1 text-xs text-amber-800">needs review</span>}
                </td>
                <td className="px-4 py-3 text-ink-700">{v ? `v${v.version}: ${AGREEMENT_STATUS_LABELS[v.status]} (${fmtDate(v.createdAt)})` : "none"}</td>
                <td className="px-4 py-3 tabular-nums">{v ? `${v.participants.filter((x) => x.acceptedAt).length} of ${v.participants.length}` : "—"}</td>
                <td className="px-4 py-3">
                  {owner && v && v.status !== "DRAFT" ? (
                    <a href={`/api/agreements/${v.id}`} className="text-sm font-medium text-accent-700 underline underline-offset-2">
                      Download (owner)
                    </a>
                  ) : (
                    <span className="text-xs text-ink-500">{owner ? "" : "Terms visible to the owner only"}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </Table>
      </div>
    </>
  );
}
