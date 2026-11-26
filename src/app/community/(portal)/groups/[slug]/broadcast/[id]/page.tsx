import Link from "next/link";
import { notFound } from "next/navigation";
import { broadcastCommentAction, removeBroadcastAction } from "@/app/community/actions";
import { QuickAction } from "@/components/community/quick-action";
import { ReportButton } from "@/components/community/report-button";
import { TextBody, Time } from "@/components/community/ui";
import { ActionForm } from "@/components/forms/action-form";
import { loadGroupPage } from "@/server/community/group-page";
import { memberLabel, teammateIds } from "@/server/community/identity";
import { getBroadcast } from "@/server/community/broadcast";

export default async function BroadcastPiecePage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const { user, group } = await loadGroupPage(slug);
  const post = await getBroadcast(id);
  if (!post || post.groupId !== group.id) notFound();
  const teammates = await teammateIds(user.id);
  const author = memberLabel(post.author?.id, post.author?.profile?.displayName, teammates);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <p className="text-sm">
        <Link href={`/community/groups/${slug}/broadcast`} className="text-accent-700 hover:underline">
          ← Project channel
        </Link>
      </p>
      <article className="rounded-2xl border border-ink-100 bg-white p-6 sm:p-8">
        <h1 className="text-2xl font-semibold leading-tight text-ink-950">{post.title}</h1>
        <p className="mt-2 text-sm text-ink-500">
          {post.author ? (
            <Link href={`/community/members/${post.author.id}`} className="font-medium text-ink-700 hover:underline">
              {author}
            </Link>
          ) : (
            author
          )}
          {" · "}
          <Time date={post.createdAt} />
        </p>
        <TextBody text={post.body} className="mt-6" />
        <div className="mt-6">
          {post.author?.id === user.id ? (
            <QuickAction
              action={removeBroadcastAction}
              fields={{ id: post.id }}
              label="Remove piece"
              confirm={{ question: "Remove this piece from the channel?", detail: "Members will no longer see it.", yes: "Yes, remove it", danger: true }}
            />
          ) : (
            <ReportButton targetType="PROJECT_BROADCAST" targetId={post.id} label="Report piece" />
          )}
        </div>
      </article>
      <section className="space-y-4 rounded-2xl border border-ink-100 bg-white p-6">
        <h2 className="text-lg font-semibold text-ink-950">Comments</h2>
        <p className="text-sm leading-6 text-ink-600">Any approved member can comment. Publishing a new piece stays with the project members.</p>
        <ActionForm action={broadcastCommentAction} submitLabel="Post comment" pendingLabel="Posting…" className="space-y-2">
          <input type="hidden" name="postId" value={post.id} />
          <label htmlFor="channel-comment" className="sr-only">
            Your comment
          </label>
          <textarea id="channel-comment" name="body" required maxLength={5000} rows={3} className="block w-full rounded-xl border-0 px-3 py-2 text-sm ring-1 ring-inset ring-ink-300 focus:ring-2 focus:ring-accent-600" />
        </ActionForm>
        {post.comments.length === 0 ? (
          <p className="text-sm text-ink-600">No comments yet.</p>
        ) : (
          <ul className="space-y-4">
            {post.comments.map((c) => {
              const name = memberLabel(c.author?.id, c.author?.profile?.displayName, teammates);
              return (
                <li key={c.id}>
                  <p className="text-sm">
                    <span className="font-semibold text-ink-950">{name}</span> <Time date={c.createdAt} />
                  </p>
                  <TextBody text={c.body} className="mt-1 text-sm leading-6" />
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
