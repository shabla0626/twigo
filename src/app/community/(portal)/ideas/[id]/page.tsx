import Link from "next/link";
import { notFound } from "next/navigation";
import { CommentThread } from "@/components/community/comment-thread";
import { ideaStatus } from "@/components/community/cards";
import { IconCheck, IconGroup, IconThumb } from "@/components/community/icons";
import { ReportButton } from "@/components/community/report-button";
import { MemberAvatar, Panel, TextBody, Time } from "@/components/community/ui";
import { QuickAction } from "@/components/community/quick-action";
import { FormAlert } from "@/components/forms/fields";
import { Badge, Button, ButtonLink } from "@/components/ui/primitives";
import { db } from "@/lib/db";
import { requireMember } from "@/lib/auth/guard";
import { readFlash } from "@/lib/flash";
import { IDEA_CATEGORIES } from "@/lib/validation/community";
import { commentTree } from "@/server/community/comments";
import { memberLabel, teammateIds } from "@/server/community/identity";
import { GROUP_STATUS_LABELS } from "@/server/community/group-labels";
import { IdeaHistory } from "@/components/community/idea-history";
import { IDEA_TEXT_FIELDS, getIdea, ideaRevisions } from "@/server/community/ideas";
import { getSetting } from "@/server/settings";
import { GroupAgreementNote } from "@/components/community/group-agreement-note";
import { closeIdeaAction, endorseAction, withdrawEndorsementAction } from "../../../actions";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> };

const DETAILS: [key: "problem" | "proposal" | "customers" | "revenueModel" | "skillsNeeded" | "timeEstimate" | "expectedActivities" | "objectives" | "collaborationApproach", label: string][] = [
  ["problem", "Problem or opportunity"],
  ["revenueModel", "How it might make money"],
  ["proposal", "Proposed solution"],
  ["customers", "Who the customers would be"],
  ["skillsNeeded", "Skills that would help"],
  ["expectedActivities", "What the work would involve"],
  ["objectives", "First objectives"],
  ["collaborationApproach", "Preferred way of collaborating"],
  ["timeEstimate", "Time it might take"],
];

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const idea = await db.businessIdea.findUnique({ where: { id }, select: { title: true, status: true } });
  return { title: idea && idea.status !== "REMOVED" ? idea.title : "Idea" };
}

