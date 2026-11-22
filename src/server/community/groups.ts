import "server-only";
import type { GroupStatus, IdeaCategory, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ACTIVE_MEMBER } from "@/lib/auth/member-where";
import { audit } from "@/lib/audit";
import { publishRealtime } from "@/lib/realtime-events";
import { writeSystemLine } from "@/realtime/chat-service";
import { activeMemberIds, groupAccess, requireCoordinator } from "./access";
import { notify } from "./notifications";
import { COORDINATOR_STATUSES, GROUP_STATUS_LABELS } from "./group-labels";

export { GROUP_STATUS_LABELS, COORDINATOR_STATUSES };

export function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "group"
  );
}

async function uniqueGroupSlug(tx: Prisma.TransactionClient, name: string) {
  // "mine" is a reserved path segment (/community/groups/mine).
  const base = slugify(name) === "mine" ? "mine-group" : slugify(name);
  for (let i = 0; i < 50; i++) {
    const slug = i === 0 ? base : `${base}-${i + 1}`;
    if (!(await tx.researchGroup.findUnique({ where: { slug }, select: { id: true } }))) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/**
 * Creates the research group for an idea. Must run inside the endorsement
 * transaction that holds the idea row lock. The author becomes coordinator
 * (or, if the author's account is gone or inactive, the first endorser).
 */
export async function createGroupFromIdea(tx: Prisma.TransactionClient, ideaId: string, endorserIds: string[]) {
  const idea = await tx.businessIdea.findUniqueOrThrow({
    where: { id: ideaId },
    select: { id: true, title: true, summary: true, description: true, category: true, authorId: true },
  });
  // The author coordinates only if they can take part right now (same rule as everywhere else).
  const authorActive = Boolean(idea.authorId && (await tx.user.findFirst({ where: { id: idea.authorId, ...ACTIVE_MEMBER }, select: { id: true } })));
  const coordinatorId = authorActive ? idea.authorId! : endorserIds[0]!;
  const memberIds = [...new Set([...(authorActive ? [idea.authorId!] : []), ...endorserIds])];

  const group = await tx.researchGroup.create({
    data: {
      slug: await uniqueGroupSlug(tx, idea.title),
      name: idea.title,
      purpose: idea.summary,
      description: idea.description,
      category: idea.category,
      ideaId: idea.id,
      memberCount: memberIds.length,
      channels: { create: { name: "general", isDefault: true } },
      memberships: {
        create: memberIds.map((userId) => ({ userId, role: userId === coordinatorId ? "COORDINATOR" : "MEMBER", founding: true })),
      },
    },
  });
  await tx.businessIdea.update({ where: { id: idea.id }, data: { status: "GROUP_FORMED" } });
  return { id: group.id, slug: group.slug, name: group.name, memberIds, authorId: authorActive ? idea.authorId : coordinatorId };
}

/** The number shown as "members": people in the group who can take part right now. */
async function refreshMemberCount(groupId: string, tx: Prisma.TransactionClient = db) {
  const count = await tx.groupMembership.count({ where: { groupId, status: "ACTIVE", user: ACTIVE_MEMBER } });
  await tx.researchGroup.update({ where: { id: groupId }, data: { memberCount: count } });
  return count;
}

const cardSelect = {
  id: true,
  slug: true,
  name: true,
  purpose: true,
  category: true,
  status: true,
  memberCount: true,
  lastActivityAt: true,
  createdAt: true,
  suspendedAt: true,
  idea: { select: { title: true } },
} satisfies Prisma.ResearchGroupSelect;

export async function listGroups(opts: { q?: string; category?: IdeaCategory; status?: GroupStatus; sort?: "active" | "new" | "members"; cursor?: string; take?: number }) {
  const take = Math.min(opts.take ?? 24, 50);
  const where: Prisma.ResearchGroupWhereInput = {
    suspendedAt: null,
    ...(opts.status ? { status: opts.status } : { status: { not: "ARCHIVED" } }),
    ...(opts.category ? { category: opts.category } : {}),
    ...(opts.q ? { OR: [{ name: { contains: opts.q, mode: "insensitive" } }, { purpose: { contains: opts.q, mode: "insensitive" } }] } : {}),
  };
  const orderBy: Prisma.ResearchGroupOrderByWithRelationInput[] =
    opts.sort === "new" ? [{ createdAt: "desc" }, { id: "desc" }] : opts.sort === "members" ? [{ memberCount: "desc" }, { id: "desc" }] : [{ lastActivityAt: "desc" }, { id: "desc" }];
  const rows = await db.researchGroup.findMany({ where, orderBy, take: take + 1, ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}), select: cardSelect });
  return { items: rows.slice(0, take), nextCursor: rows.length > take ? rows[take - 1]!.id : null };
}

