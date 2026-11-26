import Link from "next/link";
import { ActionForm } from "@/components/forms/action-form";
import { Field, Input, Textarea } from "@/components/forms/fields";
import { EmptyState, Panel, TextBody, Time } from "@/components/community/ui";
import { db } from "@/lib/db";
import { anonymousLabel } from "@/lib/anonymous-label";
import { listDiscussions } from "@/server/community/comments";
import { loadGroupPage } from "@/server/community/group-page";
import { announcementAction, createDiscussionAction } from "../../../../actions";

/** Announcements from the coordinator, and longer discussions any member can read and reply to. */
export default async function DiscussionsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { group, isOpen, isCoordinator, isMember } = await loadGroupPage(slug);
  const shown = (id: string | null | undefined, name: string | null | undefined) => (!id ? "Former member" : isMember ? name?.trim() || "Member" : anonymousLabel(id));
  const [discussions, announcements] = await Promise.all([
    listDiscussions(group.id),
    db.groupAnnouncement.findMany({
      where: { groupId: group.id },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { author: { select: { id: true, profile: { select: { displayName: true } } } } },
    }),
  ]);
  return (
    <div className="max-w-4xl space-y-6">
      <p className="rounded-xl bg-ink-50 px-4 py-3 text-sm leading-6 text-ink-700">
        <strong>Who can read this page:</strong> every approved member of the community, not only this group. For talk that only the group should
        see, use the group’s <strong>Chat</strong>.
      </p>
      <section aria-labelledby="ann-h" className="space-y-3">
        <h2 id="ann-h" className="text-lg font-semibold text-ink-950">
          Announcements
        </h2>
        <p className="text-sm text-ink-600">Important updates from the coordinator. Group members are notified.</p>
        {announcements.length ? (
          <ul className="space-y-3">
            {announcements.map((a) => (
              <li key={a.id} className="rounded-2xl border border-ink-100 bg-white p-5">
                <p className="font-semibold text-ink-950">{a.title}</p>
                <p className="text-xs text-ink-500">
                  {shown(a.author?.id, a.author?.profile?.displayName)} · <Time date={a.createdAt} />
                </p>
                <TextBody text={a.body} className="mt-2 text-sm leading-6" />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-600">No announcements yet. The coordinator posts important updates here.</p>
        )}
        {isCoordinator && isOpen && (
          <details className="rounded-2xl border border-ink-100 bg-white p-5">
            <summary className="cursor-pointer text-sm font-semibold text-accent-800">Post an announcement</summary>
            <ActionForm action={announcementAction} submitLabel="Post and notify members" resetOnSuccess className="mt-3">
              <input type="hidden" name="groupId" value={group.id} />
              <Field id="a-title" label="Title">
                <Input id="a-title" name="title" required maxLength={150} />
              </Field>
              <Field id="a-body" label="Announcement">
                <Textarea id="a-body" name="body" required maxLength={5000} rows={4} />
              </Field>
            </ActionForm>
          </details>
        )}
      </section>

      <section aria-labelledby="disc-h" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="disc-h" className="text-lg font-semibold text-ink-950">
              Discussions
            </h2>
            <p className="text-sm text-ink-600">Longer conversations that every approved member can read and reply to. Use the chat for quick, members-only messages.</p>
          </div>
        </div>
        {isOpen && (
          <details className="rounded-2xl border border-ink-100 bg-white p-5">
            <summary className="cursor-pointer text-sm font-semibold text-accent-800">Start a discussion</summary>
            <ActionForm action={createDiscussionAction} submitLabel="Start discussion" className="mt-3">
              <input type="hidden" name="groupId" value={group.id} />
              <Field id="d-title" label="Title">
                <Input id="d-title" name="title" required maxLength={150} />
              </Field>
              <Field id="d-body" label="Message">
                <Textarea id="d-body" name="body" required maxLength={10000} rows={5} />
              </Field>
              <p className="text-xs text-ink-500">Visible to all approved members. Do not post confidential information.</p>
            </ActionForm>
          </details>
        )}
        {discussions.length ? (
          <ul className="divide-y divide-ink-100 rounded-2xl border border-ink-100 bg-white">
            {discussions.map((d) => (
              <li key={d.id}>
                <Link href={`/community/groups/${slug}/discussions/${d.id}`} className="block px-5 py-4 hover:bg-ink-50">
                  <p className="font-semibold text-ink-950">{d.title}</p>
                  <p className="mt-0.5 text-xs text-ink-500">
                    {shown(d.author?.id, d.author?.profile?.displayName)} · {d.commentCount} repl{d.commentCount === 1 ? "y" : "ies"} · active <Time date={d.lastActivityAt} />
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No discussions yet" body="Start one to ask a question or share what the group has learned with the whole community." />
        )}
      </section>
      {!isOpen && discussions.length === 0 && announcements.length === 0 && <Panel>Nothing has been posted in this group.</Panel>}
    </div>
  );
}
