import "server-only";
import { Prisma, type NotificationType } from "@prisma/client";
import { db } from "@/lib/db";
import { siteUrl } from "@/lib/env";
import { deliverTemplate } from "@/lib/email";
import { ACTIVE_MEMBER } from "@/lib/auth/member-where";
import { logger } from "@/lib/logger";
import { publishRealtime } from "@/lib/realtime-events";

/** Notification emails that are still being sent in the background. */
const pendingEmails = new Set<Promise<unknown>>();

/** Resolves when every notification email started so far has finished (used by the tests). */
export async function notificationEmailsSettled(): Promise<void> {
  while (pendingEmails.size) await Promise.allSettled([...pendingEmails]);
}

export const NOTIFICATION_TYPES: Record<NotificationType, { label: string; emailDefault: boolean }> = {
  IDEA_COMMENT: { label: "Comments on my ideas", emailDefault: false },
  COMMENT_REPLY: { label: "Replies to my comments", emailDefault: false },
  IDEA_ENDORSED: { label: "Endorsements of my ideas", emailDefault: false },
  IDEA_GROUP_CREATED: { label: "My idea became a research group", emailDefault: true },
  GROUP_MEMBERSHIP: { label: "I was added to a group", emailDefault: true },
  GROUP_ANNOUNCEMENT: { label: "Group announcements", emailDefault: false },
  MEETING_STARTED: { label: "A group meeting started", emailDefault: false },
  GROUP_STATUS: { label: "Group status changes", emailDefault: false },
  GROUP_DECISION: { label: "Group decisions recorded", emailDefault: false },
  COORDINATOR_ASSIGNED: { label: "I became a group coordinator", emailDefault: true },
  DISCUSSION_REPLY: { label: "Replies in group discussions I started", emailDefault: false },
  ADMIN_MESSAGE: { label: "Messages from the organization", emailDefault: true },
  IDEA_CHANGED: { label: "Changes to ideas I support", emailDefault: true },
  PROJECT_AGREEMENT: { label: "Project agreements I take part in (new versions, acceptances)", emailDefault: true },
};

export type NotifyInput = {
  type: NotificationType;
  title: string;
  body?: string;
  /** Relative link inside the site, e.g. /community/ideas/abc */
  link?: string;
  /** Events with the same key coalesce into one unread notification (count increases). */
  dedupeKey?: string;
};

/**
 * Creates in-app notifications (respecting each member's preferences) and
 * sends email copies to members who enabled email for that type.
 *
 * Callers are responsible for only passing recipients who are allowed to see
 * the content (e.g. current group members for group notifications).
 */
