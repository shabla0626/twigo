// Data-retention enforcement with per-category rules (configured by the
// OWNER in /admin/settings). Every run is recorded in JobRun; real runs also
// write an audit entry. Use dryRun to see what WOULD be deleted.
//
// Never touched by this job: compensation agreements, projects and their
// assignments, active members and their profiles, audit logs.
import type { PrismaClient } from "@prisma/client";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { readAllSettings } from "../config/org-settings";

export type RetentionCategory = {
  key: string;
  label: string;
  days: number | null;
  count: number;
};

const DAY = 86_400_000;
const cutoff = (days: number, now: number) => new Date(now - days * DAY);

/**
 * `dryRun` only counts what WOULD be removed. A dry run changes nothing and leaves no record
 * (the Privacy page shows one on every visit), so `jobRunId` is null for it.
 */
export async function runRetention(db: PrismaClient, opts: { dryRun: boolean; storageDir: string; now?: number }): Promise<{ categories: RetentionCategory[]; jobRunId: string | null }> {
  const now = opts.now ?? Date.now();
  const run = opts.dryRun ? null : await db.jobRun.create({ data: { job: "retention", dryRun: false } });
  try {
    const s = await readAllSettings(db);
    const cats: RetentionCategory[] = [];
    const add = (key: string, label: string, days: number | null, count: number) => cats.push({ key, label, days, count });

    // 1. Declined applicants (never people who became participants).
    const dDays = s["retention.declinedApplicationsDays"];
    const declined = dDays
      ? await db.applicant.findMany({
          where: { participant: null, applications: { every: { status: "DECLINED", updatedAt: { lt: cutoff(dDays, now) } } }, NOT: { applications: { none: {} } } },
          select: { id: true },
        })
      : [];
    add("applications", "Declined applications", dDays, declined.length);

    // 2. Closed inquiries.
    const iDays = s["retention.closedInquiriesDays"];
    const inquiryWhere = iDays ? { status: "CLOSED" as const, updatedAt: { lt: cutoff(iDays, now) } } : null;
    add("inquiries", "Closed contact inquiries", iDays, inquiryWhere ? await db.contactInquiry.count({ where: inquiryWhere }) : 0);

    // 3. Content deleted by authors or removed by moderation.
    const cDays = s["retention.deletedContentDays"];
    const cCut = cDays ? cutoff(cDays, now) : null;
    const commentWhere = cCut ? { OR: [{ deletedAt: { lt: cCut } }, { removedAt: { lt: cCut } }] } : null;
    const discussionWhere = commentWhere;
    const messageWhere = cCut ? { deletedAt: { lt: cCut } } : null;
    const ideaWhere = cCut ? { status: "REMOVED" as const, removedAt: { lt: cCut } } : null;
    const deletedCount =
      (commentWhere ? await db.comment.count({ where: { ...commentWhere, replies: { none: {} } } }) : 0) +
      (discussionWhere ? await db.groupDiscussion.count({ where: discussionWhere }) : 0) +
      (messageWhere ? await db.chatMessage.count({ where: messageWhere }) : 0) +
      (ideaWhere ? await db.businessIdea.count({ where: { ...ideaWhere, group: null } }) : 0);
    add("deleted_content", "Deleted or removed posts, comments and messages", cDays, deletedCount);

    // 4. Old chat history (optional; default keep).
    const chDays = s["retention.chatMessagesDays"];
    const chatWhere = chDays ? { createdAt: { lt: cutoff(chDays, now) } } : null;
    add("chat", "Group chat messages", chDays, chatWhere ? await db.chatMessage.count({ where: chatWhere }) : 0);

    // 5. Files of archived groups.
    const fDays = s["retention.archivedGroupFilesDays"];
    const fileWhere = fDays ? { group: { status: "ARCHIVED" as const, archivedAt: { lt: cutoff(fDays, now) } } } : null;
    const files = fileWhere ? await db.storedFile.findMany({ where: fileWhere, select: { id: true, storageKey: true } }) : [];
    // Files already soft-deleted by users are purged with the deleted-content period.
    const softFiles = cCut ? await db.storedFile.findMany({ where: { deletedAt: { lt: cCut } }, select: { id: true, storageKey: true } }) : [];
    add("files", "Files of archived groups and deleted files", fDays, files.length + softFiles.length);

    // 6. Read notifications.
    const nDays = s["retention.notificationsDays"];
    const notifWhere = nDays ? { readAt: { lt: cutoff(nDays, now) } } : null;
    add("notifications", "Read notifications", nDays, notifWhere ? await db.notification.count({ where: notifWhere }) : 0);

    // 7. Meeting metadata.
    const mDays = s["retention.meetingMetadataDays"];
    const meetWhere = mDays ? { startedAt: { lt: cutoff(mDays, now) }, endedAt: { not: null } } : null;
    add("meetings", "Meeting records (metadata only)", mDays, meetWhere ? await db.groupMeeting.count({ where: meetWhere }) : 0);

    // 8. Email delivery log.
    const eDays = s["retention.emailLogDays"];
    const emailWhere = eDays ? { createdAt: { lt: cutoff(eDays, now) } } : null;
    add("email_log", "Email delivery records", eDays, emailWhere ? await db.emailDelivery.count({ where: emailWhere }) : 0);

    // 9. Expired sessions and used/expired tokens.
    const sDays = s["retention.sessionsDays"];
    const sCut = sDays ? cutoff(sDays, now) : null;
    const sessionWhere = sCut ? { OR: [{ expiresAt: { lt: sCut } }, { revokedAt: { lt: sCut } }] } : null;
    const tokenWhere = sCut ? { OR: [{ expiresAt: { lt: sCut } }, { usedAt: { lt: sCut } }] } : null;
    add(
      "sessions",
      "Expired sessions and used tokens",
      sDays,
      (sessionWhere ? await db.session.count({ where: sessionWhere }) : 0) + (tokenWhere ? await db.accountToken.count({ where: tokenWhere }) : 0),
    );

    if (!opts.dryRun) {
      if (declined.length) await db.applicant.deleteMany({ where: { id: { in: declined.map((a) => a.id) } } });
      if (inquiryWhere) await db.contactInquiry.deleteMany({ where: inquiryWhere });
      if (commentWhere) {
        // Keep removed comments that still have replies (as "[removed]" placeholders); purge their text.
        await db.comment.updateMany({ where: { ...commentWhere, replies: { some: {} } }, data: { body: "" } });
        await db.comment.deleteMany({ where: { ...commentWhere, replies: { none: {} } } });
      }
      if (discussionWhere) await db.groupDiscussion.deleteMany({ where: discussionWhere });
      // Attachments go with their messages (the link is cleared when a message is deleted,
      // so they are collected first; otherwise they would stay behind, visible in the group's files).
      const doomed = [...(messageWhere ? [messageWhere] : []), ...(chatWhere ? [chatWhere] : [])];
      const orphaned = doomed.length ? await db.storedFile.findMany({ where: { message: { OR: doomed } }, select: { id: true, storageKey: true } }) : [];
      if (messageWhere) await db.chatMessage.deleteMany({ where: messageWhere });
      if (ideaWhere) await db.businessIdea.deleteMany({ where: { ...ideaWhere, group: null } });
      if (chatWhere) await db.chatMessage.deleteMany({ where: chatWhere });
      const gone = [...new Map([...files, ...softFiles, ...orphaned].map((f) => [f.id, f])).values()];
      for (const f of gone) {
        const p = path.resolve(opts.storageDir, f.storageKey);
        if (p.startsWith(path.resolve(opts.storageDir) + path.sep)) await unlink(p).catch(() => {});
      }
      if (gone.length) await db.storedFile.deleteMany({ where: { id: { in: gone.map((f) => f.id) } } });
      if (notifWhere) await db.notification.deleteMany({ where: notifWhere });
      if (meetWhere) await db.groupMeeting.deleteMany({ where: meetWhere });
      if (emailWhere) await db.emailDelivery.deleteMany({ where: emailWhere });
      if (sessionWhere) await db.session.deleteMany({ where: sessionWhere });
      if (tokenWhere) await db.accountToken.deleteMany({ where: tokenWhere });
      await db.auditLog.create({
        data: { action: "retention.purge", entityType: "System", metadata: Object.fromEntries(cats.map((c) => [c.key, c.count])) },
      });
    }
    if (run) await db.jobRun.update({ where: { id: run.id }, data: { finishedAt: new Date(), ok: true, summary: cats } });
    return { categories: cats, jobRunId: run?.id ?? null };
  } catch (err) {
    if (run) await db.jobRun.update({ where: { id: run.id }, data: { finishedAt: new Date(), ok: false, error: String(err).slice(0, 1000) } });
    throw err;
  }
}
