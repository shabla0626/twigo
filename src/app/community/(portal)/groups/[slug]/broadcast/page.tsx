import Link from "next/link";
import { createBroadcastAction } from "@/app/community/actions";
import { EmptyState, Time } from "@/components/community/ui";
import { ActionForm } from "@/components/forms/action-form";
import { Field, Input, Textarea } from "@/components/forms/fields";
import { loadGroupPage } from "@/server/community/group-page";
import { memberLabel, teammateIds } from "@/server/community/identity";
import { listBroadcasts } from "@/server/community/broadcast";

export default async function BroadcastPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { user, group, isMember, isOpen } = await loadGroupPage(slug);
  const [posts, teammates] = await Promise.all([listBroadcasts(group.id), teammateIds(user.id)]);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <p className="rounded-xl bg-ink-50 px-4 py-3 text-sm leading-6 text-ink-700">
        This is the project’s own channel for results and research. Any approved member can read it and comment. Members of this project publish. It is separate from the site discussion and from this project’s private chat.
      </p>
      {isMember && isOpen && (
        <section className="rounded-2xl border border-ink-100 bg-white p-5">
          <h2 className="text-lg font-semibold text-ink-950">Publish on the channel</h2>
          <ActionForm action={createBroadcastAction} submitLabel="Publish" pendingLabel="Publishing…" className="mt-4 space-y-4">
            <input type="hidden" name="groupId" value={group.id} />
            <Field id="channel-title" label="Title">
              <Input id="channel-title" name="title" required minLength={5} maxLength={140} />
            </Field>
            <Field id="channel-body" label="What the project has to report">
              <Textarea id="channel-body" name="body" required minLength={40} maxLength={20000} rows={6} />
            </Field>
          </ActionForm>
        </section>
      )}
      {!isMember && <p className="text-sm leading-6 text-ink-600">You can read this channel and comment on a piece. Publishing is for members of the project.</p>}
      {posts.length === 0 ? (
        <EmptyState title="Nothing on the channel yet" body="A member of the project publishes a result or a research note here." />
      ) : (
        <ul className="space-y-3">
          {posts.map((post) => (
            <li key={post.id} className="rounded-2xl border border-ink-100 bg-white p-5">
              <h2 className="text-lg font-semibold text-ink-950">
                <Link href={`/community/groups/${slug}/broadcast/${post.id}`} className="hover:text-accent-800">
                  {post.title}
                </Link>
              </h2>
              <p className="mt-1 text-sm text-ink-500">
                {memberLabel(post.author?.id, post.author?.profile?.displayName, teammates)} · <Time date={post.createdAt} /> · {post.commentCount}{" "}
                {post.commentCount === 1 ? "comment" : "comments"}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
