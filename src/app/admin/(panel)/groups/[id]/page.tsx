import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminHeader, Dl, Flash, Panel, fmtDate, smallInput, smallLabel } from "@/components/admin/ui";
import { readFlash } from "@/lib/flash";
import { Badge, buttonClass } from "@/components/ui/primitives";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/guard";
import { can } from "@/lib/auth/permissions";
import { GROUP_STATUS_LABELS } from "@/server/community/group-labels";
import { approveGroupAction, assignCoordinatorAction, groupStateAction, liftRemovalAction } from "../../../actions/community";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> };

export default async function GroupAdminDetail({ params, searchParams }: Props) {
  const admin = await requireAdmin("groups.manage");
  const { id } = await params;
  const sp = await searchParams;
  const g = await db.researchGroup.findUnique({
    where: { id },
    include: {
      idea: { select: { id: true, title: true } },
      memberships: { orderBy: [{ status: "asc" }, { joinedAt: "asc" }], include: { user: { select: { id: true, email: true, status: true, profile: { select: { displayName: true } } } } } },
      project: { select: { id: true, title: true } },
    },
  });
  if (!g) notFound();
  // No private group information is shown here: not research notes (whatever the group's stage), chat,
  // files, tasks, decisions or projects. An administrator sees such information only through an
  // owner-approved, time-limited investigation after a member of the group reported something
  // (Admin, Group access; src/server/admin/group-access.ts).
  const active = g.memberships.filter((m) => m.status === "ACTIVE");
  return (
    <>
      <p className="mb-4 text-sm">
        <Link href="/admin/groups" className="text-accent-700 hover:underline">
          ← All groups
        </Link>
      </p>
      <AdminHeader
        title={g.name}
        description={
          <>
            <Badge>{GROUP_STATUS_LABELS[g.status]}</Badge> {g.suspendedAt && <Badge tone="danger">Suspended</Badge>} {g.adminManaged && <Badge tone="warn">No coordinator</Badge>}
          </>
        }
        actions={
          <Link href={`/community/groups/${g.slug}`} className={buttonClass("secondary", "sm")}>
            Open group page
          </Link>
        }
      />
      <Flash {...readFlash(sp)} />
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <Panel title="Overview">
            <Dl
              items={[
                ["Purpose", g.purpose],
                ["Origin idea", g.idea ? <Link key="i" href={`/community/ideas/${g.idea.id}`} className="text-accent-700 hover:underline">{g.idea.title}</Link> : null],
                ["Created", fmtDate(g.createdAt, true)],
                ["Last activity", fmtDate(g.lastActivityAt, true)],
                ["Linked project", g.project ? <Link key="p" href={`/admin/projects/${g.project.id}`} className="text-accent-700 hover:underline">{g.project.title}</Link> : null],
              ]}
            />
            <p className="mt-4 text-xs text-ink-500">
              The group’s private information (chat, research, files, tasks, decisions, projects) is not shown to administrators. Moderators see only the
              copy a member attaches to a report; anything more needs a member’s report, an access request and the owner’s approval for a limited time
              (Admin, Group access).
            </p>
          </Panel>
          <Panel title={`Members (${active.length} active)`}>
            <ul className="divide-y divide-ink-100 text-sm">
              {g.memberships.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <Link href={`/admin/members/${m.user.id}`} className="hover:underline">
                    {m.user.profile?.displayName ?? m.user.email}
                  </Link>
                  <span className="text-ink-600">
                    {m.role === "COORDINATOR" ? "Coordinator" : "Member"} · {m.status === "REMOVED" ? "removed by the coordinator" : m.status.toLowerCase()} · joined {fmtDate(m.joinedAt)}
                    {m.founding && " · founding"}
                  </span>
                  {m.status === "REMOVED" && (
                    <form action={liftRemovalAction} className="basis-full text-right">
                      <input type="hidden" name="id" value={g.id} />
                      <input type="hidden" name="userId" value={m.user.id} />
                      <button type="submit" className="text-sm font-medium text-accent-700 underline underline-offset-2">
                        Allow to join again
                      </button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          </Panel>
        </div>
        <div className="space-y-6">
          <Panel title="Coordinator">
            <form action={assignCoordinatorAction} className="space-y-2">
              <input type="hidden" name="id" value={g.id} />
              <label htmlFor="userId" className={smallLabel}>
                Assign coordinator (active members only)
              </label>
              <select id="userId" name="userId" className={smallInput} required>
                {active.map((m) => (
                  <option key={m.user.id} value={m.user.id}>
                    {m.user.profile?.displayName ?? m.user.email} {m.role === "COORDINATOR" ? "(current)" : ""}
                  </option>
                ))}
              </select>
              <button className={buttonClass("secondary", "sm")} disabled={!active.length}>
                Assign
              </button>
            </form>
          </Panel>
          {g.status === "READY_FOR_REVIEW" && can(admin.role, "groups.approve_project") && !g.project && (
            <Panel title="Approve for project planning">
              <form action={approveGroupAction} className="space-y-3 text-sm">
                <input type="hidden" name="id" value={g.id} />
                <p className="text-ink-700">Creates a linked project in “Planning”. It does not start commercial work.</p>
                <label className="flex items-start gap-2 text-ink-800">
                  <input type="checkbox" name="confirm" className="mt-1" />
                  <span>
                    I discussed the proposal with the group (its private notes are not visible to administrators; the coordinator can share what the group
                    chooses) and understand that business registration, participant classification, written agreements, compensation terms and tax questions
                    must be settled before any paid work starts.
                  </span>
                </label>
                <button className={buttonClass("primary", "sm")}>Approve and create project</button>
              </form>
            </Panel>
          )}
          <Panel title="Group state">
            <div className="space-y-3">
              {g.status === "ARCHIVED" ? (
                <form action={groupStateAction}>
                  <input type="hidden" name="id" value={g.id} />
                  <button name="action" value="reopen" className={buttonClass("secondary", "sm")}>
                    Reopen group
                  </button>
                </form>
              ) : (
                <form action={groupStateAction}>
                  <input type="hidden" name="id" value={g.id} />
                  <button name="action" value="archive" className={buttonClass("secondary", "sm")}>
                    Archive group
                  </button>
                </form>
              )}
              {g.suspendedAt ? (
                <form action={groupStateAction}>
                  <input type="hidden" name="id" value={g.id} />
                  <button name="action" value="unsuspend" className={buttonClass("secondary", "sm")}>
                    Lift suspension
                  </button>
                </form>
              ) : (
                <form action={groupStateAction} className="space-y-2">
                  <input type="hidden" name="id" value={g.id} />
                  <label htmlFor="reason" className={smallLabel}>
                    Suspension reason
                  </label>
                  <input id="reason" name="reason" maxLength={500} className={smallInput} required />
                  <button name="action" value="suspend" className={buttonClass("danger", "sm")}>
                    Suspend group
                  </button>
                  <p className="text-xs text-ink-500">Members lose access to chat, meetings and files until the suspension is lifted.</p>
                </form>
              )}
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
