import Link from "next/link";
import type { GroupStatus, IdeaCategory } from "@prisma/client";
import { GroupCard } from "@/components/community/cards";
import { IconSearch } from "@/components/community/icons";
import { EmptyState, PageTitle } from "@/components/community/ui";
import { FormAlert, Input, Select } from "@/components/forms/fields";
import { Button, buttonClass } from "@/components/ui/primitives";
import { db } from "@/lib/db";
import { requireMember } from "@/lib/auth/guard";
import { readFlash } from "@/lib/flash";
import { IDEA_CATEGORIES } from "@/lib/validation/community";
import { GROUP_STATUS_LABELS } from "@/server/community/group-labels";
import { listGroups } from "@/server/community/groups";
import { GroupAgreementNote } from "@/components/community/group-agreement-note";
import { joinGroupAction } from "../../actions";

export const metadata = { title: "Explore Groups" };

type Props = { searchParams: Promise<Record<string, string | undefined>> };
const SORTS = [
  { key: "active", label: "Recently active" },
  { key: "new", label: "Newest" },
  { key: "members", label: "Most members" },
] as const;

export default async function GroupsPage({ searchParams }: Props) {
  const user = await requireMember();
  const sp = await searchParams;
  const flash = readFlash(sp);
  const sort = SORTS.find((s) => s.key === sp.sort)?.key ?? "active";
  const category = sp.category && sp.category in IDEA_CATEGORIES ? (sp.category as IdeaCategory) : undefined;
  const status = sp.status && sp.status in GROUP_STATUS_LABELS ? (sp.status as GroupStatus) : undefined;
  const q = sp.q?.trim().slice(0, 100) || undefined;
  const [res, memberships] = await Promise.all([
    listGroups({ q, category, status, sort, cursor: sp.cursor }),
    db.groupMembership.findMany({ where: { userId: user.id, status: "ACTIVE" }, select: { groupId: true, status: true } }),
  ]);
  const mine = new Set(memberships.map((m) => m.groupId));
  const filtered = Boolean(q || category || status || sort !== "active");
  const qs = (over: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ sort, category, status, q, ...over })) if (v) p.set(k, v);
    return `/community/groups?${p.toString()}`;
  };
  return (
    <>
      <PageTitle
        title="Explore Groups"
        description={
          <>
            Every group investigates one business idea. Open a group to read about it, and join the ones you would like to work on. Groups you have joined are under{" "}
            <Link href="/community/groups/mine" className="font-medium text-accent-700 hover:underline">
              My Groups
            </Link>
            .
            <GroupAgreementNote action="joining" className="mt-1" />
          </>
        }
      />
      {flash.error && (
        <div className="mb-4">
          <FormAlert tone="error">{flash.error}</FormAlert>
        </div>
      )}
      <form role="search" action="/community/groups" className="mb-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(10rem,1fr)_max-content_max-content_max-content_auto]">
        <label htmlFor="q" className="sr-only">
          Search groups
        </label>
        <div className="relative sm:col-span-2 lg:col-span-1">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <Input id="q" name="q" defaultValue={q} placeholder="Search groups" className="pl-9" />
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
        <label htmlFor="status" className="sr-only">
          Stage
        </label>
        <Select id="status" name="status" defaultValue={status ?? ""}>
          <option value="">All stages</option>
          {Object.entries(GROUP_STATUS_LABELS).map(([v, l]) => (
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
        <p className="-mt-2 mb-4 text-sm">
          <Link href="/community/groups" className="font-medium text-accent-700 hover:underline">
            Clear search and filters
          </Link>
        </p>
      )}
      {res.items.length ? (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {res.items.map((g) => (
            <GroupCard key={g.id} group={g} groupId={g.id} isMember={mine.has(g.id)} joinAction={joinGroupAction} />
          ))}
        </div>
      ) : (
        <EmptyState
          title={q || category || status ? "No groups match" : "No project groups yet"}
          body="A group is created automatically when an idea gets enough support from other members."
          action={
            <Link href="/community?sort=endorsed" className={buttonClass("primary")}>
              Browse ideas to support
            </Link>
          }
        />
      )}
      {res.nextCursor && (
        <div className="mt-6">
          <Link href={qs({ cursor: res.nextCursor })} className={buttonClass("secondary")}>
            More groups
          </Link>
        </div>
      )}
    </>
  );
}
