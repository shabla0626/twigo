import { liveMeeting } from "@/server/community/meetings";
import { GroupCard } from "@/components/community/cards";
import { EmptyState, PageTitle } from "@/components/community/ui";
import { ButtonLink } from "@/components/ui/primitives";
import { db } from "@/lib/db";
import { requireMember } from "@/lib/auth/guard";
import { myGroups } from "@/server/community/groups";

export const metadata = { title: "My Groups" };

export default async function MyGroupsPage() {
  const user = await requireMember();
  const mine = await myGroups(user.id);
  const live = new Set(
    (await db.groupMeeting.findMany({ where: { ...liveMeeting(), groupId: { in: mine.map((m) => m.group.id) } }, select: { groupId: true } })).map((m) => m.groupId),
  );
  return (
    <>
      <PageTitle
        title="My Groups"
        description="The project groups you belong to. Open a group to chat, meet and share research. You can belong to as many groups as you like."
        actions={
          <ButtonLink href="/community/groups" variant="secondary">
            Explore more groups
          </ButtonLink>
        }
      />
      {mine.length ? (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {mine.map((m) => (
            <GroupCard key={m.group.id} group={m.group} unread={m.unread} role={m.role} isMember liveMeeting={live.has(m.group.id)} />
          ))}
        </div>
      ) : (
        <EmptyState
          title="You are not in a group yet"
          body="Join a group from Explore Groups, or support an idea: when it gets enough support, you automatically become a member of its new group."
          action={<ButtonLink href="/community/groups">Explore Groups</ButtonLink>}
        />
      )}
    </>
  );
}