export async function notify(userIds: string[], input: NotifyInput, opts: { exclude?: string; tx?: Prisma.TransactionClient } = {}) {
  const recipients = [...new Set(userIds)].filter((id) => id && id !== opts.exclude);
  if (!recipients.length) return;
  const client = opts.tx ?? db;
  const prefs = await client.notificationPreference.findMany({ where: { userId: { in: recipients }, type: input.type } });
  const prefMap = new Map(prefs.map((p) => [p.userId, p]));
  // Only people who can open the community right now are notified (a paused or removed member must not receive group activity).
  const active = await client.user.findMany({ where: { id: { in: recipients }, ...ACTIVE_MEMBER }, select: { id: true, email: true, name: true } });

  for (const u of active) {
    const p = prefMap.get(u.id);
    const inApp = p ? p.inApp : true;
    const email = p ? p.email : NOTIFICATION_TYPES[input.type].emailDefault;
    let isNew = true;
    if (inApp) {
      if (input.dedupeKey) {
        const existing = await client.notification.findUnique({ where: { userId_dedupeKey: { userId: u.id, dedupeKey: input.dedupeKey } } });
        if (existing && !existing.readAt) {
          await client.notification.update({ where: { id: existing.id }, data: { count: { increment: 1 }, title: input.title, body: input.body ?? null } });
          isNew = false;
        } else if (existing) {
          await client.notification.update({
            where: { id: existing.id },
            data: { count: 1, readAt: null, title: input.title, body: input.body ?? null, link: input.link ?? null, createdAt: new Date() },
          });
        } else {
          try {
            await client.notification.create({ data: { userId: u.id, type: input.type, title: input.title, body: input.body ?? null, link: input.link ?? null, dedupeKey: input.dedupeKey } });
          } catch (err) {
            // Two events for the same person and subject arrived at the same moment and the
            // other one created the row first: count this one onto it instead of failing.
            if ((err as { code?: string }).code !== "P2002") throw err;
            await client.notification.update({ where: { userId_dedupeKey: { userId: u.id, dedupeKey: input.dedupeKey } }, data: { count: { increment: 1 }, title: input.title, body: input.body ?? null } });
            isNew = false;
          }
        }
      } else {
        await client.notification.create({ data: { userId: u.id, type: input.type, title: input.title, body: input.body ?? null, link: input.link ?? null } });
      }
    }
    // Coalesced repeats never trigger another email.
    if (email && isNew) {
      const send = () =>
        deliverTemplate("community_notification", u.email, { name: u.name, title: input.title, body: input.body ?? "", link: siteUrl(input.link ?? "/community/notifications") }, { userId: u.id }).catch((err) =>
          logger.error("notification.email_failed", { err }),
        );
      // Outside a transaction send now; inside one, after commit is not observable here, so send best-effort.
      const sending = send();
      pendingEmails.add(sending);
      void sending.finally(() => pendingEmails.delete(sending));
    }
  }
  for (const u of active) await publishRealtime(db, { t: "notifications.changed", userId: u.id });
}

export async function unreadCount(userId: string): Promise<number> {
  return db.notification.count({ where: { userId, readAt: null } });
}

export async function listNotifications(userId: string, opts: { cursor?: string; unreadOnly?: boolean; take?: number } = {}) {
  const take = opts.take ?? 30;
  const rows = await db.notification.findMany({
    where: { userId, ...(opts.unreadOnly ? { readAt: null } : {}) },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: take + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  });
  return { items: rows.slice(0, take), nextCursor: rows.length > take ? rows[take - 1]!.id : null };
}

/**
 * Marks notifications as read WITHOUT changing their place in the list.
 *
 * The list is ordered by `updatedAt`, which is the time of the latest event (a repeated event
 * moves its notification back to the top). Reading is not an event, so it must not touch that
 * time: plain SQL is used because the ORM would refresh `updatedAt` on every update.
 */
export async function markRead(userId: string, ids: string[] | "all") {
  const now = new Date();
  if (ids === "all") {
    await db.$executeRaw`UPDATE "Notification" SET "readAt" = ${now} WHERE "userId" = ${userId} AND "readAt" IS NULL`;
  } else if (ids.length) {
    await db.$executeRaw`UPDATE "Notification" SET "readAt" = ${now} WHERE "userId" = ${userId} AND "readAt" IS NULL AND "id" IN (${Prisma.join(ids)})`;
  }
  await publishRealtime(db, { t: "notifications.changed", userId });
}

export async function getPreferences(userId: string) {
  const rows = await db.notificationPreference.findMany({ where: { userId } });
  const map = new Map(rows.map((r) => [r.type, r]));
  return (Object.keys(NOTIFICATION_TYPES) as NotificationType[]).map((type) => ({
    type,
    label: NOTIFICATION_TYPES[type].label,
    inApp: map.get(type)?.inApp ?? true,
    email: map.get(type)?.email ?? NOTIFICATION_TYPES[type].emailDefault,
  }));
}

export async function savePreferences(userId: string, prefs: { type: NotificationType; inApp: boolean; email: boolean }[]) {
  await db.$transaction(
    prefs.map((p) =>
      db.notificationPreference.upsert({
        where: { userId_type: { userId, type: p.type } },
        create: { userId, type: p.type, inApp: p.inApp, email: p.email },
        update: { inApp: p.inApp, email: p.email },
      }),
    ),
  );
}
