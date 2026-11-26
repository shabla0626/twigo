import "server-only";
import type { ReportReason, ReportTarget } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { recountComments } from "./comments";
import { publishRealtime } from "@/lib/realtime-events";
import { chatBoundary } from "@/realtime/chat-service";
import { rateLimit } from "@/lib/rate-limit";
import { groupAccess } from "./access";

/**
 * Files a report. A text snapshot of the reported content is stored so that
 * administrators can review it. This snapshot is the ONLY way administrators
 * see private group chat content; there is no other access path.
 */
export async function fileReport(reporterId: string, input: { targetType: ReportTarget; targetId: string; reason: ReportReason; details: string | null }) {
  if (!rateLimit(`report:${reporterId}`, 20, 24 * 3600_000).ok) return { ok: false as const, error: "Too many reports today. Please contact the administrators directly." };
  const snap = await snapshot(reporterId, input.targetType, input.targetId);
  if (!snap) return { ok: false as const, error: "That content is not available to you." };
  // Worked out here from the database, never taken from the form: whether the reporter is an active
  // member of the group the content belongs to. Only such a report can lead to an investigation of
  // that group's private information (src/server/admin/group-access.ts).
  const reporterGroupMember = snap.groupId ? Boolean((await groupAccess(snap.groupId, reporterId))?.isMember) : false;
  try {
    const r = await db.contentReport.create({
      data: { reporterId, targetType: input.targetType, targetId: input.targetId, groupId: snap.groupId, reporterGroupMember, reason: input.reason, details: input.details, snapshot: snap.text.slice(0, 10_000) },
    });
    await audit(reporterId, "report.filed", "ContentReport", r.id, { targetType: input.targetType, groupId: snap.groupId, reporterGroupMember });
  } catch (err) {
    if ((err as { code?: string }).code !== "P2002") throw err;
    return { ok: true as const, message: "You already reported this. The moderators will review it." };
  }
  return { ok: true as const, message: "Thank you. The report was sent to the moderators." };
}

/** Returns a snapshot only if the reporter can actually see the content. */
async function snapshot(viewerId: string, type: ReportTarget, id: string): Promise<{ text: string; groupId: string | null } | null> {
  switch (type) {
    case "IDEA": {
      const i = await db.businessIdea.findUnique({ where: { id } });
      return i && i.status !== "REMOVED" ? { text: `${i.title}\n\n${i.summary}\n\n${i.description ?? ""}`, groupId: null } : null;
    }
    case "COMMENT": {
      const c = await db.comment.findUnique({ where: { id }, include: { discussion: { select: { groupId: true } } } });
      return c && !c.deletedAt && !c.removedAt ? { text: c.body, groupId: c.discussion?.groupId ?? null } : null;
    }
    case "DISCUSSION": {
      const d = await db.groupDiscussion.findUnique({ where: { id } });
      return d && !d.deletedAt && !d.removedAt ? { text: `${d.title}\n\n${d.body}`, groupId: d.groupId } : null;
    }
    case "MESSAGE": {
      const m = await db.chatMessage.findUnique({ where: { id }, include: { channel: { select: { groupId: true } } } });
      if (!m || m.deletedAt || m.kind !== "USER") return null;
      const a = await groupAccess(m.channel.groupId, viewerId);
      if (!a?.isMember) return null;
      const viewer = await db.user.findUnique({ where: { id: viewerId }, select: { role: true } });
      const from = viewer ? chatBoundary(viewer.role, a.membership!.joinedAt) : null;
      if (from && m.createdAt < from) return null;
      return { text: m.body, groupId: m.channel.groupId };
    }
    case "GROUP": {
      const g = await db.researchGroup.findUnique({ where: { id } });
      return g ? { text: `${g.name}\n\n${g.purpose ?? ""}`, groupId: g.id } : null;
    }
    case "USER": {
      const p = await db.memberProfile.findUnique({ where: { userId: id } });
      return p ? { text: `${p.displayName}\n${p.headline ?? ""}\n\n${p.intro ?? ""}`, groupId: null } : null;
    }
    case "FIELD_POST": {
      const post = await db.fieldPost.findUnique({ where: { id } });
      return post && !post.removedAt ? { text: `${post.title}\n\n${post.body}\n\n${post.links.join("\n")}`, groupId: null } : null;
    }
    case "ARTICLE": {
      const article = await db.boardArticle.findUnique({ where: { id } });
      return article && !article.removedAt ? { text: `${article.title}\n\n${article.body}`, groupId: null } : null;
    }
    case "PROJECT_BROADCAST": {
      const post = await db.projectBroadcast.findUnique({ where: { id } });
      return post && !post.removedAt ? { text: `${post.title}\n\n${post.body}`, groupId: post.groupId } : null;
    }
    case "CULTURAL_WORK": {
      const work = await db.culturalWork.findUnique({ where: { id } });
      return work && !work.removedAt ? { text: `${work.title}\n\n${work.body}`, groupId: null } : null;
    }
  }
}

