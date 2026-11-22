import "server-only";
import type { MeetingKind, Prisma, PrismaClient } from "@prisma/client";
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

/**
 * A meeting is only a shared Google Meet link; the site cannot know when the
 * call really ended. So a meeting counts as "in progress" for at most this long.
 * After that it is treated as ended everywhere (and the hourly clean-up writes
 * the end time), so "a meeting is happening now" can never stay up forever.
 * The link stays visible to members in "Past meetings".
 */
export const MEETING_MAX_HOURS = 4;
/** After this long any group member may end a meeting (before, only its starter or the coordinator). */
export const ANYONE_CAN_END_AFTER_MINUTES = 60;

/** True when a meeting that was never ended is past the limit (it is then shown as ended). */
export function isPastLimit(startedAt: Date, now = Date.now()): boolean {
  return startedAt.getTime() < now - MEETING_MAX_HOURS * 3600_000;
}

/** Who may end a meeting: its starter, the coordinator, and after a while anyone in the group. */
export function mayEndMeeting(m: { startedById: string | null; startedAt: Date }, userId: string, isCoordinator: boolean, now = Date.now()): boolean {
  return m.startedById === userId || isCoordinator || m.startedAt.getTime() < now - ANYONE_CAN_END_AFTER_MINUTES * 60_000;
}

/** Database filter for "in progress right now". Use it wherever meetings in progress are listed. */
export function liveMeeting(now = Date.now()) {
  return { endedAt: null, startedAt: { gt: new Date(now - MEETING_MAX_HOURS * 3600_000) } } satisfies Prisma.GroupMeetingWhereInput;
}

/** Marks meetings that ran past the limit as ended (at start + limit). Returns how many. */
export async function expireStaleMeetings(client: Pick<PrismaClient, "$executeRaw"> = db, now = Date.now()): Promise<number> {
  // Times are stored as UTC without a zone, so the cut-off is computed here, not with the database's now().
  const cutoff = new Date(now - MEETING_MAX_HOURS * 3600_000);
  return client.$executeRaw`UPDATE "GroupMeeting" SET "endedAt" = "startedAt" + make_interval(hours => ${MEETING_MAX_HOURS}::int) WHERE "endedAt" IS NULL AND "startedAt" < ${cutoff}`;
}

/** Ends the meeting in progress of a group that was archived or suspended. */
export async function endMeetingsOfGroup(groupId: string, client: Prisma.TransactionClient | PrismaClient = db) {
  await client.groupMeeting.updateMany({ where: { groupId, endedAt: null }, data: { endedAt: new Date() } });
}

export async function activeMeeting(groupId: string) {
  return db.groupMeeting.findFirst({ where: { groupId, ...liveMeeting() }, orderBy: { startedAt: "desc" }, include: { startedBy: { select: { profile: { select: { displayName: true } } } } } });
}

const ALREADY = "A meeting is already in progress. Join it, or end it before starting a new one.";

/**
 * `kind` is kept for older records; new meetings are simply "a meeting"
 * (voice and video are the same thing here: one Google Meet link).
 */
export async function startMeeting(userId: string, groupId: string, input: { kind?: MeetingKind; title: string | null; joinUrl: string }) {
  const a = await requireOpenGroupMember(groupId, userId);
  await expireStaleMeetings();
  const current = await activeMeeting(groupId);
  if (current) return { ok: false as const, error: ALREADY };
  let m;
  try {
    m = await db.groupMeeting.create({ data: { groupId, kind: input.kind ?? "VIDEO", title: input.title, joinUrl: input.joinUrl, provider: MEETING_PROVIDER, startedById: userId } });
  } catch (err) {
    // Two members pressed "Start" at the same moment: the database lets only one through.
    if ((err as { code?: string }).code === "P2002") return { ok: false as const, error: ALREADY };
    throw err;
  }
  await db.meetingAttendance.create({ data: { meetingId: m.id, userId } });
  await db.researchGroup.update({ where: { id: groupId }, data: { lastActivityAt: new Date() } });
  await notify(await activeMemberIds(groupId), {
    type: "MEETING_STARTED",
    title: `${a.group.name}: a meeting started (Google Meet)`,
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
  if (!m || m.groupId !== groupId || m.endedAt || isPastLimit(m.startedAt)) return { ok: false as const, error: "This meeting has ended." };
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
  // If the person who started it forgot, anyone in the group can end it after a while.
  if (!mayEndMeeting(m, userId, a.isCoordinator)) return { ok: false as const, error: "Only the person who started the meeting or the coordinator can end it during the first hour." };
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
