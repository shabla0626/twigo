import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/forms/action-form";
import { Field, FormAlert, Input, Select, Textarea } from "@/components/forms/fields";
import { IconChat, IconNotes, IconVideo } from "@/components/community/icons";
import { LeaveGroupButton } from "@/components/community/leave-group";
import { ReportButton } from "@/components/community/report-button";
import { MemberAvatar, Panel, TextBody, Time } from "@/components/community/ui";
import { Badge, Button, buttonClass } from "@/components/ui/primitives";
import { db } from "@/lib/db";
import { COORDINATOR_STATUSES, GROUP_STATUS_HELP, GROUP_STATUS_LABELS } from "@/server/community/group-labels";
import { groupMeetingNow, groupOverview, loadGroupPage } from "@/server/community/group-page";
import { groupInfoAction, groupStatusAction, leaveGroupAction } from "../../../actions";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | undefined>> };

const STAGES = ["FORMING", "RESEARCHING", "VALIDATING", "PLANNING", "READY_FOR_REVIEW", "APPROVED_FOR_PROJECT"] as const;

/** Overview: what the group is trying to achieve, where it stands, what is next, and who takes part. */
export default async function GroupOverviewPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const { group, isMember, isCoordinator, isOpen } = await loadGroupPage(slug);
  const overview = await groupOverview(slug);
  if (!overview) notFound();
  const [meeting, tasks] = isMember
    ? await Promise.all([
        groupMeetingNow(group.id),
        db.researchTask.findMany({
          where: { groupId: group.id, status: { not: "DONE" } },
          orderBy: [{ status: "desc" }, { createdAt: "asc" }],
          take: 4,
          select: { id: true, title: true, status: true, assignee: { select: { profile: { select: { displayName: true } } } } },
        }),
      ])
    : [null, []];
  const stageIndex = STAGES.indexOf(group.status as (typeof STAGES)[number]);
  const latest = overview.announcements[0];
  const base = `/community/groups/${slug}`;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0 space-y-6">
        <div aria-live="polite" className="space-y-3 empty:hidden">
          {sp.created && (
            <FormAlert tone="success">
              Your support was the last one needed, so a research group has been created and you are a founding member. This means the idea is ready to
              investigate together; it does not mean its success is proven.
            </FormAlert>
          )}
          {sp.joined && <FormAlert tone="success">You joined the group. Chat, meetings and shared research are now open to you.</FormAlert>}
          {sp.left && <FormAlert tone="success">You left the group. Your account is still active, and you can rejoin at any time while the group is active.</FormAlert>}
          {sp.ok && <FormAlert tone="success">{sp.ok}</FormAlert>}
          {sp.error && <FormAlert tone="error">{sp.error}</FormAlert>}
        </div>

        {meeting && (
          <Link href={`${base}/meetings`} className="flex items-center gap-3 rounded-2xl bg-emerald-50 p-4 text-sm font-medium text-emerald-950 ring-1 ring-emerald-200 hover:bg-emerald-100">
            <IconVideo className="h-5 w-5 shrink-0" />
            <span className="flex-1">A {meeting.kind === "VOICE" ? "voice" : "video"} meeting is happening now.</span>
            <span className="underline">Join</span>
          </Link>
        )}

        <Panel title="What this group is working on">
          {group.purpose ? <TextBody text={group.purpose} /> : <p className="text-sm text-ink-600">The coordinator has not written a purpose yet.</p>}
          {group.description && (
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-medium text-accent-700">Read more</summary>
              <TextBody text={group.description} className="mt-3" />
            </details>
          )}
          {overview.idea && (
            <p className="mt-4 text-sm text-ink-600">
              Started from the idea{" "}
              <Link href={`/community/ideas/${overview.idea.id}`} className="font-medium text-accent-700 underline">
                {overview.idea.title}
              </Link>{" "}
              by {overview.idea.author?.profile?.displayName ?? "a former member"}.
            </p>
          )}
        </Panel>

        {isMember && (
          <Panel title="Next steps" action={<Link href={`${base}/research`} className="text-sm text-accent-700 hover:underline">All tasks</Link>}>
            {tasks.length ? (
              <ul className="space-y-2 text-sm">
                {tasks.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-ink-50 px-3 py-2">
                    <span className="text-ink-900">{t.title}</span>
                    <span className="text-xs text-ink-500">
                      {t.status === "IN_PROGRESS" ? "In progress" : "To do"}
                      {t.assignee?.profile?.displayName ? ` · ${t.assignee.profile.displayName}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-600">No open tasks yet. Agree on next steps in the chat and add them in Research.</p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href={`${base}/chat`} className={buttonClass("primary", "sm")}>
                <IconChat className="h-4 w-4" /> Open chat
              </Link>
              <Link href={`${base}/meetings`} className={buttonClass("secondary", "sm")}>
                <IconVideo className="h-4 w-4" /> {meeting ? "Join the meeting" : "Start a meeting"}
              </Link>
              <Link href={`${base}/research`} className={buttonClass("secondary", "sm")}>
                <IconNotes className="h-4 w-4" /> Add research
              </Link>
            </div>
          </Panel>
        )}

        {latest && (
          <Panel title="Latest announcement" action={<Link href={`${base}/discussions`} className="text-sm text-accent-700 hover:underline">All announcements</Link>}>
            <p className="font-semibold text-ink-950">{latest.title}</p>
            <p className="text-xs text-ink-500">
              {latest.author?.profile?.displayName ?? "Coordinator"} · <Time date={latest.createdAt} />
            </p>
            <TextBody text={latest.body} className="mt-2 text-sm leading-6" />
          </Panel>
        )}

        {isCoordinator && isOpen && (
          <details className="rounded-2xl border border-ink-100 bg-white p-5">
            <summary className="cursor-pointer font-semibold text-ink-950">Coordinator tools</summary>
            <p className="mt-1 text-sm text-ink-600">Edit the group details or update its stage. Post announcements from the Discussions tab.</p>
            <div className="mt-4 grid gap-6 lg:grid-cols-2">
              <ActionForm action={groupInfoAction} submitLabel="Save details">
                <input type="hidden" name="groupId" value={group.id} />
                <Field id="g-name" label="Group name">
                  <Input id="g-name" name="name" defaultValue={group.name} required maxLength={120} />
                </Field>
                <Field id="g-purpose" label="What the group is working on" optional>
                  <Textarea id="g-purpose" name="purpose" defaultValue={group.purpose ?? ""} maxLength={500} rows={2} />
                </Field>
                <Field id="g-desc" label="More information" optional>
                  <Textarea id="g-desc" name="description" defaultValue={group.description ?? ""} maxLength={10000} rows={4} />
                </Field>
              </ActionForm>
              {group.status !== "APPROVED_FOR_PROJECT" && (
                <form action={groupStatusAction} className="space-y-3">
                  <input type="hidden" name="groupId" value={group.id} />
                  <Field id="status" label="Stage">
                    <Select id="status" name="status" defaultValue={group.status}>
                      {COORDINATOR_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {GROUP_STATUS_LABELS[s]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <p className="text-sm leading-6 text-ink-600">
                    Choosing “Ready for review” asks the organization to review the group’s research. It does not authorize paid work.
                  </p>
                  <Button type="submit" variant="secondary">
                    Update stage
                  </Button>
                </form>
              )}
            </div>
          </details>
        )}
      </div>

      <aside className="space-y-6">
        <Panel title="Stage">
          {stageIndex >= 0 ? (
            <>
              <p className="text-sm text-ink-600">
                Step {stageIndex + 1} of {STAGES.length}
              </p>
              <p className="text-lg font-semibold text-accent-900">{GROUP_STATUS_LABELS[group.status]}</p>
              <div className="mt-2 flex gap-1" aria-hidden="true">
                {STAGES.map((s, i) => (
                  <span key={s} className={`h-1.5 flex-1 rounded-full ${i <= stageIndex ? "bg-accent-600" : "bg-ink-100"}`} />
                ))}
              </div>
            </>
          ) : (
            <p className="text-lg font-semibold text-ink-800">{GROUP_STATUS_LABELS[group.status]}</p>
          )}
          <p className="mt-3 text-sm leading-6 text-ink-600">{GROUP_STATUS_HELP[group.status]}</p>
          {overview.project && <p className="mt-3 text-sm text-ink-600">Linked project: {overview.project.title} (managed by the organization).</p>}
        </Panel>

        <Panel
          title={`Members (${overview.memberships.length})`}
          action={
            <Link href={`${base}/members`} className="text-sm text-accent-700 hover:underline">
              {isCoordinator ? "Manage" : "See all"}
            </Link>
          }
        >
          <ul className="space-y-2">
            {overview.memberships.slice(0, 8).map((m) => {
              const name = m.user.profile?.displayName ?? "Member";
              return (
                <li key={m.user.id}>
                  <Link href={`/community/members/${m.user.id}`} className="flex items-center gap-3 rounded-lg text-sm hover:bg-ink-50">
                    <MemberAvatar name={name} size={30} />
                    <span className="truncate text-ink-900">{name}</span>
                    {m.role === "COORDINATOR" && <Badge tone="success">Coordinator</Badge>}
                  </Link>
                </li>
              );
            })}
          </ul>
          {overview.memberships.length > 8 && <p className="mt-2 text-sm text-ink-500">and {overview.memberships.length - 8} more</p>}
          {!overview.memberships.some((m) => m.role === "COORDINATOR") && (
            <p className="mt-3 text-sm text-ink-600">No coordinator right now. The organization looks after this group for the moment.</p>
          )}
          <p className="mt-3 text-xs text-ink-500">
            Group created <Time date={group.createdAt} />
          </p>
        </Panel>
        <div className="flex flex-wrap items-center gap-3 px-1">
          {isMember && (
            <div className="sm:hidden">
              <LeaveGroupButton groupId={group.id} action={leaveGroupAction} />
            </div>
          )}
          <ReportButton targetType="GROUP" targetId={group.id} label="Report this group" />
        </div>
      </aside>
    </div>
  );
}
