import Link from "next/link";
import { GroupTabs } from "@/components/community/group-tabs";
import { LeaveGroupButton } from "@/components/community/leave-group";
import { Badge, Button } from "@/components/ui/primitives";
import { GROUP_STATUS_LABELS } from "@/server/community/group-labels";
import { groupMeetingNow, groupUnread, loadGroupPage } from "@/server/community/group-page";
import { joinGroupAction, leaveGroupAction } from "../../../actions";

type Props = { children: React.ReactNode; params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // Same cached lookup as the page itself: no extra query.
  const { group } = await loadGroupPage(slug);
  return { title: group.name };
}

/** One workspace per group: a short header, the join/leave action and five tabs. */
export default async function GroupLayout({ children, params }: Props) {
  const { slug } = await params;
  const { user, group, isMember, isCoordinator, isOpen, membership } = await loadGroupPage(slug);
  const [unread, meeting] = isMember ? await Promise.all([groupUnread(group.id, user.id), groupMeetingNow(group.id)]) : [0, null];
  const live = Boolean(meeting);
  return (
    <div className="space-y-5">
      <header className="space-y-4 rounded-2xl border border-ink-100 bg-white p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold leading-tight text-ink-950 sm:text-2xl">{group.name}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-600">
              <Badge tone={group.status === "ARCHIVED" ? "neutral" : "accent"}>Stage: {GROUP_STATUS_LABELS[group.status]}</Badge>
              <span>
                {group.memberCount} member{group.memberCount === 1 ? "" : "s"}
              </span>
              {isCoordinator && <Badge tone="success">You coordinate this group</Badge>}
              {group.suspendedAt && <Badge tone="danger">Suspended</Badge>}
            </p>
          </div>
          {isMember ? (
            // On phones the Leave button sits on the Overview tab, keeping room for the chat.
            <div className="hidden sm:block">
              <LeaveGroupButton groupId={group.id} action={leaveGroupAction} />
            </div>
          ) : isOpen && membership?.status !== "REMOVED" ? (
            <form action={joinGroupAction}>
              <input type="hidden" name="groupId" value={group.id} />
              <Button type="submit">Join group</Button>
            </form>
          ) : null}
        </div>
        {!isMember && isOpen && (
          <p className="rounded-xl bg-accent-50 p-3 text-sm leading-6 text-accent-950">
            You can read the overview and discussions. <strong>Join the group</strong> to use its chat, meetings and shared research.
          </p>
        )}
        {group.suspendedAt && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-900">This group is suspended while the organization reviews it. Its content is read-only.</p>}
        {group.status === "ARCHIVED" && (
          <p className="rounded-xl bg-ink-100 p-3 text-sm text-ink-800">
            This group is archived and read-only.{" "}
            <Link href="/community/groups" className="font-medium underline">
              Find an active group
            </Link>
          </p>
        )}
        <GroupTabs slug={group.slug} isMember={isMember} unread={unread} live={live} />
      </header>
      {children}
    </div>
  );
}
