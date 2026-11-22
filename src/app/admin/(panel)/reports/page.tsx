import Link from "next/link";
import { AdminHeader, Empty, Flash, Panel, fmtDate, smallInput } from "@/components/admin/ui";
import { readFlash } from "@/lib/flash";
import { Badge, buttonClass } from "@/components/ui/primitives";
import { requireAdmin } from "@/lib/auth/guard";
import { can } from "@/lib/auth/permissions";
import { REPORT_REASONS } from "@/lib/validation/community";
import { listReports, recordPrivateReportView } from "@/server/community/reports";
import { moderateAction } from "../../actions/community";

type Props = { searchParams: Promise<Record<string, string | undefined>> };

const TARGET = { IDEA: "Idea", COMMENT: "Comment", DISCUSSION: "Group discussion", MESSAGE: "Group chat message", GROUP: "Research group", USER: "Member profile" } as const;

export default async function ReportsPage({ searchParams }: Props) {
  const admin = await requireAdmin("moderation.act");
  const sp = await searchParams;
  const status = sp.status === "ACTIONED" || sp.status === "DISMISSED" ? sp.status : "OPEN";
  const reports = await listReports(status);
  await recordPrivateReportView(admin.id, reports);
  return (
    <>
      <AdminHeader
        title="Reports & moderation"
        description="Reports from members. You see a copy of the reported content captured when it was reported. Private group chat is only visible here, through reports; there is no other admin access to it."
      />
      <Flash {...readFlash(sp)} />
      <div className="mt-6 flex gap-2">
        {(["OPEN", "ACTIONED", "DISMISSED"] as const).map((s) => (
          <Link key={s} href={`/admin/reports?status=${s}`} className={buttonClass(status === s ? "primary" : "secondary", "sm")}>
            {s === "OPEN" ? "Open" : s === "ACTIONED" ? "Actioned" : "Dismissed"}
          </Link>
        ))}
      </div>
      <div className="mt-4 space-y-4">
        {!reports.length && (
          <Panel>
            <Empty>No {status.toLowerCase()} reports.</Empty>
          </Panel>
        )}
        {reports.map((r) => (
          <Panel key={r.id} title={`${TARGET[r.targetType]} · ${REPORT_REASONS[r.reason]}`} actions={<span className="text-xs text-ink-500">{fmtDate(r.createdAt, true)}</span>}>
            <p className="text-sm text-ink-600">
              Reported by {r.reporter?.profile?.displayName ?? r.reporter?.email ?? "a former member"}
              {r.targetType === "USER" && (
                <>
                  {" "}
                  ·{" "}
                  <Link href={`/admin/members/${r.targetId}`} className="text-accent-700 hover:underline">
                    view member
                  </Link>
                </>
              )}
              {r.targetType === "GROUP" && (
                <>
                  {" "}
                  ·{" "}
                  <Link href={`/admin/groups/${r.targetId}`} className="text-accent-700 hover:underline">
                    view group
                  </Link>
                </>
              )}
            </p>
            {r.details && <p className="mt-2 text-sm text-ink-800">“{r.details}”</p>}
            <pre className="mt-3 max-h-60 overflow-auto whitespace-pre-wrap rounded-md bg-ink-50 p-3 font-sans text-sm text-ink-900">{r.snapshot}</pre>
            {r.status === "OPEN" ? (
              <form action={moderateAction} className="mt-4 flex flex-wrap items-end gap-2">
                <input type="hidden" name="id" value={r.id} />
                <div className="min-w-60 flex-1">
                  <label htmlFor={`note-${r.id}`} className="block text-xs font-medium text-ink-700">
                    Note (recorded in the audit log)
                  </label>
                  <input id={`note-${r.id}`} name="note" maxLength={500} className={smallInput} />
                </div>
                <button name="action" value="dismiss" className={buttonClass("secondary", "sm")}>
                  Dismiss
                </button>
                <button name="action" value="remove" className={buttonClass("danger", "sm")}>
                  {r.targetType === "GROUP" ? "Suspend group" : r.targetType === "USER" ? "Mark actioned" : "Remove content"}
                </button>
                {can(admin.role, "members.suspend") && r.targetType !== "GROUP" && (
                  <button name="action" value="suspend_author" className={buttonClass("danger", "sm")}>
                    Remove &amp; suspend author
                  </button>
                )}
              </form>
            ) : (
              <p className="mt-3 text-sm text-ink-600">
                <Badge>{r.status === "ACTIONED" ? "Actioned" : "Dismissed"}</Badge> by {r.resolvedBy?.name ?? "—"} · {fmtDate(r.resolvedAt, true)} · {r.resolution}
              </p>
            )}
          </Panel>
        ))}
      </div>
    </>
  );
}
