import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminHeader, Dl, Flash, Panel, fmtDate, smallInput, smallLabel } from "@/components/admin/ui";
import { Badge, buttonClass } from "@/components/ui/primitives";
import { requireAdmin } from "@/lib/auth/guard";
import { ASSIGNMENT_STATUSES, PARTICIPANT_STATUSES, PROJECT_STATUSES, WORK_CATEGORIES } from "@/lib/labels";
import { getParticipant } from "@/server/admin/participants";
import { removeParticipantAction, updateParticipantAction } from "../../../actions/participants";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> };

export default async function ParticipantDetail({ params, searchParams }: Props) {
  await requireAdmin("participants.manage");
  const { id } = await params;
  const sp = await searchParams;
  const p = await getParticipant(id);
  if (!p) notFound();

  return (
    <>
      <p className="mb-4 text-sm">
        <Link href="/admin/participants" className="text-accent-700 hover:underline">
          ← All participants
        </Link>
      </p>
      <AdminHeader
        title={p.applicant.fullName}
        description={`${p.applicant.email} · joined ${fmtDate(p.joinedAt)}`}
        actions={
          p.applicationId ? (
            <Link href={`/admin/applications/${p.applicationId}`} className={buttonClass("secondary", "sm")}>
              View application
            </Link>
          ) : null
        }
      />
      <Flash ok={sp.ok} error={sp.error} />

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_20rem]">
        <Panel title="Participation record">
          <form action={updateParticipantAction} className="grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="id" value={p.id} />
            <div>
              <label htmlFor="status" className={smallLabel}>
                Status
              </label>
              <select id="status" name="status" defaultValue={p.status} className={smallInput}>
                {Object.entries(PARTICIPANT_STATUSES).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="hoursPerWeek" className={smallLabel}>
                Available hours per week
              </label>
              <input id="hoursPerWeek" name="hoursPerWeek" type="number" min={0} max={80} defaultValue={p.hoursPerWeek ?? ""} className={smallInput} />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="availabilityNotes" className={smallLabel}>
                Availability notes
              </label>
              <textarea id="availabilityNotes" name="availabilityNotes" rows={2} defaultValue={p.availabilityNotes ?? ""} className={smallInput} />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="skillsSummary" className={smallLabel}>
                Skills (organized summary)
              </label>
              <textarea id="skillsSummary" name="skillsSummary" rows={3} defaultValue={p.skillsSummary ?? ""} className={smallInput} />
            </div>
            <fieldset className="sm:col-span-2">
              <legend className={smallLabel}>Preferred project categories</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {Object.entries(WORK_CATEGORIES).map(([v, l]) => (
                  <label key={v} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="preferredCategories" value={v} defaultChecked={p.preferredCategories.includes(v as never)} className="accent-accent-700" />
                    {l}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="sm:col-span-2">
              <label htmlFor="internalNotes" className={smallLabel}>
                Internal participation notes (private)
              </label>
              <textarea id="internalNotes" name="internalNotes" rows={5} defaultValue={p.internalNotes ?? ""} className={smallInput} />
            </div>
            <div className="sm:col-span-2">
              <button type="submit" className={buttonClass("primary", "sm")}>
                Save changes
              </button>
            </div>
          </form>
        </Panel>

        <div className="space-y-6">
          <Panel title="Applicant skills">
            <div className="flex flex-wrap gap-1.5">
              {p.applicant.skills.map((s) => (
                <Badge key={s.skillId} tone={s.kind === "PRIMARY" ? "accent" : "neutral"}>
                  {s.skill.label}
                </Badge>
              ))}
            </div>
            <div className="mt-4">
              <Dl items={[["Country", p.applicant.country], ["Time zone", p.applicant.timeZone]]} />
            </div>
          </Panel>
          <Panel title="Project assignments">
            {p.assignments.length === 0 ? (
              <p className="text-sm text-ink-500">Not assigned to any project.</p>
            ) : (
              <ul className="space-y-3 text-sm">
                {p.assignments.map((a) => (
                  <li key={a.id}>
                    <Link href={`/admin/projects/${a.project.id}`} className="font-medium text-ink-950 hover:underline">
                      {a.project.title}
                    </Link>
                    <div className="text-xs text-ink-500">
                      {a.role?.title ?? "No role"} · {ASSIGNMENT_STATUSES[a.status]} · project {PROJECT_STATUSES[a.project.status]}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Remove participant">
            <form action={removeParticipantAction} className="space-y-2">
              <input type="hidden" name="id" value={p.id} />
              <p className="text-xs text-ink-600">
                Deletes the participant record, their project assignments and compensation records. The application is
                kept. Prefer setting the status to Inactive.
              </p>
              <label htmlFor="confirm" className={smallLabel}>
                Type REMOVE to confirm
              </label>
              <input id="confirm" name="confirm" autoComplete="off" className={smallInput} />
              <button type="submit" className={buttonClass("danger", "sm", "w-full")}>
                Remove participant
              </button>
            </form>
          </Panel>
        </div>
      </div>
    </>
  );
}