/**
 * The only way an administrator ever sees the text of a private chat message
 * is the copy a group member attached to a report. Looking at such reports is
 * itself recorded (at most once an hour per administrator, to keep the audit
 * log readable).
 */
export async function recordPrivateReportView(adminId: string, reports: { targetType: ReportTarget }[]) {
  const count = reports.filter((r) => r.targetType === "MESSAGE").length;
  if (!count) return;
  const recent = await db.auditLog.findFirst({
    where: { actorId: adminId, action: "moderation.private_reports_viewed", createdAt: { gt: new Date(Date.now() - 60 * 60_000) } },
    select: { id: true },
  });
  if (!recent) await audit(adminId, "moderation.private_reports_viewed", "ContentReport", null, { reportedChatMessages: count });
}

export async function listReports(status: "OPEN" | "ACTIONED" | "DISMISSED" = "OPEN") {
  return db.contentReport.findMany({
    where: { status },
    orderBy: { createdAt: status === "OPEN" ? "asc" : "desc" },
    take: 200,
    include: { reporter: { select: { id: true, email: true, profile: { select: { displayName: true } } } }, resolvedBy: { select: { name: true } } },
  });
}

/** Moderator action on reported content (audited). */
export async function moderate(adminId: string, reportId: string, action: "remove" | "dismiss" | "suspend_author", note: string) {
  const r = await db.contentReport.findUnique({ where: { id: reportId } });
  if (!r || r.status !== "OPEN") return { ok: false as const, error: "Report not found or already handled." };
  const now = new Date();
  let authorId: string | null = null;
  if (action !== "dismiss") {
    switch (r.targetType) {
      case "IDEA":
        authorId = (await db.businessIdea.update({ where: { id: r.targetId }, data: { status: "REMOVED", removedAt: now, removedReason: note.slice(0, 300) } })).authorId;
        break;
      case "COMMENT": {
        const updated = await db.$transaction(async (tx) => {
          const c = await tx.comment.update({ where: { id: r.targetId }, data: { removedAt: now } });
          await recountComments(tx, c);
          return c;
        });
        authorId = updated.authorId;
        if (updated.articleId) await publishRealtime(db, { t: "board.updated", articleId: updated.articleId });
        break;
      }
      case "DISCUSSION":
        authorId = (await db.groupDiscussion.update({ where: { id: r.targetId }, data: { removedAt: now } })).authorId;
        break;
      case "MESSAGE":
        authorId = (await db.chatMessage.update({ where: { id: r.targetId }, data: { deletedAt: now } })).authorId;
        // A removed message takes its attachments with it, and open chats show the removal at once.
        await db.storedFile.updateMany({ where: { messageId: r.targetId, deletedAt: null }, data: { deletedAt: now } });
        await publishRealtime(db, { t: "chat.message_changed", messageId: r.targetId });
        break;
      case "GROUP":
        await db.researchGroup.update({ where: { id: r.targetId }, data: { suspendedAt: now, suspendedReason: note.slice(0, 300) } });
        break;
      case "USER":
        authorId = r.targetId;
        break;
      case "FIELD_POST":
        authorId = (await db.fieldPost.update({ where: { id: r.targetId }, data: { removedAt: now, removedReason: note.slice(0, 300) } })).authorId;
        break;
      case "ARTICLE":
        authorId = (await db.boardArticle.update({ where: { id: r.targetId }, data: { removedAt: now, removedReason: note.slice(0, 300) } })).authorId;
        await publishRealtime(db, { t: "board.updated", articleId: r.targetId });
        break;
      case "PROJECT_BROADCAST":
        authorId = (await db.projectBroadcast.update({ where: { id: r.targetId }, data: { removedAt: now, removedReason: note.slice(0, 300) } })).authorId;
        break;
      case "CULTURAL_WORK":
        authorId = (await db.culturalWork.update({ where: { id: r.targetId }, data: { removedAt: now, removedReason: note.slice(0, 300) } })).authorId;
        break;
    }
  }
  await db.contentReport.updateMany({
    where: { targetType: r.targetType, targetId: r.targetId, status: "OPEN" },
    data: { status: action === "dismiss" ? "DISMISSED" : "ACTIONED", resolvedById: adminId, resolvedAt: now, resolution: `${action}: ${note}`.slice(0, 1000) },
  });
  await audit(adminId, `moderation.${action}`, r.targetType, r.targetId, { reportId, reason: r.reason });
  if (action === "suspend_author" && authorId) {
    const { suspendUser } = await import("../accounts");
    await suspendUser(adminId, authorId, `Moderation: ${note}`);
  }
  return { ok: true as const };
}
