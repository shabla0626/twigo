import Link from "next/link";
import { AdminHeader, Flash, Panel, fmtDate, smallInput, smallLabel } from "@/components/admin/ui";
import { buttonClass } from "@/components/ui/primitives";
import { requireAdmin } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { readFlash } from "@/lib/flash";
import { REPORT_REASONS } from "@/lib/validation/community";
import { MAX_ACCESS_DAYS, SCOPES, SCOPE_LABELS, eligibleReport } from "@/server/admin/group-access";
import { requestGroupAccessAction } from "../../../actions/group-access";

type Props = { searchParams: Promise<Record<string, string | undefined>> };

/** An administrator asks the owner for temporary access to investigate one report. */
export default async function NewGroupAccessPage({ searchParams }: Props) {
  await requireAdmin("group_access.request");
  const sp = await searchParams;
  const rep = await eligibleReport(sp.report ?? "");
  const group = rep.ok ? await db.researchGroup.findUnique({ where: { id: rep.report.groupId }, select: { name: true } }) : null;
  return (
    <>
      <p className="mb-4 text-sm">
        <Link href="/admin/reports" className="text-accent-700 hover:underline">
          ← Moderation
        </Link>
      </p>
      <AdminHeader title="Request access to investigate a report" description="Nothing becomes visible when you send this. The owner decides which information you may see and for how long." />
      <Flash {...readFlash(sp)} />
      {!rep.ok ? (
        <Panel>
          <p className="text-sm text-ink-800">{rep.error}</p>
        </Panel>
      ) : (
        <Panel title={`Group: ${group?.name ?? "unknown"}`}>
          <p className="text-sm text-ink-700">
            Report: {rep.report.targetType.toLowerCase()} · {REPORT_REASONS[rep.report.reason]} · {fmtDate(rep.report.createdAt, true)} · filed by a member of this group
          </p>
          <form action={requestGroupAccessAction} className="mt-4 space-y-4 text-sm">
            <input type="hidden" name="reportId" value={rep.report.id} />
            <fieldset>
              <legend className={smallLabel}>Information you need (only what the investigation requires)</legend>
              <div className="space-y-1">
                {SCOPES.map((s) => (
                  <label key={s} className="flex items-center gap-2">
                    <input type="checkbox" name="scope" value={s} /> {SCOPE_LABELS[s]}
                  </label>
                ))}
              </div>
            </fieldset>
            <div>
              <label htmlFor="reason" className={smallLabel}>
                Why access is needed (shown to the owner and kept in the record)
              </label>
              <textarea id="reason" name="reason" rows={4} required minLength={20} maxLength={2000} className={smallInput} />
            </div>
            <div>
              <label htmlFor="hours" className={smallLabel}>
                Duration you ask for, in hours (at most {MAX_ACCESS_DAYS * 24}; the owner sets the actual period)
              </label>
              <input id="hours" name="hours" type="number" min={1} max={MAX_ACCESS_DAYS * 24} required className={`${smallInput} max-w-32`} />
            </div>
            <button type="submit" className={buttonClass("primary", "sm")}>
              Send to the owner
            </button>
          </form>
        </Panel>
      )}
    </>
  );
}
