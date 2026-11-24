import "server-only";
import type { GroupAccessScope, Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { notify } from "@/server/community/notifications";

/**
 * Temporary, owner-approved access of an administrator to ONE project group's private information.
 *
 * Group information is private to the group's members. Owner and administrator accounts are never
 * group members (src/lib/auth/member-where.ts, GROUP_PARTICIPANT), so they have no standing access.
 * The only exception is an investigation, and only when ALL of these hold:
 *   1. a member of that group reported something about it (ContentReport.reporterGroupMember);
 *   2. an administrator asked for access, with a reason, the information needed and a duration;
 *   3. the OWNER approved it, choosing the information and the start and end time (at most 30 days);
 *   4. it is used by that administrator, for that group, for that information, within that time.
 * Every check re-reads the request row; nothing is cached. The view is read-only, in the admin area;
 * administrators never use the group's live chat (src/realtime/chat-service.ts). Every request,
 * decision, view, refused attempt, revocation and expiry is written to the audit log. Access-view
 * entries are written BEFORE the information is returned: if the entry cannot be written, nothing is shown.
 */

export const SCOPE_LABELS: Record<GroupAccessScope, string> = {
  CHAT: "Group chat history (with attachments)",
  RESEARCH: "Research notes and links",
  FILES: "Group files",
  TASKS_DECISIONS: "Tasks and recorded decisions",
  PROJECTS: "Group projects and their agreements",
};
export const SCOPES = Object.keys(SCOPE_LABELS) as GroupAccessScope[];
export const STATUS_TEXT = { PENDING: "Waiting for the owner", APPROVED: "Approved", REJECTED: "Rejected", REVOKED: "Ended by the owner", EXPIRED: "Expired", CANCELLED: "Cancelled" } as const;

/** The longest access the owner can approve in one decision. A longer investigation needs a new approval. */
export const MAX_ACCESS_DAYS = 30;
const MAX_REQUEST_HOURS = MAX_ACCESS_DAYS * 24;

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/** Written in the same way for every privileged event; fails loudly (unlike the best-effort audit()). */
async function record(client: Prisma.TransactionClient | typeof db, actorId: string | null, action: string, requestId: string, metadata: Prisma.InputJsonValue) {
  await client.auditLog.create({ data: { actorId, action: `group_access.${action}`, entityType: "GroupAccessRequest", entityId: requestId, metadata } });
}

async function ownerIds() {
  return (await db.user.findMany({ where: { role: "OWNER", status: "ACTIVE" }, select: { id: true } })).map((u) => u.id);
}

/** Reports that can start an investigation: filed by a member of the group about that group's content, not dismissed. */
export async function eligibleReport(reportId: string) {
  const r = await db.contentReport.findUnique({ where: { id: reportId }, select: { id: true, groupId: true, reporterGroupMember: true, status: true, reason: true, targetType: true, createdAt: true } });
  if (!r) return { ok: false as const, error: "Report not found." };
  if (!r.groupId) return { ok: false as const, error: "This report is not about a project group." };
  if (!r.reporterGroupMember) return { ok: false as const, error: "This report was not filed by a member of the group. Only a report by one of the group's own members can start an investigation." };
  if (r.status === "DISMISSED") return { ok: false as const, error: "This report was dismissed." };
  return { ok: true as const, report: r as typeof r & { groupId: string } };
}

const requestSchema = z.object({
  reportId: z.string().min(1),
  reason: z.string().trim().min(20, "Explain why access is needed (at least 20 characters).").max(2000),
  scope: z.array(z.enum(["CHAT", "RESEARCH", "FILES", "TASKS_DECISIONS", "PROJECTS"])).min(1, "Choose the information you need."),
  hours: z.coerce.number().int().min(1).max(MAX_REQUEST_HOURS, `At most ${MAX_ACCESS_DAYS} days.`),
});

/** An administrator asks the owner for access. The group is taken from the report, never from the form. */
export async function requestGroupAccess(adminId: string, raw: unknown): Promise<Result<{ id: string }>> {
  const p = requestSchema.safeParse(raw);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Some values are not valid." };
  const rep = await eligibleReport(p.data.reportId);
  if (!rep.ok) return rep;
  const open = await db.groupAccessRequest.findFirst({ where: { requestedById: adminId, groupId: rep.report.groupId, status: { in: ["PENDING", "APPROVED"] }, OR: [{ status: "PENDING" }, { expiresAt: { gt: new Date() }, revokedAt: null }] }, select: { id: true } });
  if (open) return { ok: false, error: "You already have a pending or active request for this group." };
  const r = await db.$transaction(async (tx) => {
    const created = await tx.groupAccessRequest.create({
      data: { reportId: rep.report.id, groupId: rep.report.groupId, requestedById: adminId, reason: p.data.reason, requestedScope: [...new Set(p.data.scope)], requestedHours: p.data.hours },
    });
    await record(tx, adminId, "requested", created.id, { reportId: rep.report.id, groupId: rep.report.groupId, scope: created.requestedScope, hours: created.requestedHours });
    return created;
  });
  await notify(await ownerIds(), { type: "ADMIN_MESSAGE", title: "An administrator asks for temporary access to a group's private information", body: "Approve or reject it in Admin, Group access.", link: `/admin/group-access/${r.id}` }, { exclude: adminId });
  return { ok: true, id: r.id };
}

const decisionSchema = z.object({
  id: z.string().min(1),
  decision: z.enum(["approve", "reject"]),
  scope: z.array(z.enum(["CHAT", "RESEARCH", "FILES", "TASKS_DECISIONS", "PROJECTS"])).default([]),
  startsAt: z.coerce.date().optional(),
  expiresAt: z.coerce.date().optional(),
  note: z.string().trim().max(2000).default(""),
});

/** The owner decides. Approval names the information and an explicit start and end; there is no default end. */
export async function decideGroupAccess(ownerId: string, raw: unknown, now = new Date()): Promise<Result> {
  const owner = await db.user.findUnique({ where: { id: ownerId }, select: { role: true } });
  if (owner?.role !== "OWNER") return { ok: false, error: "Only the owner can decide." };
  const p = decisionSchema.safeParse(raw);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Some values are not valid." };
  const d = p.data;
  return db.$transaction(async (tx) => {
    const r = await tx.groupAccessRequest.findUnique({ where: { id: d.id } });
    if (!r) return { ok: false as const, error: "Request not found." };
    if (r.status !== "PENDING") return { ok: false as const, error: "This request was already decided." };
    if (d.decision === "reject") {
      if (d.note.length < 5) return { ok: false as const, error: "Say briefly why the request is rejected." };
      await tx.groupAccessRequest.update({ where: { id: r.id }, data: { status: "REJECTED", decidedById: ownerId, decidedAt: now, decisionNote: d.note } });
      await record(tx, ownerId, "rejected", r.id, { note: d.note });
      return { ok: true as const };
    }
    const scope = [...new Set(d.scope)];
    if (!scope.length) return { ok: false as const, error: "Choose the information the administrator may see." };
    if (scope.some((s) => !r.requestedScope.includes(s))) return { ok: false as const, error: "Approve only information the administrator asked for (a wider need is a new request)." };
    if (!d.startsAt || !d.expiresAt) return { ok: false as const, error: "Set both the start and the end of the access." };
    if (d.startsAt.getTime() < now.getTime() - 5 * 60_000) return { ok: false as const, error: "The start cannot be in the past." };
    if (d.expiresAt <= d.startsAt) return { ok: false as const, error: "The end must be after the start." };
    if (d.expiresAt.getTime() - d.startsAt.getTime() > MAX_ACCESS_DAYS * 86_400_000) return { ok: false as const, error: `Access can last at most ${MAX_ACCESS_DAYS} days. A longer investigation needs a new approval.` };
    const rep = await tx.contentReport.findUnique({ where: { id: r.reportId }, select: { reporterGroupMember: true, groupId: true, status: true } });
    if (!rep?.reporterGroupMember || rep.groupId !== r.groupId || rep.status === "DISMISSED") return { ok: false as const, error: "The report no longer allows an investigation (dismissed or not from a group member)." };
    await tx.groupAccessRequest.update({ where: { id: r.id }, data: { status: "APPROVED", grantedScope: scope, startsAt: d.startsAt, expiresAt: d.expiresAt, decidedById: ownerId, decidedAt: now, decisionNote: d.note || null } });
    await record(tx, ownerId, "approved", r.id, { adminId: r.requestedById, groupId: r.groupId, reportId: r.reportId, scope, startsAt: d.startsAt.toISOString(), expiresAt: d.expiresAt.toISOString() });
    return { ok: true as const };
  }).then(async (res) => {
    if (res.ok) {
      const r = await db.groupAccessRequest.findUniqueOrThrow({ where: { id: d.id }, select: { requestedById: true, status: true } });
      if (r.requestedById)
        await notify([r.requestedById], { type: "ADMIN_MESSAGE", title: r.status === "APPROVED" ? "Your request for group access was approved" : "Your request for group access was rejected", body: "Details in Admin, Group access.", link: `/admin/group-access/${d.id}` });
    }
    return res;
  });
}

/** The owner ends an approved access early. */
export async function revokeGroupAccess(ownerId: string, id: string, now = new Date()): Promise<Result> {
  const owner = await db.user.findUnique({ where: { id: ownerId }, select: { role: true } });
  if (owner?.role !== "OWNER") return { ok: false, error: "Only the owner can end access." };
  return db.$transaction(async (tx) => {
    const r = await tx.groupAccessRequest.findUnique({ where: { id } });
    if (!r || r.status !== "APPROVED") return { ok: false as const, error: "This access is not active." };
    await tx.groupAccessRequest.update({ where: { id }, data: { status: "REVOKED", revokedAt: now, revokedById: ownerId, endedAt: now } });
    await record(tx, ownerId, "revoked", id, { adminId: r.requestedById, groupId: r.groupId });
    return { ok: true as const };
  });
}

/** Is this request access usable right now by this administrator for this information? (re-read every time) */
export function isActive(r: { status: string; startsAt: Date | null; expiresAt: Date | null; revokedAt: Date | null }, now = new Date()) {
  return r.status === "APPROVED" && !r.revokedAt && !!r.startsAt && !!r.expiresAt && r.startsAt <= now && now < r.expiresAt;
}

/**
 * The single gate for every privileged read. Returns the request when `adminId` may read `scope` of
 * `groupId` now; otherwise records the refused attempt and returns null. An "access.viewed" entry is
 * written before anything is returned.
 */
export async function authorizeGroupRead(adminId: string, input: { requestId?: string; groupId: string; scope: GroupAccessScope; what: string; now?: Date }) {
  const now = input.now ?? new Date();
  const candidates = await db.groupAccessRequest.findMany({
    where: { requestedById: adminId, groupId: input.groupId, ...(input.requestId ? { id: input.requestId } : {}) },
    orderBy: { createdAt: "desc" },
  });
  const grant = candidates.find((r) => isActive(r, now) && r.grantedScope.includes(input.scope));
  const ref = grant?.id ?? candidates[0]?.id ?? input.requestId ?? null;
  if (!grant) {
    if (ref) await record(db, adminId, "denied", ref, { groupId: input.groupId, scope: input.scope, what: input.what, reason: candidates.length ? "not active or not in scope" : "no request" });
    else await db.auditLog.create({ data: { actorId: adminId, action: "group_access.denied", entityType: "ResearchGroup", entityId: input.groupId, metadata: { scope: input.scope, what: input.what, reason: "no request" } } });
    return null;
  }
  await record(db, adminId, "viewed", grant.id, { groupId: input.groupId, scope: input.scope, what: input.what });
  return grant;
}

/** Messages per page in the investigation chat view. */
export const CHAT_PAGE_SIZE = 100;
export type ChatPageQuery = { before?: string; after?: string; from?: Date; to?: Date };

/** The information an approved investigation may read, section by section (read-only). The chat is paged. */
export async function investigationData(adminId: string, requestId: string, scope: GroupAccessScope, page: ChatPageQuery = {}) {
  const r = await db.groupAccessRequest.findUnique({ where: { id: requestId }, select: { groupId: true } });
  if (!r) return null;
  const what = scope === "CHAT" ? `investigation view: CHAT page${page.before ? ` before ${page.before}` : page.after ? ` after ${page.after}` : " (latest)"}${page.from || page.to ? ` ${page.from?.toISOString() ?? "…"}–${page.to?.toISOString() ?? "…"}` : ""}` : `investigation view: ${scope}`;
  const grant = await authorizeGroupRead(adminId, { requestId, groupId: r.groupId, scope, what });
  if (!grant) return null;
  const g = r.groupId;
  switch (scope) {
    case "CHAT":
      return { scope, ...(await chatPage(g, page)) };
    case "RESEARCH":
      return {
        scope,
        notes: await db.researchNote.findMany({ where: { groupId: g }, orderBy: { updatedAt: "desc" }, select: { id: true, section: true, title: true, body: true, updatedAt: true } }),
        links: await db.groupLink.findMany({ where: { groupId: g }, orderBy: { createdAt: "desc" }, select: { id: true, title: true, url: true, createdAt: true } }),
      };
    case "FILES":
      return { scope, files: await db.storedFile.findMany({ where: { groupId: g, scope: "GROUP_FILE", deletedAt: null }, orderBy: { createdAt: "desc" }, select: { id: true, originalName: true, size: true, createdAt: true } }) };
    case "TASKS_DECISIONS":
      return {
        scope,
        tasks: await db.researchTask.findMany({ where: { groupId: g }, orderBy: { createdAt: "desc" }, select: { id: true, title: true, status: true, createdAt: true } }),
        decisions: await db.groupDecision.findMany({ where: { groupId: g }, orderBy: { createdAt: "desc" }, select: { id: true, title: true, decision: true, rationale: true, decidedAt: true } }),
      };
    case "PROJECTS":
      return {
        scope,
        projects: await db.groupProject.findMany({
          where: { groupId: g },
          orderBy: { createdAt: "desc" },
          select: { id: true, name: true, objective: true, status: true, versions: { orderBy: { version: "desc" }, select: { id: true, version: true, status: true, content: true, contentHash: true, participants: { select: { displayName: true, acceptedAt: true, declinedAt: true, withdrewAt: true } } } } },
        }),
      };
  }
}

/** For the admin pages: requests the viewer may see (an administrator: their own; the owner: all). */
export async function listGroupAccess(viewer: { id: string; role: string }) {
  return db.groupAccessRequest.findMany({
    where: viewer.role === "OWNER" ? {} : { requestedById: viewer.id },
    orderBy: [{ createdAt: "desc" }],
    take: 200,
    include: { group: { select: { name: true } }, requestedBy: { select: { name: true } }, decidedBy: { select: { name: true } }, report: { select: { reason: true, targetType: true, createdAt: true } } },
  });
}

/** The full history of one request (owner: any; administrator: own). */
export async function groupAccessHistory(requestId: string) {
  return db.auditLog.findMany({ where: { entityType: "GroupAccessRequest", entityId: requestId }, orderBy: { createdAt: "asc" }, include: { actor: { select: { name: true } } } });
}

const chatSelect = {
  id: true,
  kind: true,
  body: true,
  createdAt: true,
  editedAt: true,
  deletedAt: true,
  author: { select: { profile: { select: { displayName: true } } } },
  attachments: { where: { deletedAt: null }, select: { id: true, originalName: true } },
} satisfies Prisma.ChatMessageSelect;

/**
 * One page of a group's chat, oldest first within the page. Without a cursor: the latest page. `before`:
 * the page just before that message; `after`: the page just after it. Ties on the time are broken by id,
 * so no message is skipped or repeated. `from`/`to` limit the range (inclusive start, exclusive end).
 */
async function chatPage(groupId: string, q: ChatPageQuery) {
  const range: Prisma.ChatMessageWhereInput = { channel: { groupId }, ...(q.from || q.to ? { createdAt: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lt: q.to } : {}) } } : {}) };
  const cursorId = q.before ?? q.after;
  const cursor = cursorId ? await db.chatMessage.findFirst({ where: { id: cursorId, channel: { groupId } }, select: { id: true, createdAt: true } }) : null;
  if (cursorId && !cursor) return { messages: [], hasOlder: false, hasNewer: false };
  const olderThan = (c: { id: string; createdAt: Date }): Prisma.ChatMessageWhereInput => ({ OR: [{ createdAt: { lt: c.createdAt } }, { createdAt: c.createdAt, id: { lt: c.id } }] });
  const newerThan = (c: { id: string; createdAt: Date }): Prisma.ChatMessageWhereInput => ({ OR: [{ createdAt: { gt: c.createdAt } }, { createdAt: c.createdAt, id: { gt: c.id } }] });
  let messages;
  if (q.after && cursor) {
    messages = await db.chatMessage.findMany({ where: { AND: [range, newerThan(cursor)] }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: CHAT_PAGE_SIZE, select: chatSelect });
  } else {
    const desc = await db.chatMessage.findMany({ where: cursor ? { AND: [range, olderThan(cursor)] } : range, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: CHAT_PAGE_SIZE, select: chatSelect });
    messages = desc.reverse();
  }
  const first = messages[0];
  const last = messages[messages.length - 1];
  const [hasOlder, hasNewer] = first && last ? await Promise.all([db.chatMessage.count({ where: { AND: [range, olderThan(first)] } }).then((n) => n > 0), db.chatMessage.count({ where: { AND: [range, newerThan(last)] } }).then((n) => n > 0)]) : [false, false];
  return { messages, hasOlder, hasNewer };
}

