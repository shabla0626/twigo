// Event bus between Next.js server code and the realtime (Socket.IO) layer.
// Uses PostgreSQL LISTEN/NOTIFY, so it also works with several server
// instances. Payloads carry ids only, never message content or personal data.
import type { PrismaClient } from "@prisma/client";

export const REALTIME_CHANNEL = "cowork_realtime";

export type RealtimeEvent =
  /** Sessions revoked / account suspended: disconnect all sockets of the user. */
  | { t: "user.revoked"; userId: string }
  /** These sessions ended (sign-out, "sign out of other sessions", password change...): close their live connections. */
  | { t: "sessions.ended"; sessionIds: string[] }
  /** The site wrote a line into a group chat (membership change): show it to the people in the chat. */
  | { t: "chat.system"; messageId: string }
  /** User lost access to a group (left, removed, group suspended): leave its rooms. */
  | { t: "group.access_revoked"; groupId: string; userId?: string }
  /** Unread notification count changed for a user. */
  | { t: "notifications.changed"; userId: string }
  /** Something visible on a group page changed (meeting started, announcement...). */
  | { t: "group.updated"; groupId: string; what: "meeting" | "announcement" | "members" | "status" | "research" };

export async function publishRealtime(db: PrismaClient, event: RealtimeEvent): Promise<void> {
  try {
    await db.$executeRaw`SELECT pg_notify(${REALTIME_CHANNEL}, ${JSON.stringify(event)})`;
  } catch {
    // Realtime is best effort; authorization is re-checked on every socket operation anyway.
  }
}