/** Groups the member belongs to, with unread chat message counts. */
export async function myGroups(userId: string) {
  const memberships = await db.groupMembership.findMany({
    where: { userId, status: "ACTIVE", group: { suspendedAt: null } },
    orderBy: { group: { lastActivityAt: "desc" } },
    select: { role: true, joinedAt: true, group: { select: { ...cardSelect, channels: { where: { isDefault: true }, select: { id: true } } } } },
  });
  const channelIds = memberships.flatMap((m) => m.group.channels.map((c) => c.id));
  const reads = await db.channelReadState.findMany({ where: { userId, channelId: { in: channelIds } } });
  const readMap = new Map(reads.map((r) => [r.channelId, r.lastReadAt]));
  // "Unread" starts when the person joined: older messages can be read (by ordinary members),
  // but they are not new to anyone, so they are never counted.
  const windows = memberships.flatMap((m) => {
    const ch = m.group.channels[0];
    return ch ? [{ channelId: ch.id, createdAt: { gt: unreadSince(readMap.get(ch.id), m.joinedAt) } }] : [];
  });
  // One question to the database for all groups together.
  const counts = windows.length
    ? await db.chatMessage.groupBy({
        by: ["channelId"],
        where: { kind: "USER", deletedAt: null, authorId: { not: userId }, OR: windows },
        _count: { _all: true },
      })
    : [];
  const unreadMap = new Map(counts.map((c) => [c.channelId, c._count._all]));
  return memberships.map((m) => ({ role: m.role, group: m.group, unread: unreadMap.get(m.group.channels[0]?.id ?? "") ?? 0 }));
}

/** The moment from which chat messages count as unread: the later of "last read" and "joined". */
export function unreadSince(lastReadAt: Date | null | undefined, joinedAt: Date): Date {
  return new Date(Math.max(lastReadAt?.getTime() ?? 0, joinedAt.getTime()));
}

/** Community-visible group information (no chat, files or research). */
export async function getGroupOverview(slug: string) {
  return db.researchGroup.findUnique({
    where: { slug },
    include: {
      idea: { select: { id: true, title: true, summary: true, status: true, author: { select: { id: true, profile: { select: { displayName: true } } } } } },
      memberships: {
        where: { status: "ACTIVE", user: ACTIVE_MEMBER },
        orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
        select: { role: true, joinedAt: true, founding: true, user: { select: { id: true, role: true, profile: { select: { displayName: true, headline: true } } } } },
      },
      announcements: { orderBy: { createdAt: "desc" }, take: 5, include: { author: { select: { profile: { select: { displayName: true } } } } } },
      project: { select: { id: true, title: true, status: true } },
    },
  });
}

/**
 * How a person is named in a chat line. Owners and administrators are marked,
 * so members always know when staff enters or leaves their group.
 */
async function nameInChat(tx: Prisma.TransactionClient, userId: string): Promise<string> {
  const u = await tx.user.findUnique({ where: { id: userId }, select: { role: true, profile: { select: { displayName: true } } } });
  const name = u?.profile?.displayName ?? "A member";
  return u && u.role !== "MEMBER" ? `${name} (administrator)` : name;
}

/** Shows chat lines written during a transaction to the people who have the chat open (call after it committed). */
async function publishLines(ids: (string | null | undefined)[]) {
  for (const messageId of ids) if (messageId) await publishRealtime(db, { t: "chat.system", messageId });
}

