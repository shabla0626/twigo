import Link from "next/link";
import { notFound } from "next/navigation";
import { FormAlert } from "@/components/forms/fields";
import { MemberAvatar, Panel, Time } from "@/components/community/ui";
import { Badge, Button } from "@/components/ui/primitives";
import { groupOverview, loadGroupPage } from "@/server/community/group-page";
import { removeMemberAction, transferCoordinatorAction } from "../../../../actions";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | undefined>> };

export default async function MembersPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { ok } = await searchParams;
  const { user, group, isCoordinator } = await loadGroupPage(slug);
  const overview = await groupOverview(slug);
  if (!overview) notFound();
  return (
    <div className="max-w-4xl space-y-4">
      <p className="text-sm">
        <Link href={`/community/groups/${slug}`} className="text-accent-700 hover:underline">
          ← Back to overview
        </Link>
      </p>
      {ok && <FormAlert tone="success">{ok}</FormAlert>}
      <Panel title={`Members (${overview.memberships.length})`}>
        <ul className="divide-y divide-ink-100">
          {overview.memberships.map((m) => {
            const name = m.user.profile?.displayName ?? "Member";
            return (
              <li key={m.user.id} className="flex flex-wrap items-center gap-3 py-3">
                <MemberAvatar name={name} />
                <div className="min-w-0 flex-1">
                  <Link href={`/community/members/${m.user.id}`} className="font-medium text-ink-950 hover:underline">
                    {name}
                  </Link>{" "}
                  {m.role === "COORDINATOR" && <Badge tone="success">Coordinator</Badge>} {m.founding && <Badge>Founding member</Badge>}
                  {m.user.profile?.headline && <p className="truncate text-sm text-ink-600">{m.user.profile.headline}</p>}
                  <p className="text-xs text-ink-500">
                    Joined <Time date={m.joinedAt} />
                  </p>
                </div>
                {isCoordinator && m.user.id !== user.id && (
                  <div className="flex gap-2">
                    <form action={transferCoordinatorAction}>
                      <input type="hidden" name="groupId" value={group.id} />
                      <input type="hidden" name="userId" value={m.user.id} />
                      <Button type="submit" variant="secondary" size="sm">
                        Make coordinator
                      </Button>
                    </form>
                    <details className="relative">
                      <summary className="cursor-pointer list-none rounded-full px-3 py-1.5 text-sm text-red-700 hover:bg-red-50">Remove</summary>
                      <div className="absolute right-0 z-10 mt-2 w-64 rounded-xl border border-ink-100 bg-white p-3 text-sm shadow-soft-lg">
                        <p className="text-ink-700">Remove {name} from the group? They lose access to the chat, meetings and shared research. This is recorded.</p>
                        <form action={removeMemberAction} className="mt-2">
                          <input type="hidden" name="groupId" value={group.id} />
                          <input type="hidden" name="userId" value={m.user.id} />
                          <Button type="submit" variant="danger" size="sm">
                            Remove member
                          </Button>
                        </form>
                      </div>
                    </details>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <p className="mt-4 text-xs leading-5 text-ink-500">
          If the coordinator leaves, the longest-standing member becomes coordinator automatically. If no members remain, the group is archived and the
          organization is informed.
        </p>
      </Panel>
    </div>
  );
}
