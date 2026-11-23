import { ActionForm } from "@/components/forms/action-form";
import { Field, Input, Select, Textarea } from "@/components/forms/fields";
import { FileUpload } from "@/components/community/file-upload";
import { MembersOnly } from "@/components/community/members-only";
import { EmptyState, Panel, TextBody, Time } from "@/components/community/ui";
import { QuickAction } from "@/components/community/quick-action";
import { Badge } from "@/components/ui/primitives";
import { RESEARCH_SECTIONS, type ResearchSectionKey } from "@/lib/validation/community";
import { ALLOWED_DESCRIPTION } from "@/lib/files/sniff";
import { activeMemberIds } from "@/server/community/access";
import { listGroupFiles } from "@/server/community/files";
import { loadGroupPage } from "@/server/community/group-page";
import { getWorkspace } from "@/server/community/research";
import { db } from "@/lib/db";
import {
  addLinkAction,
  addTaskAction,
  decisionAction,
  deleteFileAction,
  deleteLinkAction,
  deleteNoteAction,
  deleteTaskAction,
  saveNoteAction,
  taskStatusAction,
} from "../../../../actions";

const TASK_LABEL = { TODO: "To do", IN_PROGRESS: "In progress", DONE: "Done" } as const;

function size(n: number) {
  return n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

/** Shared Research: notes, to-do list, files and links, and decisions, in one place. */
export default async function ResearchPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { user, group, isMember, isCoordinator, isOpen } = await loadGroupPage(slug);
  if (!isMember) return <MembersOnly groupId={group.id} what="Shared research" canJoin={isOpen} />;
  const [ws, memberIds, files] = await Promise.all([getWorkspace(group.id, user.id), activeMemberIds(group.id), listGroupFiles(group.id, user.id)]);
  const members = await db.memberProfile.findMany({ where: { userId: { in: memberIds } }, select: { userId: true, displayName: true }, orderBy: { displayName: "asc" } });
  const sections = (Object.keys(RESEARCH_SECTIONS) as ResearchSectionKey[]).filter((k) => ws.notes.some((n) => n.section === k));

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="min-w-0 space-y-5">
        <div>
          <h2 className="text-lg font-semibold text-ink-950">Shared Research</h2>
          <p className="text-sm leading-6 text-ink-600">
            Collect what the group learns about customers, costs and how the idea could earn money. Everyone in the group can add and edit notes.
          </p>
        </div>

        {isOpen && (
          <details className="rounded-2xl border border-accent-200 bg-accent-50/50 p-5" open={ws.notes.length === 0}>
            <summary className="cursor-pointer font-semibold text-accent-900">+ Add a research note</summary>
            <ActionForm action={saveNoteAction} submitLabel="Add note" resetOnSuccess className="mt-4">
              <input type="hidden" name="groupId" value={group.id} />
              <Field id="n-section" label="Topic">
                <Select id="n-section" name="section" defaultValue="GENERAL">
                  {(Object.keys(RESEARCH_SECTIONS) as ResearchSectionKey[]).map((k) => (
                    <option key={k} value={k}>
                      {RESEARCH_SECTIONS[k].label}: {RESEARCH_SECTIONS[k].hint}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field id="n-title" label="Title">
                <Input id="n-title" name="title" required maxLength={150} placeholder="Example: What 5 shop owners told us" />
              </Field>
              <Field id="n-body" label="Note">
                <Textarea id="n-body" name="body" required maxLength={20000} rows={5} placeholder="Write what you found, with sources where possible." />
              </Field>
            </ActionForm>
          </details>
        )}

        {sections.length ? (
          sections.map((key) => (
            <section key={key} aria-labelledby={`sec-${key}`} className="space-y-3">
              <h3 id={`sec-${key}`} className="text-sm font-semibold uppercase tracking-wide text-ink-500">
                {RESEARCH_SECTIONS[key].label}
              </h3>
              {ws.notes
                .filter((n) => n.section === key)
                .map((n) => (
                  <article key={n.id} className="rounded-2xl border border-ink-100 bg-white p-5">
                    <p className="font-semibold text-ink-950">{n.title}</p>
                    <p className="text-xs text-ink-500">
                      {n.author?.profile?.displayName ?? "Member"} · updated <Time date={n.updatedAt} />
                    </p>
                    <TextBody text={n.body} className="mt-2 text-sm leading-6" />
                    {isOpen && (
                      <div className="mt-3 flex flex-wrap items-start gap-2">
                        <details className="w-full">
                          <summary className="cursor-pointer text-sm text-accent-700">Edit</summary>
                          <ActionForm action={saveNoteAction} submitLabel="Save note" className="mt-2">
                            <input type="hidden" name="groupId" value={group.id} />
                            <input type="hidden" name="id" value={n.id} />
                            <input type="hidden" name="section" value={key} />
                            <Input name="title" defaultValue={n.title} required maxLength={150} aria-label="Title" />
                            <Textarea name="body" defaultValue={n.body} required maxLength={20000} rows={6} aria-label="Note" />
                          </ActionForm>
                        </details>
                        {(n.authorId === user.id || isCoordinator) && (
                          <QuickAction action={deleteNoteAction} fields={{ groupId: group.id, id: n.id }} label="Delete" ariaLabel={`Delete note ${n.title}`} />
                        )}
                      </div>
                    )}
                  </article>
                ))}
            </section>
          ))
        ) : (
          <EmptyState title="No research notes yet" body="Start with something simple: who would buy this, and what do they use today?" />
        )}

        <details className="rounded-2xl border border-ink-100 bg-white p-5">
          <summary className="cursor-pointer text-sm font-semibold text-ink-900">Not sure what to research? Questions most groups answer</summary>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-ink-700">
            {(Object.keys(RESEARCH_SECTIONS) as ResearchSectionKey[])
              .filter((k) => k !== "GENERAL")
              .map((k) => (
                <li key={k}>
                  <strong className="text-ink-900">{RESEARCH_SECTIONS[k].label}:</strong> {RESEARCH_SECTIONS[k].hint}
                </li>
              ))}
          </ul>
          <p className="mt-3 text-sm leading-6 text-ink-600">
            When the group has a credible plan, it can create a project in the Projects tab and agree its terms in writing. Marking the group “Ready for review” is optional and only
            lets administrators read these notes to give feedback.
          </p>
        </details>
      </div>

      <div className="space-y-6">
        <Panel title="To-do list">
          {ws.tasks.length ? (
            <ul className="space-y-3">
              {ws.tasks.map((t) => (
                <li key={t.id} className="rounded-xl border border-ink-100 p-3 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <p className={t.status === "DONE" ? "text-ink-500 line-through" : "font-medium text-ink-950"}>{t.title}</p>
                    <Badge tone={t.status === "DONE" ? "success" : t.status === "IN_PROGRESS" ? "accent" : "neutral"}>{TASK_LABEL[t.status]}</Badge>
                  </div>
                  {t.details && <p className="mt-1 text-ink-600">{t.details}</p>}
                  <p className="mt-1 text-xs text-ink-500">
                    {t.assignee?.profile?.displayName ? `Assigned to ${t.assignee.profile.displayName}` : "Not assigned"}
                    {t.dueDate && ` · due ${t.dueDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
                  </p>
                  {isOpen && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {(["TODO", "IN_PROGRESS", "DONE"] as const)
                        .filter((s) => s !== t.status)
                        .map((s) => (
                          <QuickAction key={s} action={taskStatusAction} fields={{ groupId: group.id, id: t.id, status: s }} label={s === "DONE" ? "Mark done" : TASK_LABEL[s]} variant="secondary" />
                        ))}
                      {(t.createdById === user.id || isCoordinator) && (
                        <QuickAction action={deleteTaskAction} fields={{ groupId: group.id, id: t.id }} label="Delete" ariaLabel={`Delete task ${t.title}`} />
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-600">No tasks yet. Write down who will do what next.</p>
          )}
          {isOpen && (
            <details className="mt-4">
              <summary className="cursor-pointer text-sm font-semibold text-accent-700">Add a task</summary>
              <ActionForm action={addTaskAction} submitLabel="Add task" resetOnSuccess className="mt-3">
                <input type="hidden" name="groupId" value={group.id} />
                <Field id="t-title" label="Task">
                  <Input id="t-title" name="title" required maxLength={200} />
                </Field>
                <Field id="t-assignee" label="Who will do it?" optional>
                  <Select id="t-assignee" name="assigneeId" defaultValue="">
                    <option value="">Nobody yet</option>
                    {members.map((m) => (
                      <option key={m.userId} value={m.userId}>
                        {m.displayName}
                      </option>
                    ))}
                  </Select>
                </Field>
                <details>
                  <summary className="cursor-pointer text-sm text-ink-600">More options</summary>
                  <div className="mt-3 space-y-4">
                    <Field id="t-details" label="Details" optional>
                      <Textarea id="t-details" name="details" maxLength={2000} rows={2} />
                    </Field>
                    <Field id="t-due" label="Due date" optional>
                      <Input id="t-due" name="dueDate" type="date" />
                    </Field>
                  </div>
                </details>
              </ActionForm>
            </details>
          )}
        </Panel>

        <section id="files" className="scroll-mt-24">
          <Panel title="Files & links" action={isOpen ? <FileUpload scope="GROUP_FILE" groupId={group.id} /> : undefined}>
            {files.length || ws.links.length ? (
              <ul className="divide-y divide-ink-100 text-sm">
                {files.map((f) => (
                  <li key={f.id} className="flex items-center justify-between gap-2 py-2.5">
                    <span className="min-w-0">
                      <a href={`/api/files/${f.id}?download=1`} className="break-all font-medium text-accent-700 underline-offset-2 hover:underline">
                        {f.originalName}
                      </a>
                      <span className="block text-xs text-ink-500">
                        {size(f.size)} · {f.owner?.profile?.displayName ?? "member"} · <Time date={f.createdAt} />
                        {f.scope === "CHAT_ATTACHMENT" && " · from chat"}
                      </span>
                    </span>
                    {isOpen && (f.ownerId === user.id || isCoordinator) && (
                      <QuickAction action={deleteFileAction} fields={{ groupId: group.id, id: f.id }} label="Delete" ariaLabel={`Delete ${f.originalName}`} />
                    )}
                  </li>
                ))}
                {ws.links.map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-2 py-2.5">
                    <span className="min-w-0">
                      <a href={l.url} target="_blank" rel="noopener noreferrer nofollow ugc" className="font-medium text-accent-700 underline-offset-2 hover:underline">
                        {l.title} ↗
                      </a>
                      <span className="block truncate text-xs text-ink-500">
                        Link · {l.addedBy?.profile?.displayName ?? "member"}
                      </span>
                    </span>
                    {isOpen && (l.addedById === user.id || isCoordinator) && (
                      <QuickAction action={deleteLinkAction} fields={{ groupId: group.id, id: l.id }} label="Remove" ariaLabel={`Remove link ${l.title}`} />
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-600">No files or links yet.</p>
            )}
            {isOpen && (
              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-semibold text-accent-700">Add a link</summary>
                <ActionForm action={addLinkAction} submitLabel="Add link" resetOnSuccess variant="secondary" className="mt-3">
                  <input type="hidden" name="groupId" value={group.id} />
                  <Field id="l-title" label="Title">
                    <Input id="l-title" name="title" required maxLength={150} />
                  </Field>
                  <Field id="l-url" label="Web address">
                    <Input id="l-url" name="url" type="url" required placeholder="https://" />
                  </Field>
                </ActionForm>
              </details>
            )}
            <p className="mt-3 text-xs leading-5 text-ink-500">Only current group members can open these files. Allowed: {ALLOWED_DESCRIPTION}.</p>
          </Panel>
        </section>

        <Panel title="Decisions">
          {ws.decisions.length ? (
            <ul className="space-y-3 text-sm">
              {ws.decisions.map((d) => (
                <li key={d.id} className="rounded-xl bg-ink-50 p-3">
                  <p className="font-medium text-ink-950">{d.title}</p>
                  <TextBody text={d.decision} className="mt-1 text-sm leading-6" />
                  {d.rationale && <p className="mt-1 text-ink-600">Why: {d.rationale}</p>}
                  <p className="mt-1 text-xs text-ink-500">
                    {d.recordedBy?.profile?.displayName ?? "Member"} · <Time date={d.decidedAt} />
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-600">Write down what the group agrees on, so everyone can find it later.</p>
          )}
          {isOpen && (
            <details className="mt-4">
              <summary className="cursor-pointer text-sm font-semibold text-accent-700">Record a decision</summary>
              <ActionForm action={decisionAction} submitLabel="Record decision" resetOnSuccess className="mt-3">
                <input type="hidden" name="groupId" value={group.id} />
                <Field id="dc-title" label="Title">
                  <Input id="dc-title" name="title" required maxLength={200} />
                </Field>
                <Field id="dc-decision" label="What was decided">
                  <Textarea id="dc-decision" name="decision" required maxLength={5000} rows={3} />
                </Field>
                <Field id="dc-rationale" label="Why" optional>
                  <Textarea id="dc-rationale" name="rationale" maxLength={5000} rows={2} />
                </Field>
              </ActionForm>
            </details>
          )}
        </Panel>
      </div>
    </div>
  );
}
