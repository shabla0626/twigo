import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminHeader, Dl, Flash, Panel, fmtDate, smallInput, smallLabel } from "@/components/admin/ui";
import { Badge, buttonClass } from "@/components/ui/primitives";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/guard";
import { can } from "@/lib/auth/permissions";
import { RESEARCH_SECTIONS } from "@/lib/validation/community";
import { GROUP_STATUS_LABELS } from "@/server/community/group-labels";
import { approveGroupAction, assignCoordinatorAction, groupStateAction } from "../../../actions/community";

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
      _count: { select: { notes: true, tasks: true, decisions: true, meetings: true, discussions: true } },
    },
  });
  if (!g) notFound();
  // Business-proposal review: ONLY the PLAN / CONCEPT / REVENUE / RISKS notes, and
  // only once the group asked for review (READY_FOR_REVIEW or later). The group's
  // other notes, its chat, meetings and files are never shown here.
  const reviewing = g.status === "READY_FOR_REVIEW" || g.status === "APPROVED_FOR_PROJECT";
  const proposal = reviewing
    ? await db.researchNote.findMany({ where: { groupId: g.id, section: { in: ["PLAN", "CONCEPT", "REVENUE", "RISKS"] } }, orderBy: [{ section: "asc" }, { updatedAt: "desc" }], select: { id: true, section: true, title: true, body: true, updatedAt: true } })
    : [];
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
      <Flash ok={sp.ok} error={sp.error} />
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <Panel title="Overview">
            <Dl
              items={[
                ["Purpose", g.purpose],
                ["Origin idea", g.idea ? <Link key="i" href={`/community/ideas/${g.idea.id}`} className="text-accent-700 hover:underline">{g.idea.title}</Link> : null],
                ["Created", fmtDate(g.createdAt, true)],
                ["Last activity", fmtDate(g.lastActivityAt, true)],
                ["Workspace", `${g._count.notes} notes · ${g._count.tasks} tasks · ${g._count.decisions} decisions · ${g._count.meetings} meetings · ${g._count.discussions} discussions`],
                ["Linked project", g.project ? <Link key="p" href={`/admin/projects/${g.project.id}`} className="text-accent-700 hover:underline">{g.project.title}</Link> : null],
              ]}
            />
            <p className="mt-4 text-xs text-ink-500">Private chat messages and files are not shown to administrators. Moderators see chat content only when a member reports it.</p>
          </Panel>
          <Panel title={`Members (${active.length} active)`}>
            <ul className="divide-y divide-ink-100 text-sm">
              {g.memberships.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <Link href={`/admin/members/${m.user.id}`} className="hover:underline">
                    {m.user.profile?.displayName ?? m.user.email}
                  </Link>
                  <span className="text-ink-600">
                    {m.role === "COORDINATOR" ? "Coordinator" : "Member"} · {m.status.toLowerCase()} · joined {fmtDate(m.joinedAt)}
                    {m.founding && " · founding"}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
          {reviewing && (
            <Panel title="Business proposal (submitted for review)">
              {proposal.length ? (
                <div className="space-y-4">
                  {proposal.map((n) => (
                    <div key={n.id}>
                      <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">{RESEARCH_SECTIONS[n.section].label}</p>
                      <p className="font-medium text-ink-950">{n.title}</p>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-ink-800">{n.body}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-ink-600">The group has not written any research notes yet.</p>
              )}
            </Panel>
          )}
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
                    I reviewed the proposal and understand that business registration, participant classification, written agreements, compensation terms and tax
                    questions must be settled before any paid work starts.
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
