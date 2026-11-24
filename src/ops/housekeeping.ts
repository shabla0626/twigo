// Small hourly clean-up tasks (run by the scheduler). Each is safe to repeat.
import type { PrismaClient } from "@prisma/client";
import { unlink } from "node:fs/promises";
import path from "node:path";

const HOUR = 3600_000;

/** Files someone chose in the chat box but never sent are removed after this long. */
export const UNSENT_ATTACHMENT_HOURS = 24;

/**
 * A file is uploaded as soon as it is chosen in the chat box. If the message is
 * never sent, the file belongs to no message: it is not shown to the group
 * (see listGroupFiles) and is deleted here after a day.
 */
export async function purgeUnsentAttachments(db: PrismaClient, storageDir: string, now = Date.now()): Promise<number> {
  const stale = await db.storedFile.findMany({
    where: { scope: "CHAT_ATTACHMENT", messageId: null, deletedAt: null, createdAt: { lt: new Date(now - UNSENT_ATTACHMENT_HOURS * HOUR) } },
    select: { id: true, storageKey: true },
    take: 500,
  });
  const root = path.resolve(storageDir);
  for (const f of stale) {
    const p = path.resolve(root, f.storageKey);
    if (p.startsWith(root + path.sep)) await unlink(p).catch(() => {});
  }
  if (stale.length) await db.storedFile.deleteMany({ where: { id: { in: stale.map((f) => f.id) } } });
  return stale.length;
}

/** Same limit as MEETING_MAX_HOURS in src/server/community/meetings.ts (kept here so this file has no framework imports). */
const MEETING_MAX_HOURS = 4;

/** Meetings nobody ended are marked as ended once they are past the limit. */
export async function expireMeetings(db: PrismaClient, now = Date.now()): Promise<number> {
  // Times are stored as UTC without a zone, so the cut-off is computed here, not with the database's now().
  const cutoff = new Date(now - MEETING_MAX_HOURS * HOUR);
  return db.$executeRaw`UPDATE "GroupMeeting" SET "endedAt" = "startedAt" + make_interval(hours => ${MEETING_MAX_HOURS}::int) WHERE "endedAt" IS NULL AND "startedAt" < ${cutoff}`;
}

/**
 * Records the end of approved group-access investigations whose period is over (status EXPIRED, with
 * an audit entry). Access checks never depend on this: they compare the period with the clock on every
 * request (src/server/admin/group-access.ts), so access ends at the set time even if this has not run.
 */
export async function expireGroupAccess(db: PrismaClient, now = Date.now()): Promise<number> {
  const at = new Date(now);
  const due = await db.groupAccessRequest.findMany({ where: { status: "APPROVED", expiresAt: { lte: at } }, select: { id: true, requestedById: true, groupId: true, expiresAt: true } });
  for (const r of due) {
    await db.$transaction(async (tx) => {
      const n = await tx.groupAccessRequest.updateMany({ where: { id: r.id, status: "APPROVED" }, data: { status: "EXPIRED", endedAt: at } });
      if (n.count)
        await tx.auditLog.create({
          data: { actorId: null, action: "group_access.expired", entityType: "GroupAccessRequest", entityId: r.id, metadata: { adminId: r.requestedById, groupId: r.groupId, expiresAt: r.expiresAt?.toISOString() ?? null } },
        });
    });
  }
  return due.length;
}

export async function runHousekeeping(db: PrismaClient, opts: { storageDir: string; now?: number }): Promise<{ unsentAttachments: number; meetingsEnded: number; groupAccessExpired: number }> {
  return {
    unsentAttachments: await purgeUnsentAttachments(db, opts.storageDir, opts.now),
    meetingsEnded: await expireMeetings(db),
    groupAccessExpired: await expireGroupAccess(db, opts.now),
  };
}