export default async function IdeaPage({ params, searchParams }: Props) {
  const user = await requireMember();
  const { id } = await params;
  const sp = await searchParams;
  const flash = readFlash(sp);
  const idea = await getIdea(id, user.id);
  if (!idea) notFound();
  const [comments, threshold, revisions, teammates] = await Promise.all([commentTree({ ideaId: idea.id }), getSetting("community.endorsementThreshold"), ideaRevisions(idea.id), teammateIds(user.id)]);
  const knownIds = [...teammates];
  const isAuthor = idea.authorId === user.id;
  // The stored number counts only supporters who are active members right now: the same number the group decision uses.
  const eligible = idea.endorsementCount;
  const remaining = Math.max(0, threshold - eligible);
  const status = ideaStatus({ status: idea.status, endorsementCount: eligible, group: idea.group }, threshold);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <p className="text-sm xl:col-span-2">
        <Link href="/community" className="text-accent-700 hover:underline">
          ← Business Ideas
        </Link>
      </p>
      <div className="min-w-0 space-y-6 xl:col-start-1">
        <div className="space-y-3 empty:hidden" aria-live="polite">
          {sp.published && <FormAlert tone="success">Your idea is published. Members can now comment on it and support it.</FormAlert>}
          {sp.endorsed && <FormAlert tone="success">Thank you. Your support was recorded.</FormAlert>}
          {sp.withdrawn && <FormAlert tone="success">Your support was withdrawn.</FormAlert>}
          {sp.changed === "1" && <FormAlert tone="success">Your changes were saved and added to the idea’s history.</FormAlert>}
          {sp.changed === "material" && (
            <FormAlert tone="success">Your changes were saved. Because this was a material change, earlier support was reset and the supporters were told.</FormAlert>
          )}
          {flash.error && <FormAlert tone="error">{flash.error}</FormAlert>}
        </div>
        <article className="rounded-2xl border border-ink-100 bg-white p-6 sm:p-8">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={status.tone}>{status.label}</Badge>
            <span className="text-xs text-ink-500">{IDEA_CATEGORIES[idea.category]}</span>
          </div>
          <h1 className="mt-3 text-2xl font-semibold leading-tight text-ink-950 sm:text-3xl">{idea.title}</h1>
          {idea.sourceArticle && !idea.sourceArticle.removedAt && (
            <p className="mt-2 text-sm leading-6 text-ink-600">
              Proposed from the discussion{" "}
              <Link href={`/community/discuss/${idea.sourceArticle.id}`} className="font-medium text-accent-700 hover:underline">
                {idea.sourceArticle.title}
              </Link>
              .
            </p>
          )}
          <div className="mt-3 flex items-center gap-3 text-sm text-ink-600">
            <MemberAvatar name={memberLabel(idea.author?.id, idea.author?.profile?.displayName, teammates)} size={32} />
            <span>
              {idea.author ? (
                <Link href={`/community/members/${idea.author.id}`} className="font-medium text-ink-900 hover:underline">
                  {memberLabel(idea.author.id, idea.author.profile?.displayName, teammates)}
                </Link>
              ) : (
                "Former member"
              )}{" "}
              · <Time date={idea.createdAt} />
              {idea.editedAt && (
                <>
                  {" · "}
                  <a href="#history" className="underline underline-offset-2">
                    edited
                  </a>
                </>
              )}
            </span>
          </div>
          <p className="mt-5 text-lg leading-8 text-ink-800">{idea.summary}</p>
          {DETAILS.some(([k]) => idea[k]) && (
            <dl className="mt-6 grid gap-5 sm:grid-cols-2">
              {DETAILS.filter(([k]) => idea[k]).map(([k, label]) => (
                <div key={k} className="rounded-xl bg-ink-50 p-4">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-ink-500">{label}</dt>
                  <dd className="mt-1">
                    <TextBody text={idea[k]!} className="text-sm leading-6" />
                  </dd>
                </div>
              ))}
            </dl>
          )}
          {idea.description && (
            <div className="mt-6">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-500">Description</h2>
              <TextBody text={idea.description} className="mt-2" />
            </div>
          )}
          {idea.links.length > 0 && (
            <div className="mt-6">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-500">Links</h2>
              <ul className="mt-2 space-y-1 text-sm">
                {idea.links.map((l) => (
                  <li key={l}>
                    <a href={l} target="_blank" rel="noopener noreferrer nofollow ugc" className="break-all text-accent-700 underline">
                      {l}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <IdeaHistory
            revisions={revisions.map((r) => ({
              ...r,
              editor: r.editor ? { profile: { displayName: memberLabel(r.editor.id, r.editor.profile?.displayName, teammates) } } : null,
            }))}
            fieldLabels={IDEA_TEXT_FIELDS}
            categoryLabels={IDEA_CATEGORIES}
          />
          <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-ink-100 pt-4">
            {isAuthor ? (
              <>
                <ButtonLink href={`/community/ideas/${idea.id}/edit`} variant="secondary" size="sm">
                  Edit idea
                </ButtonLink>
                {!idea.group && idea.status === "OPEN" && (
                  <QuickAction
                    action={closeIdeaAction}
                    fields={{ id: idea.id }}
                    label="Close idea"
                    confirm={{
                      question: "Close this idea?",
                      detail: "It stays visible, but nobody can support it any more, so no project group can start from it. You cannot reopen it yourself.",
                      yes: "Yes, close the idea",
                      danger: true,
                    }}
                  />
                )}
              </>
            ) : (
              <ReportButton targetType="IDEA" targetId={idea.id} label="Report idea" />
            )}
          </div>
        </article>
      </div>

      <aside className="space-y-6 xl:col-start-2 xl:row-span-2 xl:row-start-2">
        <Panel title="Support">
          {idea.group ? (
            <div className="space-y-3 text-sm">
              <p className="leading-6 text-ink-700">
                This idea attracted enough support, so a project group was created to investigate it. That does not mean it will succeed: finding out is the
                group’s job.
              </p>
              <Link href={`/community/groups/${idea.group.slug}`} className="flex items-center gap-2 rounded-xl bg-accent-50 p-3 font-semibold text-accent-900 hover:bg-accent-100">
                <IconGroup className="h-5 w-5" /> {idea.group.name}
              </Link>
              <p className="text-xs text-ink-500">
                Stage: {GROUP_STATUS_LABELS[idea.group.status]} · {idea.group.memberCount} members. Any member can join.
              </p>
            </div>
          ) : (
            <div className="space-y-4 text-sm">
              <p className="flex items-center gap-2 text-ink-800">
                <IconThumb className="h-5 w-5 text-accent-700" />
                <span>
                  <strong>{eligible}</strong> of {threshold} supporters needed
                </span>
              </p>
              <div className="h-2 overflow-hidden rounded-full bg-ink-100" aria-hidden="true">
                <div className="h-full rounded-full bg-accent-600" style={{ width: `${Math.min(100, (eligible / threshold) * 100)}%` }} />
              </div>
              {idea.status === "OPEN" && !isAuthor && (
                <>
                  {idea.endorsedByViewer ? (
                    <div className="space-y-2">
                      <p className="flex items-center gap-2 font-medium text-emerald-800">
                        <IconCheck className="h-5 w-5" /> You support this idea
                      </p>
                      <form action={withdrawEndorsementAction}>
                        <input type="hidden" name="id" value={idea.id} />
                        <Button type="submit" variant="ghost" size="sm">
                          Withdraw my support
                        </Button>
                      </form>
                    </div>
                  ) : (
                    <form action={endorseAction} className="space-y-2">
                      <input type="hidden" name="id" value={idea.id} />
                      <Button type="submit" className="w-full">
                        <IconThumb className="h-4 w-4" /> Support this idea
                      </Button>
                      <GroupAgreementNote action="supporting" />
                    </form>
                  )}
                  <p className="text-sm leading-6 text-ink-600">
                    Support an idea if you would like to investigate it with others. When {threshold} members other than the author support it, a project group is
                    created and <strong>every supporter automatically becomes a group member</strong>. You can leave the group at any time.
                    {remaining > 0 && ` ${remaining} more supporter${remaining === 1 ? "" : "s"} needed.`}
                  </p>
                </>
              )}
              {isAuthor && idea.status === "OPEN" && (
                <p className="text-sm leading-6 text-ink-600">
                  This is your idea. When {threshold} other members support it, a project group is created automatically and you will coordinate it.
                </p>
              )}
              {idea.status === "CLOSED" && <p className="text-sm text-ink-600">The author closed this idea, so it can no longer receive support.</p>}
            </div>
          )}
          {idea.endorsements.length > 0 && (
            <ul className="mt-4 space-y-2 border-t border-ink-100 pt-4 text-sm" aria-label="Supporters">
              {idea.endorsements.map((e) => (
                <li key={e.user.id} className="flex items-center gap-2">
                  <MemberAvatar name={memberLabel(e.user.id, e.user.profile?.displayName, teammates)} size={24} />
                  <Link href={`/community/members/${e.user.id}`} className="text-ink-800 hover:underline">
                    {memberLabel(e.user.id, e.user.profile?.displayName, teammates)}
                  </Link>
                  <span className="ml-auto text-xs text-ink-500">
                    <Time date={e.createdAt} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </aside>

      <div id="discussion" className="min-w-0 scroll-mt-24 xl:col-start-1">
        <Panel title={`Discussion (${idea.commentCount})`}>
          <p className="mb-4 text-sm text-ink-600">Questions and comments about this idea. Every approved member can read and answer them.</p>
          <CommentThread comments={comments} viewerId={user.id} knownIds={knownIds} target={{ ideaId: idea.id, path: `/community/ideas/${idea.id}` }} />
        </Panel>
      </div>
    </div>
  );
}
