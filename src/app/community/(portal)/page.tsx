import { liveMeeting } from "@/server/community/meetings";
import Link from "next/link";
import type { IdeaCategory } from "@prisma/client";
import { IdeaCard } from "@/components/community/cards";
import { IconPlus, IconSearch, IconVideo } from "@/components/community/icons";
import { EmptyState, Panel, Time } from "@/components/community/ui";
import { Input, Select } from "@/components/forms/fields";
import { Button, ButtonLink, buttonClass } from "@/components/ui/primitives";
import { db } from "@/lib/db";
import { requireMember } from "@/lib/auth/guard";
import { IDEA_CATEGORIES } from "@/lib/validation/community";
import { listGroups, myGroups } from "@/server/community/groups";
import { listIdeas, type IdeaSort } from "@/server/community/ideas";
import { getSetting } from "@/server/settings";
import { endorseAction } from "../actions";

export const metadata = { title: "Business Ideas" };

type Props = { searchParams: Promise<Record<string, string | undefined>> };

const SORTS: { key: IdeaSort; label: string }[] = [
  { key: "recent", label: "Newest first" },
  { key: "endorsed", label: "Most support" },
  { key: "active", label: "Most active" },
];

/** Member landing page: the Business Ideas feed, with the member's groups beside it. */
export default async function BusinessIdeasPage({ searchParams }: Props) {
  const user = await requireMember();
  const sp = await searchParams;
  const sort = (SORTS.find((s) => s.key === sp.sort)?.key ?? "recent") as IdeaSort;
  const category = sp.category && sp.category in IDEA_CATEGORIES ? (sp.category as IdeaCategory) : undefined;
  const q = sp.q?.trim().slice(0, 100) || undefined;
  const filtered = Boolean(q || category || sort !== "recent");

  const [res, threshold, mine, newGroups, live, notes] = await Promise.all([
    listIdeas({ sort, category, q, cursor: sp.cursor }),
    getSetting("community.endorsementThreshold"),
    myGroups(user.id),
    listGroups({ sort: "new", take: 4 }),
    db.groupMeeting.findMany({
      where: { ...liveMeeting(), group: { suspendedAt: null, memberships: { some: { userId: user.id, status: "ACTIVE" } } } },
      select: { id: true, kind: true, title: true, group: { select: { slug: true, name: true } } },
      take: 3,
    }),
    db.notification.findMany({ where: { userId: user.id, readAt: null }, orderBy: { updatedAt: "desc" }, take: 3 }),
  ]);
  const supported = new Set(
    (await db.ideaEndorsement.findMany({ where: { userId: user.id, ideaId: { in: res.items.map((i) => i.id) } }, select: { ideaId: true } })).map((e) => e.ideaId),
  );
  const mySlugs = new Set(mine.map((m) => m.group.slug));
  const otherNewGroups = newGroups.items.filter((g) => !mySlugs.has(g.slug)).slice(0, 3);
  const qs = (over: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ sort, category, q, ...over })) if (v && !(k === "sort" && v === "recent")) p.set(k, v);
    const s = p.toString();
    return s ? `/community?${s}` : "/community";
  };

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_19rem]">
      <div className="min-w-0">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-ink-950 sm:text-3xl">Business Ideas</h1>
            <p className="mt-1 max-w-2xl text-[15px] leading-6 text-ink-600">
              Welcome, {user.displayName}. Explore ideas, connect with other members, and discover opportunities to build something together.{" "}
              <Link href="/community/help" className="font-medium text-accent-700 underline-offset-2 hover:underline">
                How it works
              </Link>
            </p>
          </div>
          <ButtonLink href="/community/ideas/new" size="lg">
            <IconPlus className="h-5 w-5" /> Propose a Business Idea
          </ButtonLink>
        </div>

        {live.length > 0 && (
          <ul className="mb-5 space-y-2">
            {live.map((m) => (
              <li key={m.id}>
                <Link
                  href={`/community/groups/${m.group.slug}/meetings`}
                  className="flex items-center gap-3 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-950 ring-1 ring-emerald-200 hover:bg-emerald-100"
                >
                  <IconVideo className="h-5 w-5 shrink-0" />
                  <span className="min-w-0 flex-1">
                    A meeting is happening now in <strong>{m.group.name}</strong>
                  </span>
                  <span className="font-semibold underline">Join</span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {mine.length > 0 && (
          <nav aria-label="Your groups (quick links)" className="-mx-4 mb-5 overflow-x-auto px-4 xl:hidden">
            <ul className="flex gap-2">
              <li className="shrink-0 self-center text-sm font-medium text-ink-600">Your groups:</li>
              {mine.map((m) => (
                <li key={m.group.slug} className="shrink-0">
                  <Link href={`/community/groups/${m.group.slug}`} className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-sm text-ink-800 ring-1 ring-ink-200">
                    <span className="max-w-48 truncate">{m.group.name}</span>
                    {m.unread > 0 && <span className="rounded-full bg-rose-500 px-1.5 text-xs font-semibold text-white">{m.unread}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}

        <form role="search" action="/community" className="mb-5 grid gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
          <label htmlFor="q" className="sr-only">
            Search ideas
          </label>
          <div className="relative">
            <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <Input id="q" name="q" defaultValue={q} placeholder="Search ideas" className="pl-9" />
          </div>
          <label htmlFor="category" className="sr-only">
            Category
          </label>
          <Select id="category" name="category" defaultValue={category ?? ""}>
            <option value="">All categories</option>
            {Object.entries(IDEA_CATEGORIES).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
          <label htmlFor="sort" className="sr-only">
            Order
          </label>
          <Select id="sort" name="sort" defaultValue={sort}>
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </Select>
          <Button type="submit" variant="secondary">
            Show
          </Button>
        </form>
        {filtered && (
          <p className="-mt-2 mb-4 text-sm text-ink-600">
            <Link href="/community" className="font-medium text-accent-700 hover:underline">
              Clear search and filters
            </Link>
          </p>
        )}

        {res.items.length ? (
          <div className="space-y-4">
            {res.items.map((i) => (
              <IdeaCard key={i.id} idea={i} threshold={threshold} viewer={{ id: user.id, supports: supported.has(i.id) }} supportAction={endorseAction} />
            ))}
          </div>
        ) : (
          <EmptyState
            title={q || category ? "No ideas match your search" : "No ideas yet"}
            body={
              q || category
                ? "Try another word or category."
                : "Be the first. An idea can be small and unfinished: a problem you noticed, a service people need, or a skill members could offer."
            }
            action={q || category ? undefined : <ButtonLink href="/community/ideas/new">Propose the first idea</ButtonLink>}
          />
        )}
        <div className="mt-6 flex gap-3">
          {sp.cursor && (
            <Link href={qs({ cursor: undefined })} className={buttonClass("secondary")}>
              Back to newest
            </Link>
          )}
          {res.nextCursor && (
            <Link href={qs({ cursor: res.nextCursor })} className={buttonClass("secondary")}>
              More ideas
            </Link>
          )}
        </div>
      </div>

      <aside className="hidden space-y-5 xl:block" aria-label="Your community">
        <Panel title="My Groups" action={mine.length ? <Link href="/community/groups/mine" className="text-sm text-accent-700 hover:underline">See all</Link> : undefined}>
          {mine.length ? (
            <ul className="space-y-1 text-sm">
              {mine.slice(0, 6).map((m) => (
                <li key={m.group.slug}>
                  <Link href={`/community/groups/${m.group.slug}`} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-ink-50">
                    <span className="truncate text-ink-800">{m.group.name}</span>
                    {m.unread > 0 && <span className="shrink-0 rounded-full bg-rose-500 px-2 text-xs font-semibold text-white">{m.unread} new</span>}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm leading-6 text-ink-600">
              You have not joined a group yet. Support an idea or{" "}
              <Link href="/community/groups" className="font-medium text-accent-700 hover:underline">
                explore groups
              </Link>
              .
            </p>
          )}
        </Panel>
        {otherNewGroups.length > 0 && (
          <Panel title="New groups you can join" action={<Link href="/community/groups" className="text-sm text-accent-700 hover:underline">Explore</Link>}>
            <ul className="space-y-1 text-sm">
              {otherNewGroups.map((g) => (
                <li key={g.slug}>
                  <Link href={`/community/groups/${g.slug}`} className="block rounded-lg px-2 py-1.5 hover:bg-ink-50">
                    <span className="block truncate text-ink-800">{g.name}</span>
                    <span className="block text-xs text-ink-500">
                      {g.memberCount} member{g.memberCount === 1 ? "" : "s"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        )}
        {notes.length > 0 && (
          <Panel title="New for you" action={<Link href="/community/notifications" className="text-sm text-accent-700 hover:underline">All</Link>}>
            <ul className="space-y-1 text-sm">
              {notes.map((n) => (
                <li key={n.id}>
                  <Link href={n.link ?? "/community/notifications"} className="block rounded-lg px-2 py-1.5 text-ink-800 hover:bg-ink-50">
                    {n.title}
                    <span className="block text-xs text-ink-500">
                      <Time date={n.updatedAt} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </aside>
    </div>
  );
}
