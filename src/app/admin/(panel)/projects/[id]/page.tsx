import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminHeader, Flash, Panel, fmtDate, smallInput, smallLabel } from "@/components/admin/ui";
import { readFlash } from "@/lib/flash";
import { ProjectFields } from "@/components/admin/project-fields";
import { Badge, buttonClass } from "@/components/ui/primitives";
import { requireAdmin } from "@/lib/auth/guard";
import { can } from "@/lib/auth/permissions";
import { AGREEMENT_STATUSES, ASSIGNMENT_STATUSES, MILESTONE_STATUSES, PROJECT_STATUSES } from "@/lib/labels";
import { assignableParticipants, getProject, progressOf } from "@/server/admin/projects";
import {
  addAssignmentAction,
  addMilestoneAction,
  addRoleAction,
  assignmentStatusAction,
  deleteMilestoneAction,
  deleteProjectAction,
  deleteRoleAction,
  milestoneStatusAction,
  removeCompensationAction,
  saveCompensationAction,
  updateProjectAction,
} from "../../../actions/projects";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> };

export default async function ProjectDetail({ params, searchParams }: Props) {
  const admin = await requireAdmin("projects.manage");
  const showComp = can(admin.role, "compensation.view");
  const canDelete = can(admin.role, "projects.delete");
  const { id } = await params;
  const sp = await searchParams;
  const [project, participants] = await Promise.all([getProject(id, showComp), assignableParticipants()]);
  if (!project) notFound();
  const progress = progressOf(project.milestones);
  const assignedIds = new Set(project.assignments.map((a) => a.participantId));

  return (
    <>
      <p className="mb-4 text-sm">
        <Link href="/admin/projects" className="text-accent-700 hover:underline">
          ← All projects
        </Link>
      </p>
      <AdminHeader
        title={project.title}
        description={
          <>
            <Badge>{PROJECT_STATUSES[project.status]}</Badge>
            {project.isPublished && (
              <>
                {" "}
                <Badge tone="accent">Published</Badge>
              </>
            )}{" "}
            · Progress {progress === null ? "— (no milestones)" : `${progress}%`}
          </>
        }
      />
      <Flash {...readFlash(sp)} />

      {progress !== null && (
        <div className="mt-6" aria-label={`Milestone progress ${progress}%`}>
          <div className="h-2 w-full overflow-hidden rounded-full bg-ink-200">
            <div className="h-full bg-accent-600" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Panel title="Project information">
          <form action={updateProjectAction} className="space-y-4">
            <input type="hidden" name="id" value={project.id} />
            <ProjectFields p={project} />
            <button type="submit" className={buttonClass("primary", "sm")}>
              Save project
            </button>
          </form>
        </Panel>

        <div className="space-y-6">
          <Panel title="Roles & required skills">
            <ul className="space-y-3">
              {project.roles.map((r) => (
                <li key={r.id} className="flex items-start justify-between gap-3 rounded-md bg-ink-50 p-3 text-sm">
                  <div>
                    <p className="font-medium">
                      {r.title} <span className="font-normal text-ink-500">· {r.openings} opening{r.openings > 1 ? "s" : ""}</span>
                    </p>
                    {r.responsibilities && <p className="mt-1 whitespace-pre-wrap text-ink-700">{r.responsibilities}</p>}
                    {r.skills.length > 0 && (
                      <p className="mt-1 text-xs text-ink-500">Skills: {r.skills.map((s) => s.skill.label).join(", ")}</p>
                    )}
                  </div>
                  <form action={deleteRoleAction}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="projectId" value={project.id} />
                    <button type="submit" className="text-xs text-red-700 hover:underline">
                      Remove
                    </button>
                  </form>
                </li>
              ))}
            </ul>
            <form action={addRoleAction} className="mt-4 grid gap-3 border-t border-ink-200 pt-4 sm:grid-cols-[1fr_6rem]">
              <input type="hidden" name="projectId" value={project.id} />
              <div>
                <label htmlFor="role-title" className={smallLabel}>
                  Role title
                </label>
                <input id="role-title" name="title" required className={smallInput} />
              </div>
              <div>
                <label htmlFor="openings" className={smallLabel}>
                  Openings
                </label>
                <input id="openings" name="openings" type="number" min={1} max={50} defaultValue={1} className={smallInput} />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="role-skills" className={smallLabel}>
                  Required skills (comma separated)
                </label>
                <input id="role-skills" name="skills" className={smallInput} />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="role-resp" className={smallLabel}>
                  Responsibilities
                </label>
                <textarea id="role-resp" name="responsibilities" rows={2} className={smallInput} />
              </div>
              <div>
                <button type="submit" className={buttonClass("secondary", "sm")}>
                  Add role
                </button>
              </div>
            </form>
          </Panel>

          <Panel title="Milestones">
            <ul className="space-y-2">
              {project.milestones.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-ink-50 p-3 text-sm">
                  <div>
                    <p className={m.status === "DONE" ? "font-medium text-ink-500 line-through" : "font-medium"}>{m.title}</p>
                    <p className="text-xs text-ink-500">
                      Due {fmtDate(m.dueDate)}
                      {m.completedAt && ` · done ${fmtDate(m.completedAt)}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <form action={milestoneStatusAction} className="flex items-center gap-1">
                      <input type="hidden" name="id" value={m.id} />
                      <label htmlFor={`ms-${m.id}`} className="sr-only">
                        Milestone status
                      </label>
                      <select id={`ms-${m.id}`} name="status" defaultValue={m.status} className={`${smallInput} w-auto py-1`}>
                        {Object.entries(MILESTONE_STATUSES).map(([v, l]) => (
                          <option key={v} value={v}>
                            {l}
                          </option>
                        ))}
                      </select>
                      <button type="submit" className={buttonClass("secondary", "sm")}>
                        Set
                      </button>
                    </form>
                    <form action={deleteMilestoneAction}>
                      <input type="hidden" name="id" value={m.id} />
                      <button type="submit" className="text-xs text-red-700 hover:underline">
                        Remove
                      </button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
            <form action={addMilestoneAction} className="mt-4 grid gap-3 border-t border-ink-200 pt-4 sm:grid-cols-[1fr_10rem_auto] sm:items-end">
              <input type="hidden" name="projectId" value={project.id} />
              <div>
                <label htmlFor="ms-title" className={smallLabel}>
                  Milestone
                </label>
                <input id="ms-title" name="title" required className={smallInput} />
              </div>
              <div>
                <label htmlFor="ms-due" className={smallLabel}>
                  Due date
                </label>
                <input id="ms-due" name="dueDate" type="date" className={smallInput} />
              </div>
              <button type="submit" className={buttonClass("secondary", "sm")}>
                Add
              </button>
            </form>
          </Panel>
        </div>
      </div>

      <Panel title={showComp ? "Team assignments & compensation (private)" : "Team assignments"} className="mt-6">
        <p className="mb-4 text-xs text-ink-600">
          {showComp
            ? "Compensation records are visible only to the owner. Record terms only after they have been agreed in writing with the participant; amounts are stored in minor units (e.g. cents)."
            : "Compensation records are restricted to the owner and are not shown here."}
        </p>
        <div className="space-y-4">
          {project.assignments.map((a) => (
            <div key={a.id} className="rounded-md border border-ink-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Link href={`/admin/participants/${a.participantId}`} className="font-medium hover:underline">
                    {a.participant.applicant.fullName}
                  </Link>
                  <p className="text-xs text-ink-500">
                    {a.role?.title ?? "No role"} · {ASSIGNMENT_STATUSES[a.status]}
                  </p>
                  {a.responsibilities && <p className="mt-1 whitespace-pre-wrap text-sm text-ink-700">{a.responsibilities}</p>}
                </div>
                <form action={assignmentStatusAction} className="flex items-center gap-1">
                  <input type="hidden" name="id" value={a.id} />
                  <label htmlFor={`as-${a.id}`} className="sr-only">
                    Assignment status
                  </label>
                  <select id={`as-${a.id}`} name="status" defaultValue={a.status} className={`${smallInput} w-auto py-1`}>
                    {Object.entries(ASSIGNMENT_STATUSES).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                  <button type="submit" className={buttonClass("secondary", "sm")}>
                    Set
                  </button>
                </form>
              </div>
              {showComp && (
              <details className="mt-3 rounded-md bg-ink-50 p-3" open={!a.compensation}>
                <summary className="cursor-pointer text-sm font-medium">
                  Compensation agreement{" "}
                  {a.compensation ? <Badge tone="accent">{AGREEMENT_STATUSES[a.compensation.status]}</Badge> : <Badge tone="warn">Not recorded</Badge>}
                </summary>
                <form action={saveCompensationAction} className="mt-3 grid gap-3 sm:grid-cols-4">
                  <input type="hidden" name="assignmentId" value={a.id} />
                  <input type="hidden" name="projectId" value={project.id} />
                  <div className="sm:col-span-4">
                    <label htmlFor={`terms-${a.id}`} className={smallLabel}>
                      Agreed terms
                    </label>
                    <textarea id={`terms-${a.id}`} name="terms" rows={3} required defaultValue={a.compensation?.terms ?? ""} className={smallInput} />
                  </div>
                  <div>
                    <label htmlFor={`basis-${a.id}`} className={smallLabel}>
                      Basis
                    </label>
                    <input id={`basis-${a.id}`} name="basis" placeholder="fixed / hourly / share" defaultValue={a.compensation?.basis ?? ""} className={smallInput} />
                  </div>
                  <div>
                    <label htmlFor={`amount-${a.id}`} className={smallLabel}>
                      Amount
                    </label>
                    <input
                      id={`amount-${a.id}`}
                      name="amount"
                      inputMode="decimal"
                      defaultValue={a.compensation?.amountMinor != null ? (a.compensation.amountMinor / 100).toFixed(2) : ""}
                      className={smallInput}
                    />
                  </div>
                  <div>
                    <label htmlFor={`cur-${a.id}`} className={smallLabel}>
                      Currency
                    </label>
                    <input id={`cur-${a.id}`} name="currency" maxLength={3} placeholder="USD" defaultValue={a.compensation?.currency ?? ""} className={smallInput} />
                  </div>
                  <div>
                    <label htmlFor={`cs-${a.id}`} className={smallLabel}>
                      Status
                    </label>
                    <select id={`cs-${a.id}`} name="status" defaultValue={a.compensation?.status ?? "DRAFT"} className={smallInput}>
                      {Object.entries(AGREEMENT_STATUSES).map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-3">
                    <label htmlFor={`doc-${a.id}`} className={smallLabel}>
                      Signed agreement reference
                    </label>
                    <input id={`doc-${a.id}`} name="documentRef" defaultValue={a.compensation?.documentRef ?? ""} className={smallInput} />
                  </div>
                  <div className="flex items-end">
                    <button type="submit" className={buttonClass("primary", "sm")}>
                      Save
                    </button>
                  </div>
                  {a.compensation?.agreedAt && (
                    <p className="text-xs text-ink-500 sm:col-span-4">Agreed {fmtDate(a.compensation.agreedAt)}</p>
                  )}
                </form>
                {a.compensation && can(admin.role, "compensation.manage") && (
                  <details className="mt-3 border-t border-ink-200 pt-3">
                    <summary className="cursor-pointer text-xs font-medium text-ink-700">Remove this agreement…</summary>
                    <form action={removeCompensationAction} className="mt-2 flex flex-wrap items-end gap-3">
                      <input type="hidden" name="projectId" value={project.id} />
                      <input type="hidden" name="assignmentId" value={a.id} />
                      <div>
                        <label htmlFor={`rm-${a.id}`} className={smallLabel}>
                          Type REMOVE to permanently remove this agreement record (recorded in the audit log)
                        </label>
                        <input id={`rm-${a.id}`} name="confirm" autoComplete="off" className={smallInput} />
                      </div>
                      <button type="submit" className={buttonClass("danger", "sm")}>
                        Remove agreement
                      </button>
                    </form>
                  </details>
                )}
              </details>
              )}
            </div>
          ))}
        </div>

        <form action={addAssignmentAction} className="mt-6 grid gap-3 border-t border-ink-200 pt-4 sm:grid-cols-3 sm:items-end">
          <input type="hidden" name="projectId" value={project.id} />
          <div>
            <label htmlFor="participantId" className={smallLabel}>
              Assign participant
            </label>
            <select id="participantId" name="participantId" required defaultValue="" className={smallInput}>
              <option value="" disabled>
                Select active participant…
              </option>
              {participants
                .filter((p) => !assignedIds.has(p.id))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.applicant.fullName}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label htmlFor="roleId" className={smallLabel}>
              Role
            </label>
            <select id="roleId" name="roleId" defaultValue="" className={smallInput}>
              <option value="">No specific role</option>
              {project.roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-3">
            <label htmlFor="responsibilities" className={smallLabel}>
              Responsibilities for this person
            </label>
            <textarea id="responsibilities" name="responsibilities" rows={2} className={smallInput} />
          </div>
          <div>
            <button type="submit" className={buttonClass("secondary", "sm")}>
              Assign
            </button>
          </div>
        </form>
      </Panel>

      {canDelete && (
        <Panel title="Delete project" className="mt-6">
          <p className="mb-3 text-xs text-ink-600">
            Permanently deletes this project with its roles, milestones and assignments. Not possible while an assignment has a compensation
            agreement: remove those agreements first, so that no financial record disappears unnoticed. Only the owner can delete a project.
          </p>
          <form action={deleteProjectAction} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="id" value={project.id} />
            <div>
              <label htmlFor="confirm" className={smallLabel}>
                Type DELETE to confirm
              </label>
              <input id="confirm" name="confirm" autoComplete="off" className={smallInput} />
            </div>
            <button type="submit" className={buttonClass("danger", "sm")}>
              Delete project
            </button>
          </form>
        </Panel>
      )}
    </>
  );
}
