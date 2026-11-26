import Link from "next/link";
import { notFound } from "next/navigation";
import { BoardLive } from "@/components/community/board-live";
import { RelatedPlaces } from "@/components/community/related-places";
import { CommentThread } from "@/components/community/comment-thread";
import { QuickAction } from "@/components/community/quick-action";
import { ReportButton } from "@/components/community/report-button";
import { TextBody, Time } from "@/components/community/ui";
import { FormAlert } from "@/components/forms/fields";
import { Button, ButtonLink } from "@/components/ui/primitives";
import { requireMember } from "@/lib/auth/guard";
import { readFlash } from "@/lib/flash";
import { discussionParticipants, getArticle, viewerMarked } from "@/server/community/board";
import { memberLabel, teammateIds } from "@/server/community/identity";
import { commentTree } from "@/server/community/comments";
import { getSetting } from "@/server/settings";
import { recognizeArticleAction, removeArticleAction } from "../../../actions";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> };

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const article = await getArticle(id);
  return { title: article?.title ?? "Discussion" };
}

export default async function DiscussionPiecePage({ params, searchParams }: Props) {
  const user = await requireMember();
  const { id } = await params;
  const flash = readFlash(await searchParams);
  const article = await getArticle(id);
  if (!article) notFound();
  const [comments, people, marked, threshold, teammates] = await Promise.all([
    commentTree({ articleId: article.id }),
    discussionParticipants(article.id),
    viewerMarked(article.id, user.id),
    getSetting("community.endorsementThreshold"),
    teammateIds(user.id),
  ]);
  const knownIds = [...teammates];
  const mine = article.author?.id === user.id;
  const takingPart = people.some((p) => p.id === user.id);
  const idea = article.ideas[0] ?? null;
  const authorName = memberLabel(article.author?.id, article.author?.profile?.displayName, teammates);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <BoardLive articleId={article.id} />
      <p className="text-sm">
        <Link href="/community/discuss" className="text-accent-700 hover:underline">
          ← Discussion
        </Link>
      </p>
      {flash.error && <FormAlert tone="error">{flash.error}</FormAlert>}
      <article className="rounded-2xl border border-ink-100 bg-white p-6 sm:p-8">
        <h1 className="text-2xl font-semibold leading-tight text-ink-950 sm:text-3xl">{article.title}</h1>
        <p className="mt-2 text-sm text-ink-500">
          {article.author ? (
            <Link href={`/community/members/${article.author.id}`} className="font-medium text-ink-700 hover:underline">
              {authorName}
            </Link>
          ) : (
            authorName
          )}
          {" · "}
          <Time date={article.createdAt} />
          {article.editedAt && " · edited"}
        </p>
        <TextBody text={article.body} className="mt-6" />
        <div className="mt-6 flex flex-wrap items-center gap-3">
          {mine ? (
            <p className="text-sm text-ink-600">You wrote this piece, so you cannot mark it. {article.recognitionCount} {article.recognitionCount === 1 ? "member has" : "members have"} marked it.</p>
          ) : (
            <form action={recognizeArticleAction}>
              <input type="hidden" name="id" value={article.id} />
              <Button type="submit" variant={marked ? "secondary" : "primary"}>
                {marked ? "Marked · remove mark" : "Mark as worth reading"}
              </Button>
            </form>
          )}
          {!mine && <ReportButton targetType="ARTICLE" targetId={article.id} label="Report piece" />}
          {mine && (
            <QuickAction
              action={removeArticleAction}
              fields={{ id: article.id }}
              label="Remove piece"
              confirm={{ question: "Remove this piece?", detail: "Members will no longer see it. Comments go with it.", yes: "Yes, remove it", danger: true }}
            />
          )}
        </div>
      </article>

      <section className="rounded-2xl border border-ink-100 bg-white p-6" aria-labelledby="from-discussion">
        <h2 id="from-discussion" className="text-lg font-semibold text-ink-950">
          From this discussion
        </h2>
        <p className="mt-2 text-[15px] leading-7 text-ink-700">
          The people below took part by writing the piece or by commenting. One of them can propose a business idea linked to this discussion. When {threshold} members besides that idea’s author support it, a project group opens and those supporters become its first members.
        </p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {people.map((p) => (
            <li key={p.id}>
              <Link href={`/community/members/${p.id}`} className="inline-flex rounded-full bg-ink-50 px-3 py-1 text-sm font-medium text-ink-800 ring-1 ring-ink-100 hover:bg-accent-50">
                {memberLabel(p.id, p.displayName, teammates)}
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-4">
          {idea?.group ? (
            <div className="space-y-2 text-sm leading-6 text-ink-700">
              <p>This discussion led to a project group.</p>
              <ButtonLink href={`/community/groups/${idea.group.slug}`}>Open {idea.group.name}</ButtonLink>
            </div>
          ) : idea ? (
            <div className="space-y-2 text-sm leading-6 text-ink-700">
              <p>
                An idea is already linked to this discussion: <span className="font-medium text-ink-950">{idea.title}</span>. It has {idea.endorsementCount} {idea.endorsementCount === 1 ? "supporter" : "supporters"}.
              </p>
              <ButtonLink href={`/community/ideas/${idea.id}`}>Read the idea and support it</ButtonLink>
            </div>
          ) : takingPart ? (
            <ButtonLink href={`/community/ideas/new?from=${article.id}`}>Propose an idea from this discussion</ButtonLink>
          ) : (
            <p className="text-sm leading-6 text-ink-600">Comment below to take part. Then you can propose an idea with the other people here.</p>
          )}
        </div>
      </section>

      <section aria-labelledby="comments-heading">
        <h2 id="comments-heading" className="mb-3 text-lg font-semibold text-ink-950">
          Comments
        </h2>
        <CommentThread comments={comments} viewerId={user.id} knownIds={knownIds} target={{ articleId: article.id, path: `/community/discuss/${article.id}` }} />
      </section>
      <RelatedPlaces />
    </div>
  );
}
