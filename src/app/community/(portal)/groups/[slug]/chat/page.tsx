import { GroupChat } from "@/components/community/chat";
import { MembersOnly } from "@/components/community/members-only";
import { db } from "@/lib/db";
import { groupChannel, loadGroupPage } from "@/server/community/group-page";

export default async function ChatPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { user, group, isMember, isOpen } = await loadGroupPage(slug);
  if (!isMember) return <MembersOnly groupId={group.id} what="Group chat" canJoin={isOpen} />;
  const [channel, memberships] = await Promise.all([
    groupChannel(group.id),
    db.groupMembership.findMany({
      where: { groupId: group.id, status: "ACTIVE" },
      orderBy: { joinedAt: "asc" },
      select: { user: { select: { id: true, profile: { select: { displayName: true } } } } },
    }),
  ]);
  if (!channel) return <p className="text-sm text-ink-600">This group has no chat channel.</p>;
  return (
    <GroupChat
      channelId={channel.id}
      groupId={group.id}
      me={{ id: user.id, name: user.displayName }}
      members={memberships.map((m) => ({ id: m.user.id, name: m.user.profile?.displayName ?? "Member" }))}
    />
  );
}
