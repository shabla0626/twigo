import Link from "next/link";
import { AdminHeader, Empty, Table, fmtDate } from "@/components/admin/ui";
import { Badge } from "@/components/ui/primitives";
import { requireAdmin } from "@/lib/auth/guard";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { AGREEMENT_STATUSES } from "@/lib/labels";
import { PROJECT_STATUS_LABELS } from "@/server/community/group-projects";

/**
 * Group-led projects: only how many exist in each state (no names, participants or terms; those are private
 * to the group). Plus, for the owner, the compensation records of the earlier administrator-run projects.
 * Nobody here can change an agreement: the participants decide.
 */
export default async function AdminAgreementsPage() {
  const admin = await requireAdmin("agreements.view");
  const owner = can(admin.role, "compensation.view");
  // Group projects are private to their groups: administrators see only how many exist in each state,
  // never their names, members or terms (those need an owner-approved investigation; Admin, Group access).
  const byStatus = await db.groupProject.groupBy({ by: ["status"], _count: { _all: true } });
  // Owner only: the compensation records of the earlier, administrator-run projects, in one list.
  const earlier = owner
    ? await db.compensationAgreement.findMany({
        orderBy: { updatedAt: "desc" },
        take: 200,
        select: {
          id: true, basis: true, amountMinor: true, currency: true, status: true, agreedAt: true, updatedAt: true,
          assignment: { select: { project: { select: { id: true, title: true } }, participant: { select: { applicant: { select: { fullName: true } } } } } },
        },
      })
    : [];
  return (
    <>
      <AdminHeader
        title="Project agreements"
        description="Projects created by groups. The platform is not a party to them and takes no share. Administrators cannot edit an agreement or decide compensation."
      />
      <div className="mt-6">
        <Table head={["State", "Group projects"]} empty={byStatus.length === 0 ? <Empty>No group has created a project yet.</Empty> : undefined}>
          {byStatus.map((b) => (
            <tr key={b.status}>
              <td className="px-4 py-3">
                <Badge tone={b.status === "ACTIVE" ? "success" : "neutral"}>{PROJECT_STATUS_LABELS[b.status]}</Badge>
              </td>
              <td className="px-4 py-3 tabular-nums">{b._count._all}</td>
            </tr>
          ))}
        </Table>
        <p className="mt-3 text-xs text-ink-500">
          Group projects and their agreements are private to each group. Their names, participants and terms are not shown to administrators.
        </p>
      </div>
      {owner && (
        <section className="mt-10" aria-labelledby="earlier-heading">
          <h2 id="earlier-heading" className="text-lg font-semibold text-ink-950">Earlier compensation records (owner only)</h2>
          <p className="mt-1 text-sm text-ink-600">Records of the earlier, administrator-run projects. Open a project to see or change its terms.</p>
          <div className="mt-4">
            <Table head={["Project", "Person", "Basis", "Amount", "Status", "Updated"]} empty={earlier.length === 0 ? <Empty>No earlier compensation records.</Empty> : undefined}>
              {earlier.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-3">
                    <Link href={`/admin/projects/${c.assignment.project.id}`} className="underline underline-offset-2">
                      {c.assignment.project.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{c.assignment.participant.applicant.fullName}</td>
                  <td className="px-4 py-3 text-ink-700">{c.basis ?? "—"}</td>
                  <td className="px-4 py-3 tabular-nums">{c.amountMinor != null ? `${c.currency ?? ""} ${(c.amountMinor / 100).toFixed(2)}` : "—"}</td>
                  <td className="px-4 py-3">{AGREEMENT_STATUSES[c.status]}</td>
                  <td className="px-4 py-3 text-ink-600">{fmtDate(c.updatedAt)}</td>
                </tr>
              ))}
            </Table>
          </div>
        </section>
      )}
    </>
  );
}
