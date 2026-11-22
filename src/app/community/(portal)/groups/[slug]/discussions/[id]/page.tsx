import Link from "next/link";
import { QuickAction } from "@/components/community/quick-action";
import { notFound } from "next/navigation";
import { CommentThread } from "@/components/community/comment-thread";
import { ReportButton } from "@/components/community/report-button";
import { MemberAvatar, Panel, TextBody, Time } from "@/components/community/ui";
import { db } from "@/lib/db";
import { commentTree } from "@/server/community/comments";
import { loadGroupPage } from "@/server/community/group-page";
import { deleteDiscussionAction } from "../../../../../actions";

export default async function DiscussionPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const { user, group, isOpen } = await loadGroupPage(slug);
  const d = await db.groupDiscussion.findUnique({ where: { id }, include: { author: { select: { id: true, profile: { select: { displayName: true } } } } } });
  if (!d || d.groupId !== group.id || d.deletedAt || d.removedAt) notFound();
  const comments = await commentTree({ discussionId: d.id });
  const name = d.author?.profile?.displayName ?? "Former member";
  return (
    <div className="max-w-4xl space-y-6">
      <Link href={`/community/groups/${slug}/discussions`} className="text-sm text-accent-700 hover:underline">
        ← All discussions
      </Link>
      <article className="rounded-2xl border border-ink-100 bg-white p-6 shadow-soft">
        <h2 className="text-xl font-semibold text-ink-950">{d.title}</h2>
        <p className="mt-2 flex items-center gap-2 text-sm text-ink-600">
          <MemberAvatar name={name} size={28} /> {name} · <Time date={d.createdAt} />
        </p>
        <TextBody text={d.body} className="mt-4" />
        <div className="mt-4 flex gap-2 border-t border-ink-100 pt-3">
          {d.authorId === user.id ? (
            <QuickAction action={deleteDiscussionAction} fields={{ id: d.id, groupId: group.id }} label="Delete discussion" />
          ) : (
            <ReportButton targetType="DISCUSSION" targetId={d.id} />
          )}
        </div>
      </article>
      <Panel title={`Replies (${d.commentCount})`}>
        <CommentThread comments={comments} viewerId={user.id} canPost={isOpen} target={{ discussionId: d.id, path: `/community/groups/${slug}/discussions/${d.id}` }} />
      </Panel>
    </div>
  );
}