/** PostgreSQL deadlock (40P01) or serialization failure (40001): the whole transaction can safely run again. */
function isRetryable(err: unknown): boolean {
  return /40P01|40001|deadlock detected/.test(`${(err as { code?: string })?.code ?? ""} ${String(err)}`);
}

/**
 * Runs `fn` in a transaction that first locks the group's row. Every change to
 * a group's memberships goes through here, so two changes to the same group
 * (two people leaving at the same moment, a leave during a succession) run one
 * after the other instead of colliding.
 */
export async function withGroupLock<T>(groupId: string, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "ResearchGroup" WHERE id = ${groupId} FOR UPDATE`;
        return fn(tx);
      });
    } catch (err) {
      if (attempt >= 2 || !isRetryable(err)) throw err;
    }
  }
}

export async function joinGroup(userId: string, groupId: string) {
  const a = await groupAccess(groupId, userId);
  if (!a || a.group.suspendedAt) return { ok: false as const, error: "This group is not available." };
  if (a.group.status === "ARCHIVED") return { ok: false as const, error: "Archived groups cannot be joined." };
  if (a.isMember) return { ok: true as const };
  if (a.membership?.status === "REMOVED") return { ok: false as const, error: "You were removed from this group by its coordinator. Contact the organization if you think this was a mistake." };
  const joined = await withGroupLock(a.group.id, async (tx) => {
    // Re-read under the lock: the situation may have changed since the checks above.
    const g = await tx.researchGroup.findUniqueOrThrow({ where: { id: a.group.id }, select: { status: true, suspendedAt: true } });
    const m = await tx.groupMembership.findUnique({ where: { groupId_userId: { groupId: a.group.id, userId } } });
    if (g.suspendedAt || g.status === "ARCHIVED" || m?.status === "REMOVED") return { ok: false as const };
    if (m?.status === "ACTIVE") return { ok: true as const, line: null, succession: null };
    await tx.groupMembership.upsert({
      where: { groupId_userId: { groupId: a.group.id, userId } },
      create: { groupId: a.group.id, userId, role: "MEMBER" },
      update: { status: "ACTIVE", role: "MEMBER", joinedAt: new Date(), leftAt: null },
    });
    await refreshMemberCount(a.group.id, tx);
    await tx.researchGroup.update({ where: { id: a.group.id }, data: { lastActivityAt: new Date() } });
    // Visible to the whole group, and written together with the change itself.
    const line = await writeSystemLine(tx, a.group.id, `${await nameInChat(tx, userId)} joined the group`);
    // A group without a coordinator (for example one that was reopened after everyone had left)
    // gets one as soon as somebody eligible is in it.
    return { ok: true as const, line, succession: await ensureCoordinator(tx, a.group.id) };
  });
  if (!joined.ok) return { ok: false as const, error: "This group is not available." };
  if (joined.line) {
    await audit(userId, "group.member_joined", "ResearchGroup", a.group.id);
    await publishLines([joined.line]);
  }
  if (joined.succession) await announceSuccession(a.group.id, joined.succession, "vacant");
  await publishRealtime(db, { t: "group.updated", groupId: a.group.id, what: "members" });
  return { ok: true as const };
}

/** `line`: id of the chat line that announces the new coordinator (publish it after the transaction). */
type Succession = { promoted: string | null; archived: boolean; flagged: boolean; line?: string | null };

/**
 * Coordinator succession (see docs/ARCHITECTURE.md). Must run under the group lock.
 * "Eligible" means an active group member who currently has community access.
 * 1. The longest-standing eligible coordinator stays. Any other coordinator row
 *    (for example of someone who was suspended) becomes an ordinary member, so a
 *    group can never have two coordinators.
 * 2. With no eligible coordinator, the longest-standing eligible member is promoted.
 * 3. With no eligible member: if nobody is left at all, the group is archived and
 *    flagged for administrators; if members remain but none is eligible right now,
 *    the group is only flagged.
 */
async function ensureCoordinator(tx: Prisma.TransactionClient, groupId: string): Promise<Succession> {
  const eligible = { groupId, status: "ACTIVE", user: ACTIVE_MEMBER } satisfies Prisma.GroupMembershipWhereInput;
  // Founding members share one joining time; the id (which grows with creation order) breaks the tie.
  const oldestFirst = [{ joinedAt: "asc" }, { id: "asc" }] satisfies Prisma.GroupMembershipOrderByWithRelationInput[];
  const keep = await tx.groupMembership.findFirst({ where: { ...eligible, role: "COORDINATOR" }, orderBy: oldestFirst, select: { id: true } });
  await tx.groupMembership.updateMany({ where: { groupId, role: "COORDINATOR", ...(keep ? { id: { not: keep.id } } : {}) }, data: { role: "MEMBER" } });
  if (keep) return { promoted: null, archived: false, flagged: false };
  const next = await tx.groupMembership.findFirst({ where: eligible, orderBy: oldestFirst });
  if (next) {
    await tx.groupMembership.update({ where: { id: next.id }, data: { role: "COORDINATOR" } });
    await tx.researchGroup.update({ where: { id: groupId }, data: { adminManaged: false } });
    const line = await writeSystemLine(tx, groupId, `${await nameInChat(tx, next.userId)} is now the coordinator`);
    return { promoted: next.userId, archived: false, flagged: false, line };
  }
  const remaining = await tx.groupMembership.count({ where: { groupId, status: "ACTIVE" } });
  if (remaining === 0) {
    await tx.researchGroup.update({ where: { id: groupId }, data: { status: "ARCHIVED", archivedAt: new Date(), adminManaged: true } });
    await tx.groupMeeting.updateMany({ where: { groupId, endedAt: null }, data: { endedAt: new Date() } });
    return { promoted: null, archived: true, flagged: true };
  }
  await tx.researchGroup.update({ where: { id: groupId }, data: { adminManaged: true } });
  return { promoted: null, archived: false, flagged: true };
}

const SUCCESSION_REASON = {
  left: "The previous coordinator left the group.",
  unavailable: "The previous coordinator is no longer available.",
  vacant: "The group had no coordinator.",
} as const;

/** Notifications and audit entries for a succession (after the transaction has committed). */
async function announceSuccession(groupId: string, outcome: Succession, why: keyof typeof SUCCESSION_REASON) {
  await publishLines([outcome.line]);
  if (!outcome.promoted && !outcome.archived && !outcome.flagged) return;
  const group = await db.researchGroup.findUniqueOrThrow({ where: { id: groupId }, select: { slug: true, name: true } });
  if (outcome.promoted) {
    await notify([outcome.promoted], {
      type: "COORDINATOR_ASSIGNED",
      title: `You are now the coordinator of “${group.name}”`,
      body: `${SUCCESSION_REASON[why]} As the longest-standing member, you were made coordinator. You can hand the role to another member at any time.`,
      link: `/community/groups/${group.slug}`,
    });
    await audit(null, "group.coordinator_succession", "ResearchGroup", groupId, { newCoordinator: outcome.promoted, why });
  }
  if (outcome.archived) await audit(null, "group.archived_no_members", "ResearchGroup", groupId);
  else if (outcome.flagged) await audit(null, "group.no_eligible_coordinator", "ResearchGroup", groupId, { why });
  await publishRealtime(db, { t: "group.updated", groupId, what: "members" });
}

async function afterMembershipEnded(groupId: string, userId: string, outcome: Succession) {
  await publishRealtime(db, { t: "group.access_revoked", groupId, userId });
  await publishRealtime(db, { t: "group.updated", groupId, what: "members" });
  await announceSuccession(groupId, outcome, "left");
}

/** Voluntary leave. Organization membership is not affected. History stays per retention policy. */
export async function leaveGroup(userId: string, groupId: string) {
  const done = await withGroupLock(groupId, async (tx) => {
    const m = await tx.groupMembership.findUnique({ where: { groupId_userId: { groupId, userId } } });
    if (!m || m.status !== "ACTIVE") return null;
    await tx.groupMembership.update({ where: { id: m.id }, data: { status: "LEFT", leftAt: new Date(), role: "MEMBER" } });
    await refreshMemberCount(groupId, tx);
    const line = await writeSystemLine(tx, groupId, `${await nameInChat(tx, userId)} left the group`);
    return { line, outcome: await ensureCoordinator(tx, groupId) };
  });
  if (done) {
    await audit(userId, "group.member_left", "ResearchGroup", groupId);
    await publishLines([done.line]);
    await afterMembershipEnded(groupId, userId, done.outcome);
  }
  return { ok: true as const };
}

export async function leaveAllGroups(userId: string) {
  const ms = await db.groupMembership.findMany({ where: { userId, status: "ACTIVE" }, select: { groupId: true } });
  for (const m of ms) await leaveGroup(userId, m.groupId);
}

/**
 * Brings a person's groups up to date after their account or community access
 * changed (suspended, paused, restored). In every group they belong to: the
 * member count is recounted, and the coordinator rule is applied (a coordinator
 * who can no longer act is replaced at once; a group without coordinator gets
 * one when somebody eligible is there). Call it AFTER the change was saved.
 */
async function syncGroupsOf(userId: string, why: keyof typeof SUCCESSION_REASON) {
  const rows = await db.groupMembership.findMany({ where: { userId, status: "ACTIVE", group: { status: { not: "ARCHIVED" } } }, select: { groupId: true } });
  for (const { groupId } of rows) {
    const outcome = await withGroupLock(groupId, async (tx) => {
      await refreshMemberCount(groupId, tx);
      return ensureCoordinator(tx, groupId);
    });
    await announceSuccession(groupId, outcome, why);
  }
}

/** Account suspended or community access paused: the person keeps their place, but cannot act or count. */
export async function reassignCoordinatorsOf(userId: string) {
  await syncGroupsOf(userId, "unavailable");
}

/** Access regained: the person returns as an ordinary member (the coordinator role is never given back automatically). */
export async function fillVacantCoordinators(userId: string) {
  await syncGroupsOf(userId, "vacant");
}

/** Coordinator removes a disruptive member (audited). */
export async function removeMember(coordinatorId: string, groupId: string, userId: string) {
  await requireCoordinator(groupId, coordinatorId);
  if (coordinatorId === userId) return { ok: false as const, error: "Use “Leave group” to leave yourself." };
  const removed = await withGroupLock(groupId, async (tx) => {
    const m = await tx.groupMembership.findUnique({ where: { groupId_userId: { groupId, userId } } });
    if (!m || m.status !== "ACTIVE") return null;
    await tx.groupMembership.update({ where: { id: m.id }, data: { status: "REMOVED", leftAt: new Date(), role: "MEMBER" } });
    await refreshMemberCount(groupId, tx);
    return { line: await writeSystemLine(tx, groupId, `${await nameInChat(tx, userId)} was removed from the group by the coordinator`) };
  });
  if (!removed) return { ok: false as const, error: "That person is not an active member." };
  await publishLines([removed.line]);
  await audit(coordinatorId, "group.member_removed", "ResearchGroup", groupId, { userId });
  await afterMembershipEnded(groupId, userId, { promoted: null, archived: false, flagged: false });
  // The person is told, in plain words, what happened and whom to ask.
  const g = await db.researchGroup.findUniqueOrThrow({ where: { id: groupId }, select: { slug: true, name: true } });
  await notify([userId], {
    type: "GROUP_MEMBERSHIP",
    title: `You were removed from “${g.name}” by its coordinator`,
    body: "You no longer have access to its chat, meetings and shared research. Your account and your other groups are not affected. If you think this was a mistake, contact the organization.",
    link: `/community/groups/${g.slug}`,
  });
  return { ok: true as const };
}

/**
 * The organization lifts a removal: the person may join the group again by themselves.
 * They are NOT put back automatically, and the group sees a line in its chat, so nothing
 * about who can be in the group changes behind the members' backs.
 */
export async function adminLiftRemoval(adminId: string, groupId: string, userId: string) {
  const done = await withGroupLock(groupId, async (tx) => {
    const m = await tx.groupMembership.findUnique({ where: { groupId_userId: { groupId, userId } } });
    if (!m || m.status !== "REMOVED") return null;
    await tx.groupMembership.update({ where: { id: m.id }, data: { status: "LEFT" } });
    return { line: await writeSystemLine(tx, groupId, `The organization allowed ${await nameInChat(tx, userId)} to join the group again`) };
  });
  if (!done) return { ok: false as const, error: "This person is not currently removed from the group." };
  await publishLines([done.line]);
  await audit(adminId, "group.removal_lifted", "ResearchGroup", groupId, { userId });
  const g = await db.researchGroup.findUniqueOrThrow({ where: { id: groupId }, select: { slug: true, name: true } });
  await notify([userId], {
    type: "GROUP_MEMBERSHIP",
    title: `You can join “${g.name}” again`,
    body: "The organization lifted your removal from this group. You are not a member yet: open the group and choose “Join” if you want to return.",
    link: `/community/groups/${g.slug}`,
  });
  return { ok: true as const };
}

/** Coordinator hands the role to another active member. */
export async function transferCoordinator(coordinatorId: string, groupId: string, toUserId: string) {
  await requireCoordinator(groupId, coordinatorId);
  const done = await withGroupLock(groupId, async (tx) => {
    const target = await tx.groupMembership.findFirst({ where: { groupId, userId: toUserId, status: "ACTIVE", user: ACTIVE_MEMBER } });
    const mine = await tx.groupMembership.findFirst({ where: { groupId, userId: coordinatorId, status: "ACTIVE", role: "COORDINATOR" } });
    if (!target || !mine) return null;
    await tx.groupMembership.updateMany({ where: { groupId, role: "COORDINATOR" }, data: { role: "MEMBER" } });
    await tx.groupMembership.update({ where: { id: target.id }, data: { role: "COORDINATOR" } });
    return { line: await writeSystemLine(tx, groupId, `${await nameInChat(tx, toUserId)} is now the coordinator (handed over by ${await nameInChat(tx, coordinatorId)})`) };
  });
  if (!done) return { ok: false as const, error: "Choose an active member of the group." };
  await publishLines([done.line]);
  const g = await db.researchGroup.findUniqueOrThrow({ where: { id: groupId }, select: { slug: true, name: true } });
  await notify([toUserId], { type: "COORDINATOR_ASSIGNED", title: `You are now the coordinator of “${g.name}”`, link: `/community/groups/${g.slug}` });
  await audit(coordinatorId, "group.coordinator_transferred", "ResearchGroup", groupId, { to: toUserId });
  return { ok: true as const };
}

export async function setGroupStatusByCoordinator(coordinatorId: string, groupId: string, status: GroupStatus) {
  const a = await requireCoordinator(groupId, coordinatorId);
  if (!COORDINATOR_STATUSES.includes(status)) return { ok: false as const, error: "That status can only be set by the organization." };
  if (a.group.status === "APPROVED_FOR_PROJECT") return { ok: false as const, error: "This group was approved for project work; its status is managed by the organization." };
  if (a.group.status === status) return { ok: true as const };
  await db.researchGroup.update({ where: { id: groupId }, data: { status, lastActivityAt: new Date() } });
  await audit(coordinatorId, "group.status_changed", "ResearchGroup", groupId, { from: a.group.status, to: status });
  await notify(await activeMemberIds(groupId), {
    type: "GROUP_STATUS",
    title: `“${a.group.name}” is now: ${GROUP_STATUS_LABELS[status]}`,
    body: status === "READY_FOR_REVIEW" ? "The group asked the organization to review its proposal. This does not yet authorize any commercial work." : undefined,
    link: `/community/groups/${a.group.slug}`,
  }, { exclude: coordinatorId });
  await publishRealtime(db, { t: "group.updated", groupId, what: "status" });
  return { ok: true as const };
}

const clean = (v: string | null | undefined) => (v ?? "").trim();

/**
 * Coordinator edits the group's name and texts. Founder decision 5: what the
 * group is working on (its purpose) is the group's business direction, and it
 * may change only openly. So a change of purpose needs a short note saying
 * what changed and why; the change is then written down as a group decision,
 * posted as an announcement, shown in the chat and sent to every member, and
 * the previous purpose stays on record. The discussion itself happens in the
 * group's chat and discussions; there is no voting mechanism.
 */
export async function updateGroupInfo(coordinatorId: string, groupId: string, input: { name: string; purpose: string | null; description: string | null }, reason?: string | null) {
  const a = await requireCoordinator(groupId, coordinatorId);
  const purposeChanged = clean(a.group.purpose) !== clean(input.purpose);
  const why = clean(reason);
  if (purposeChanged && why.length < 10) {
    return { ok: false as const, error: "You are changing what the group is working on. Please add a short note for the members: what changes, and why (at least a few words)." };
  }
  const line = await withGroupLock(groupId, async (tx) => {
    await tx.researchGroup.update({ where: { id: groupId }, data: { ...input, ...(purposeChanged ? { lastActivityAt: new Date() } : {}) } });
    if (!purposeChanged) return null;
    const previous = clean(a.group.purpose) || "(none)";
    const next = clean(input.purpose) || "(none)";
    await tx.groupDecision.create({
      data: { groupId, recordedById: coordinatorId, title: "Change of what the group is working on", decision: `New: ${next}`, rationale: `Why: ${why}\n\nPrevious: ${previous}` },
    });
    await tx.groupAnnouncement.create({
      data: { groupId, authorId: coordinatorId, title: "What the group is working on has changed", body: `New: ${next}\n\nPrevious: ${previous}\n\nWhy: ${why}` },
    });
    return writeSystemLine(tx, groupId, `${await nameInChat(tx, coordinatorId)} changed what the group is working on (see the announcement on the Overview)`);
  });
  if (purposeChanged) {
    await publishLines([line]);
    await audit(coordinatorId, "group.purpose_changed", "ResearchGroup", groupId);
    await notify(
      await activeMemberIds(groupId),
      {
        type: "GROUP_DECISION",
        title: `${a.group.name}: what the group is working on has changed`,
        body: "The coordinator changed the group’s direction and wrote down why. You can read the previous and the new version in the group.",
        link: `/community/groups/${a.group.slug}`,
      },
      { exclude: coordinatorId },
    );
    await publishRealtime(db, { t: "group.updated", groupId, what: "announcement" });
  }
  return { ok: true as const, purposeChanged };
}

export async function postAnnouncement(coordinatorId: string, groupId: string, input: { title: string; body: string }) {
  const a = await requireCoordinator(groupId, coordinatorId);
  await db.groupAnnouncement.create({ data: { groupId, authorId: coordinatorId, ...input } });
  await db.researchGroup.update({ where: { id: groupId }, data: { lastActivityAt: new Date() } });
  await notify(await activeMemberIds(groupId), { type: "GROUP_ANNOUNCEMENT", title: `${a.group.name}: ${input.title}`, link: `/community/groups/${a.group.slug}` }, { exclude: coordinatorId });
  await publishRealtime(db, { t: "group.updated", groupId, what: "announcement" });
  return { ok: true as const };
}

// ---------------------------------------------------------------- administration

export async function adminSetGroupState(adminId: string, groupId: string, action: "archive" | "reopen" | "suspend" | "unsuspend", reason?: string) {
  const g = await db.researchGroup.findUnique({ where: { id: groupId } });
  if (!g) return { ok: false as const, error: "Group not found." };
  const data: Prisma.ResearchGroupUpdateInput =
    action === "archive"
      ? { status: "ARCHIVED", archivedAt: new Date() }
      : action === "reopen"
        ? { status: g.status === "ARCHIVED" ? "FORMING" : g.status, archivedAt: null }
        : action === "suspend"
          ? { suspendedAt: new Date(), suspendedReason: reason?.slice(0, 500) || null }
          : { suspendedAt: null, suspendedReason: null };
  await db.researchGroup.update({ where: { id: groupId }, data });
  // A group that is archived or suspended has no meeting in progress.
  if (action === "archive" || action === "suspend") await db.groupMeeting.updateMany({ where: { groupId, endedAt: null }, data: { endedAt: new Date() } });
  if (action === "reopen") {
    const outcome = await withGroupLock(groupId, async (tx) => {
      const members = await tx.groupMembership.count({ where: { groupId, status: "ACTIVE" } });
      if (members === 0) {
        // Nobody is in the group: it stays open and marked "looked after by the organization",
        // so that someone can join. The first eligible person who joins becomes its coordinator.
        await tx.researchGroup.update({ where: { id: groupId }, data: { adminManaged: true } });
        return null;
      }
      return ensureCoordinator(tx, groupId);
    });
    if (outcome) await announceSuccession(groupId, outcome, "vacant");
  }
  if (action === "suspend") await publishRealtime(db, { t: "group.access_revoked", groupId });
  await audit(adminId, `group.${action}`, "ResearchGroup", groupId, reason ? { reason: reason.slice(0, 200) } : undefined);
  return { ok: true as const };
}

export async function adminAssignCoordinator(adminId: string, groupId: string, userId: string) {
  const done = await withGroupLock(groupId, async (tx) => {
    const m = await tx.groupMembership.findFirst({ where: { groupId, userId, status: "ACTIVE", user: ACTIVE_MEMBER } });
    if (!m) return null;
    await tx.groupMembership.updateMany({ where: { groupId, role: "COORDINATOR" }, data: { role: "MEMBER" } });
    await tx.groupMembership.update({ where: { id: m.id }, data: { role: "COORDINATOR" } });
    await tx.researchGroup.update({ where: { id: groupId }, data: { adminManaged: false } });
    return { line: await writeSystemLine(tx, groupId, `${await nameInChat(tx, userId)} is now the coordinator (assigned by the organization)`) };
  });
  if (!done) return { ok: false as const, error: "The new coordinator must be an active member of the group who currently has community access." };
  await publishLines([done.line]);
  const g = await db.researchGroup.findUniqueOrThrow({ where: { id: groupId }, select: { slug: true, name: true } });
  await notify([userId], { type: "COORDINATOR_ASSIGNED", title: `You are now the coordinator of “${g.name}”`, body: "The organization assigned you this role.", link: `/community/groups/${g.slug}` });
  await audit(adminId, "group.coordinator_assigned", "ResearchGroup", groupId, { userId });
  return { ok: true as const };
}

/**
 * Explicit administrative approval: creates a linked Project in PLANNING.
 * This does NOT start commercial work; contracts, compensation terms and
 * legal requirements must be handled before any project becomes ACTIVE.
 */
export async function approveGroupForProject(adminId: string, groupId: string) {
  const g = await db.researchGroup.findUnique({ where: { id: groupId }, include: { project: true } });
  if (!g) return { ok: false as const, error: "Group not found." };
  if (g.project) return { ok: false as const, error: "A project already exists for this group." };
  if (g.status !== "READY_FOR_REVIEW") return { ok: false as const, error: "Only groups marked “Ready for review” can be approved." };
  const { uniqueSlug } = await import("../admin/projects");
  const project = await db.$transaction(async (tx) => {
    const p = await tx.project.create({
      data: {
        title: g.name,
        slug: await uniqueSlug(tx, g.name),
        summary: g.purpose ?? g.name,
        description: g.description,
        status: "PLANNING",
        researchGroupId: g.id,
      },
    });
    await tx.researchGroup.update({ where: { id: g.id }, data: { status: "APPROVED_FOR_PROJECT", approvedAt: new Date(), approvedById: adminId } });
    return p;
  });
  await audit(adminId, "group.approved_for_project", "ResearchGroup", g.id, { projectId: project.id });
  await notify(await activeMemberIds(g.id), {
    type: "GROUP_STATUS",
    title: `“${g.name}” was approved for project planning`,
    body: "The organization will contact members about written agreements and compensation terms before any paid work begins.",
    link: `/community/groups/${g.slug}`,
  });
  return { ok: true as const, projectId: project.id };
}
