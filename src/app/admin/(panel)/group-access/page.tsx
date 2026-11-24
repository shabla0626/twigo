import Link from "next/link";
import { AdminHeader, Empty, Flash, Table, fmtDate } from "@/components/admin/ui";
import { Badge } from "@/components/ui/primitives";
import { requireAdmin } from "@/lib/auth/guard";
import { readFlash } from "@/lib/flash";
import { SCOPE_LABELS, STATUS_TEXT, isActive, listGroupAccess } from "@/server/admin/group-access";

type Props = { searchParams: Promise<Record<string, string | undefined>> };

/** Requests for temporary access to a group's private information. Administrators see their own; the owner sees all. */
export default async function GroupAccessPage({ searchParams }: Props) {
  const admin = await requireAdmin("group_access.request");
  const rows = await listGroupAccess(admin);
  const now = new Date();
  return (
    <>
      <AdminHeader
        title="Group access"
        description="A group’s chat, research, files, tasks, decisions and projects are private to its members. An administrator can look into them only to investigate a report filed by a member of that group, after asking here and only with the owner’s approval, for the information and period the owner sets. Access ends automatically; every request, decision and view is recorded. To ask, open the report under Moderation."
      />
      <Flash {...readFlash(await searchParams)} />
      <div className="mt-6">
        <Table head={["Group", "Requested by", "Report", "Information", "Status", "Period (UTC)", ""]} empty={rows.length === 0 ? <Empty>No requests.</Empty> : undefined}>
          {rows.map((r) => {
            const active = isActive(r, now);
            const ended = r.status === "APPROVED" && r.expiresAt && r.expiresAt <= now;
            return (
              <tr key={r.id}>
                <td className="px-4 py-3 font-medium">{r.group.name}</td>
                <td className="px-4 py-3">{r.requestedBy?.name ?? "former administrator"}</td>
                <td className="px-4 py-3 text-ink-700">
                  {r.report.targetType.toLowerCase()} · {r.report.reason.toLowerCase().replace(/_/g, " ")} · {fmtDate(r.report.createdAt)}
                </td>
                <td className="px-4 py-3 text-ink-700">{(r.status === "PENDING" ? r.requestedScope : r.grantedScope).map((s) => SCOPE_LABELS[s]).join("; ") || "—"}</td>
                <td className="px-4 py-3">
                  <Badge tone={active ? "success" : r.status === "PENDING" ? "warn" : "neutral"}>{active ? "Active now" : ended ? "Expired" : STATUS_TEXT[r.status]}</Badge>
                </td>
                <td className="px-4 py-3 tabular-nums text-ink-700">{r.startsAt && r.expiresAt ? `${fmtDate(r.startsAt, true)} – ${fmtDate(r.expiresAt, true)}` : `${r.requestedHours} h requested`}</td>
                <td className="px-4 py-3">
                  <Link href={`/admin/group-access/${r.id}`} className="text-sm font-medium text-accent-700 underline underline-offset-2">
                    Open
                  </Link>
                </td>
              </tr>
            );
          })}
        </Table>
      </div>
    </>
  );
}
