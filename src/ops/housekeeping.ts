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

export async function runHousekeeping(db: PrismaClient, opts: { storageDir: string; now?: number }): Promise<{ unsentAttachments: number }> {
  return { unsentAttachments: await purgeUnsentAttachments(db, opts.storageDir, opts.now) };
}
