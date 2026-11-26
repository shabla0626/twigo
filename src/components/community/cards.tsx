import Link from "next/link";
import type { GroupStatus, IdeaCategory } from "@prisma/client";
import { IDEA_CATEGORIES } from "@/lib/validation/community";
import { GROUP_STATUS_LABELS } from "@/server/community/group-labels";
import { Badge, Button, buttonClass } from "../ui/primitives";
import { IconChat, IconCheck, IconGroup, IconThumb, IconVideo } from "./icons";
import { Time } from "./ui";

type IdeaCardData = {
  id: string;
  title: string;
  summary: string;
  status: string;
  endorsementCount: number;
  commentCount: number;
  createdAt: Date;
  author: { id: string; profile: { displayName: string } | null } | null;
  group: { slug: string; name: string } | null;
};

export type Viewer = { id: string; supports: boolean };

/** Plain-language status of an idea. */
export function ideaStatus(idea: { status: string; endorsementCount: number; group: unknown }, threshold: number) {
  if (idea.group) return { label: "Project group formed", tone: "success" as const };
  if (idea.status === "CLOSED") return { label: "Closed by author", tone: "neutral" as const };
  const left = Math.max(0, threshold - idea.endorsementCount);
  return { label: left > 0 ? `Needs ${left} more supporter${left === 1 ? "" : "s"}` : "Open for support", tone: "accent" as const };
}

/**
 * One idea in the feed: title, short description, author, date, support,
 * comments, status, and the Support button.
 */
export function IdeaCard({
  idea,
  threshold,
  viewer,
  supportAction,
  authorLabel,
}: {
  idea: IdeaCardData;
  threshold: number;
  viewer?: Viewer;
  supportAction?: (fd: FormData) => Promise<void>;
  authorLabel?: string;
}) {
  const status = ideaStatus(idea, threshold);
  const isAuthor = viewer && idea.author?.id === viewer.id;
  const canSupport = viewer && supportAction && !isAuthor && !viewer.supports && idea.status === "OPEN" && !idea.group;
  return (
    <article className="rounded-2xl border border-ink-100 bg-white p-5 transition hover:border-accent-200 sm:p-6">
      <h3 className="text-lg font-semibold leading-snug text-ink-950">
        <Link href={`/community/ideas/${idea.id}`} className="hover:text-accent-800">
          {idea.title}
        </Link>
      </h3>
      <p className="mt-1 text-sm text-ink-500">
        {authorLabel ?? idea.author?.profile?.displayName ?? "Former member"} · <Time date={idea.createdAt} />
      </p>
      <p className="mt-2 line-clamp-3 text-[15px] leading-6 text-ink-700">{idea.summary}</p>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3 text-sm text-ink-600">
        <Badge tone={status.tone}>{status.label}</Badge>
        <span className="inline-flex items-center gap-1.5">
          <IconThumb className="h-4 w-4" /> {idea.endorsementCount} supporter{idea.endorsementCount === 1 ? "" : "s"}
        </span>
        <Link href={`/community/ideas/${idea.id}#discussion`} className="inline-flex items-center gap-1.5 hover:text-ink-950">
          <IconChat className="h-4 w-4" /> {idea.commentCount} comment{idea.commentCount === 1 ? "" : "s"}
        </Link>
        <span className="ml-auto flex items-center gap-2">
          {idea.group ? (
            <Link href={`/community/groups/${idea.group.slug}`} className={buttonClass("secondary", "sm")}>
              <IconGroup className="h-4 w-4" /> View group
            </Link>
          ) : canSupport ? (
            <form action={supportAction}>
              <input type="hidden" name="id" value={idea.id} />
              <Button type="submit" size="sm" variant="secondary" aria-label={`Support “${idea.title}”`}>
                <IconThumb className="h-4 w-4" /> Support
              </Button>
            </form>
          ) : viewer?.supports ? (
            <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700">
              <IconCheck className="h-4 w-4" /> You support this
            </span>
          ) : isAuthor ? (
            <span className="text-sm text-ink-500">Your idea</span>
          ) : null}
        </span>
      </div>
    </article>
  );
}

type GroupCardData = {
  slug: string;
  name: string;
  purpose: string | null;
  category: IdeaCategory | null;
  status: GroupStatus;
  memberCount: number;
  lastActivityAt: Date;
  idea?: { title: string } | null;
};

/**
 * One group: name, the idea it came from, short description, members, stage
 * and the next action (view, or open for members).
 */
export function GroupCard({
  group,
  unread,
  role,
  isMember,
  liveMeeting,
  joinAction,
  groupId,
}: {
  group: GroupCardData;
  unread?: number;
  role?: string;
  isMember?: boolean;
  liveMeeting?: boolean;
  joinAction?: (fd: FormData) => Promise<void>;
  groupId?: string;
}) {
  const href = `/community/groups/${group.slug}`;
  const ideaDiffers = group.idea && group.idea.title.trim().toLowerCase() !== group.name.trim().toLowerCase();
  return (
    <article className="flex flex-col rounded-2xl border border-ink-100 bg-white p-5 transition hover:border-accent-200">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={group.status === "ARCHIVED" ? "neutral" : "accent"}>Stage: {GROUP_STATUS_LABELS[group.status]}</Badge>
        {role === "COORDINATOR" && <Badge tone="success">You coordinate</Badge>}
        {liveMeeting && (
          <Link href={`${href}/meetings`} className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
            <IconVideo className="h-3.5 w-3.5" /> Meeting now
          </Link>
        )}
      </div>
      <h3 className="mt-2 text-lg font-semibold leading-snug text-ink-950">
        <Link href={href} className="hover:text-accent-800">
          {group.name}
        </Link>
      </h3>
      {ideaDiffers && <p className="text-sm text-ink-500">Idea: {group.idea!.title}</p>}
      {group.purpose && <p className="mt-1 line-clamp-2 text-sm leading-6 text-ink-700">{group.purpose}</p>}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-4 text-sm text-ink-600">
        <span className="inline-flex items-center gap-1.5">
          <IconGroup className="h-4 w-4" /> {group.memberCount} member{group.memberCount === 1 ? "" : "s"}
          {group.category && <span className="hidden text-ink-500 sm:inline">· {IDEA_CATEGORIES[group.category]}</span>}
        </span>
        <span className="flex items-center gap-2">
          {unread ? (
            <Link href={`${href}/chat`} className="rounded-full bg-rose-700 px-2.5 py-1 text-xs font-semibold text-white">
              {unread} new message{unread === 1 ? "" : "s"}
            </Link>
          ) : null}
          {isMember || !joinAction || !groupId || group.status === "ARCHIVED" ? (
            <Link href={href} className={buttonClass(isMember ? "primary" : "secondary", "sm")}>
              {isMember ? "Open group" : "View group"}
            </Link>
          ) : (
            <>
              <Link href={href} className={buttonClass("ghost", "sm")}>
                View
              </Link>
              <form action={joinAction}>
                <input type="hidden" name="groupId" value={groupId} />
                <Button type="submit" size="sm">
                  Join group
                </Button>
              </form>
            </>
          )}
        </span>
      </div>
    </article>
  );
}
