import Link from "next/link";
import { BoardLive } from "@/components/community/board-live";
import { RelatedPlaces } from "@/components/community/related-places";
import { ActionForm } from "@/components/forms/action-form";
import { EmptyState, Panel, Time } from "@/components/community/ui";
import { ButtonLink } from "@/components/ui/primitives";
import { requireMember } from "@/lib/auth/guard";
import { listArticles, recognizedPieces, recognizedWriters } from "@/server/community/board";
import { memberLabel, teammateIds } from "@/server/community/identity";
import { getSetting } from "@/server/settings";
import { createArticleAction } from "../../actions";

export const metadata = { title: "Discussion" };

function excerpt(body: string) {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > 220 ? `${flat.slice(0, 220)}…` : flat;
}

export default async function DiscussionPage() {
  const user = await requireMember();
  const [articles, pieces, writers, threshold, teammates] = await Promise.all([listArticles(), recognizedPieces(), recognizedWriters(), getSetting("community.endorsementThreshold"), teammateIds(user.id)]);
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <BoardLive />
      <header>
        <h1 className="text-2xl font-semibold text-ink-950 sm:text-3xl">Discussion</h1>
        <p className="mt-2 text-[15px] leading-7 text-ink-700">
          Publish a view, a question, or a longer piece. Other members can comment while this page is open, and the comments appear here as they are posted. The people who take part can then propose a business idea from the discussion. A project group still opens only when {threshold} members besides that idea’s author support it.
        </p>
        <p className="mt-2 text-sm leading-6 text-ink-600">
          Approved members can read every piece. It is not confidential. A piece is not a job offer, and it does not ask anyone for fees or investment. Members’ social, literary, and creative work has its own place under{" "}
          <Link href="/community/culture" className="font-medium text-accent-700 underline-offset-2 hover:underline">
            Works
          </Link>
          .{" "}
          <Link href="/operators" className="font-medium text-accent-700 underline-offset-2 hover:underline">
            Who operates the site
          </Link>
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <Panel title="Most recognized pieces">
          {pieces.length === 0 ? (
            <p className="text-sm leading-6 text-ink-600">No piece has been marked yet. A member marks a piece they think others should read. The author cannot mark their own, and there is no prize.</p>
          ) : (
            <ul className="space-y-3">
              {pieces.map((p) => (
                <li key={p.id}>
                  <Link href={`/community/discuss/${p.id}`} className="font-medium text-ink-950 hover:text-accent-800">
                    {p.title}
                  </Link>
                  <p className="text-xs text-ink-500">
                    {memberLabel(p.author?.id, p.author?.profile?.displayName, teammates)} · {p.recognitionCount} {p.recognitionCount === 1 ? "mark" : "marks"}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Most recognized writers">
          {writers.length === 0 ? (
            <p className="text-sm leading-6 text-ink-600">No writer has been marked yet. The list follows the marks on their pieces. The operator does not choose it.</p>
          ) : (
            <ul className="space-y-3">
              {writers.map((w) => (
                <li key={w.id}>
                  <Link href={`/community/members/${w.id}`} className="font-medium text-ink-950 hover:text-accent-800">
                    {memberLabel(w.id, w.displayName, teammates)}
                  </Link>
                  <p className="text-xs text-ink-500">
                    {w.marks} {w.marks === 1 ? "mark" : "marks"}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Publish a piece">
        <ActionForm action={createArticleAction} submitLabel="Publish piece" pendingLabel="Publishing…">
          <label className="block text-sm font-medium text-ink-800" htmlFor="article-title">
            Title
          </label>
          <input id="article-title" name="title" required minLength={5} maxLength={140} className="mt-1 block w-full rounded-xl border-0 px-3 py-2 text-sm ring-1 ring-inset ring-ink-300 focus:ring-2 focus:ring-accent-600" />
          <label className="mt-4 block text-sm font-medium text-ink-800" htmlFor="article-body">
            Your piece
          </label>
          <textarea id="article-body" name="body" required minLength={40} maxLength={20000} rows={8} className="mt-1 block w-full rounded-xl border-0 px-3 py-2 text-sm ring-1 ring-inset ring-ink-300 focus:ring-2 focus:ring-accent-600" />
          <p className="mt-1 text-xs text-ink-500">Write what you want other members to respond to. A piece can be an argument, a question, or notes you are willing to share.</p>
          <label className="mt-4 flex items-start gap-3 text-sm leading-6 text-ink-800">
            <input type="checkbox" name="visibilityAck" required className="mt-1 h-4 w-4 rounded border-ink-300" />
            <span>Members can read this. It is not confidential, and I will not ask anyone for fees or investment.</span>
          </label>
        </ActionForm>
      </Panel>

      <section className="space-y-4" aria-labelledby="pieces-heading">
        <h2 id="pieces-heading" className="text-lg font-semibold text-ink-950">
          Latest pieces
        </h2>
        {articles.length === 0 ? (
          <EmptyState title="No pieces yet" body="The first piece gives the next member something to answer." />
        ) : (
          <ul className="space-y-4">
            {articles.map((a) => (
              <li key={a.id} className="rounded-2xl border border-ink-100 bg-white p-5">
                <h3 className="text-lg font-semibold text-ink-950">
                  <Link href={`/community/discuss/${a.id}`} className="hover:text-accent-800">
                    {a.title}
                  </Link>
                </h3>
                <p className="mt-1 text-sm text-ink-500">
                  <Link href={a.author ? `/community/members/${a.author.id}` : "/community/discuss"} className="font-medium text-ink-700 hover:underline">
                    {memberLabel(a.author?.id, a.author?.profile?.displayName, teammates)}
                  </Link>
                  {" · "}
                  <Time date={a.createdAt} />
                  {" · "}
                  {a.commentCount} {a.commentCount === 1 ? "comment" : "comments"}
                  {a.recognitionCount > 0 && ` · ${a.recognitionCount} ${a.recognitionCount === 1 ? "mark" : "marks"}`}
                </p>
                <p className="mt-3 text-[15px] leading-7 text-ink-700">{excerpt(a.body)}</p>
              </li>
            ))}
          </ul>
        )}
        <ButtonLink href="/community" variant="secondary">
          Business ideas
        </ButtonLink>
      </section>
      <RelatedPlaces />
    </div>
  );
}
