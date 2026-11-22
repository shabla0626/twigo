import "server-only";
import type { MeetingKind } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { publishRealtime } from "@/lib/realtime-events";
import { activeMemberIds, requireCoordinator, requireGroupMember, requireOpenGroupMember } from "./access";
import { notify } from "./notifications";

/**
 * Meetings use Google Meet for now (founder decision, Phase 1). The app
 * stores only metadata: who started a meeting, when, the link, who opened
 * "Join", and when it ended. No audio/video passes through or is recorded.
 *
 * Provider interface: `provider` + `joinUrl` on GroupMeeting. A self-hosted
 * provider (e.g. LiveKit) can be added later by issuing short-lived room
 * tokens in `joinMeeting()` instead of returning a static link.
 */
export const MEETING_PROVIDER = "google_meet";

export async function activeMeeting(groupId: string) {
  return db.groupMeeting.findFirst({ where: { groupId, endedAt: null }, orderBy: { startedAt: "desc" }, include: { startedBy: { select: { profile: { select: { displayName: true } } } } } });
}

export async function startMeeting(userId: string, groupId: string, input: { kind: MeetingKind; title: string | null; joinUrl: string }) {
  const a = await requireOpenGroupMember(groupId, userId);
  const current = await activeMeeting(groupId);
  if (current) return { ok: false as const, error: "A meeting is already in progress. End it before starting a new one." };
  const m = await db.groupMeeting.create({ data: { groupId, kind: input.kind, title: input.title, joinUrl: input.joinUrl, provider: MEETING_PROVIDER, startedById: userId } });
  await db.meetingAttendance.create({ data: { meetingId: m.id, userId } });
  await db.researchGroup.update({ where: { id: groupId }, data: { lastActivityAt: new Date() } });
  await notify(await activeMemberIds(groupId), {
    type: "MEETING_STARTED",
    title: `${a.group.name}: a ${input.kind === "VOICE" ? "voice" : "video"} meeting started`,
    body: input.title ?? undefined,
    link: `/community/groups/${a.group.slug}/meetings`,
  }, { exclude: userId });
  await publishRealtime(db, { t: "group.updated", groupId, what: "meeting" });
  return { ok: true as const, id: m.id };
}

/** Returns the join link for a CURRENT group member and records attendance. */
export async function joinMeeting(userId: string, groupId: string, meetingId: string) {
  await requireOpenGroupMember(groupId, userId);
  const m = await db.groupMeeting.findUnique({ where: { id: meetingId } });
  if (!m || m.groupId !== groupId || m.endedAt) return { ok: false as const, error: "This meeting has ended." };
  await db.meetingAttendance.upsert({
    where: { meetingId_userId: { meetingId, userId } },
    create: { meetingId, userId },
    update: { lastJoinedAt: new Date() },
  });
  return { ok: true as const, url: m.joinUrl };
}

export async function endMeeting(userId: string, groupId: string, meetingId: string) {
  const a = await requireGroupMember(groupId, userId);
  const m = await db.groupMeeting.findUnique({ where: { id: meetingId } });
  if (!m || m.groupId !== groupId || m.endedAt) return { ok: true as const };
  if (m.startedById !== userId && !a.isCoordinator) return { ok: false as const, error: "Only the person who started the meeting or the coordinator can end it." };
  await db.groupMeeting.update({ where: { id: meetingId }, data: { endedAt: new Date(), endedById: userId } });
  await publishRealtime(db, { t: "group.updated", groupId, what: "meeting" });
  return { ok: true as const };
}

export async function meetingHistory(groupId: string, userId: string) {
  await requireGroupMember(groupId, userId);
  return db.groupMeeting.findMany({
    where: { groupId },
    orderBy: { startedAt: "desc" },
    take: 30,
    select: {
      id: true,
      kind: true,
      title: true,
      startedAt: true,
      endedAt: true,
      startedBy: { select: { profile: { select: { displayName: true } } } },
      _count: { select: { attendance: true } },
    },
  });
}

export async function coordinatorEndAny(userId: string, groupId: string) {
  await requireCoordinator(groupId, userId);
  const m = await activeMeeting(groupId);
  if (m) await db.groupMeeting.update({ where: { id: m.id }, data: { endedAt: new Date(), endedById: userId } });
  await audit(userId, "meeting.ended_by_coordinator", "ResearchGroup", groupId);
}
