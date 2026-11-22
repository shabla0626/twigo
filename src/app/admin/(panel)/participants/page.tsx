import Link from "next/link";
import type { ParticipantStatus, WorkCategory } from "@prisma/client";
import { AdminHeader, Empty, Flash, Table, fmtDate, smallInput, smallLabel } from "@/components/admin/ui";
import { readFlash } from "@/lib/flash";
import { Badge, buttonClass } from "@/components/ui/primitives";
import { requireAdmin } from "@/lib/auth/guard";
import { PARTICIPANT_STATUSES, WORK_CATEGORIES } from "@/lib/labels";
import { listParticipants } from "@/server/admin/participants";

type SP = Promise<Record<string, string | undefined>>;

export default async function ParticipantsPage({ searchParams }: { searchParams: SP }) {
  await requireAdmin("participants.manage");
  const sp = await searchParams;
  const status = sp.status && sp.status in PARTICIPANT_STATUSES ? (sp.status as ParticipantStatus) : undefined;
  const category = sp.category && sp.category in WORK_CATEGORIES ? (sp.category as WorkCategory) : undefined;
  const rows = await listParticipants({ status, category });

  return (
    <>
      <AdminHeader
        title="Participants"
        description="Accepted applicants. Participant records are created automatically when an application is accepted."
      />
      <Flash ok={readFlash(sp).ok} />
      <form className="mt-6 flex flex-wrap items-end gap-3 rounded-lg border border-ink-200 bg-white p-4 shadow-sm">
        <div>
          <label htmlFor="status" className={smallLabel}>
            Status
          </label>
          <select id="status" name="status" defaultValue={status ?? ""} className={smallInput}>
            <option value="">All</option>
            {Object.entries(PARTICIPANT_STATUSES).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="category" className={smallLabel}>
            Preferred category
          </label>
          <select id="category" name="category" defaultValue={category ?? ""} className={smallInput}>
            <option value="">All</option>
            {Object.entries(WORK_CATEGORIES).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className={buttonClass("primary", "sm")}>
          Filter
        </button>
      </form>
      <div className="mt-6">
        <Table
          head={["Name", "Status", "Skills", "Hours/week", "Open assignments", "Joined"]}
          empty={rows.length === 0 ? <Empty>No participants yet. Accept an application to add one.</Empty> : undefined}
        >
          {rows.map((p) => (
            <tr key={p.id} className="hover:bg-ink-50">
              <td className="px-4 py-3">
                <Link href={`/admin/participants/${p.id}`} className="font-medium text-ink-950 hover:underline">
                  {p.applicant.fullName}
                </Link>
                <div className="text-xs text-ink-500">
                  {p.applicant.country} · {p.applicant.timeZone}
                </div>
              </td>
              <td className="px-4 py-3">
                <Badge tone={p.status === "ACTIVE" ? "success" : "neutral"}>{PARTICIPANT_STATUSES[p.status]}</Badge>
              </td>
              <td className="max-w-xs px-4 py-3 text-ink-700">{p.skillsSummary ?? "—"}</td>
              <td className="px-4 py-3 tabular-nums">{p.hoursPerWeek ?? "—"}</td>
              <td className="px-4 py-3 tabular-nums">{p._count.assignments}</td>
              <td className="whitespace-nowrap px-4 py-3 text-ink-600">{fmtDate(p.joinedAt)}</td>
            </tr>
          ))}
        </Table>
      </div>
    </>
  );
}
