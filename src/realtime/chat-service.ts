// Group chat persistence and authorization. Used by the Socket.IO server,
// so no `server-only` / `next/*` imports. Every function re-checks access.
import type { Prisma, PrismaClient } from "@prisma/client";
import { hasCommunityAccess } from "../lib/auth/session-core";

/** `staff`: the author is an owner or administrator (shown as a label, so members always know). */
export type ChatAuthor = { id: string; name: string; staff: boolean };
export type ChatMessageDTO = {
  id: string;
  /** SYSTEM lines record membership changes; they have no author. */
  kind: "USER" | "SYSTEM";
  channelId: string;
  clientId: string | null;
  body: string;
  deleted: boolean;
  editedAt: string | null;
  createdAt: string;
  author: ChatAuthor | null;
  replyTo: { id: string; authorName: string; excerpt: string } | null;
  attachments: { id: string; name: string; mimeType: string; size: number }[];
};

export type ChannelAccess = {
  channelId: string;
  groupId: string;
  groupSlug: string;
  canPost: boolean;
  /**
   * Owners and administrators take part in groups like any member, but their
   * role gives them no view into conversations from before they joined: for
   * them the chat begins at this moment. null = no limit (ordinary members).
   */
  historyFrom: Date | null;
};

/** The earliest message a person may see in a group chat (see ChannelAccess.historyFrom). */
export function chatBoundary(role: string, joinedAt: Date): Date | null {
  return role === "OWNER" || role === "ADMIN" ? joinedAt : null;
}

/** Active org member + active group member + group not suspended. Archived groups are read-only. */
export async function channelAccess(db: PrismaClient, userId: string, channelId: string): Promise<ChannelAccess | null> {
  const ch = await db.groupChannel.findUnique({
    where: { id: channelId },
    select: { id: true, group: { select: { id: true, slug: true, status: true, suspendedAt: true } } },
  });
  if (!ch || ch.group.suspendedAt) return null;
  const [m, user] = await Promise.all([
    db.groupMembership.findUnique({ where: { groupId_userId: { groupId: ch.group.id, userId } }, select: { status: true, joinedAt: true } }),
    db.user.findUnique({ where: { id: userId }, select: { status: true, role: true, emailVerifiedAt: true, membershipStatus: true } }),
  ]);
  if (m?.status !== "ACTIVE" || !user || !hasCommunityAccess({ status: user.status, role: user.role, emailVerified: Boolean(user.emailVerifiedAt), membership: user.membershipStatus })) return null;
  // Owner and administrator accounts never use a group's live chat, not even with an investigation
  // grant (that grant gives a read-only view in the admin area, re-checked on every request).
  if (user.role === "OWNER" || user.role === "ADMIN") return null;
  return { channelId: ch.id, groupId: ch.group.id, groupSlug: ch.group.slug, canPost: ch.group.status !== "ARCHIVED", historyFrom: chatBoundary(user.role, m.joinedAt) };
}

const include = {
  author: { select: { id: true, role: true, profile: { select: { displayName: true } } } },
  replyTo: { select: { id: true, body: true, deletedAt: true, createdAt: true, author: { select: { profile: { select: { displayName: true } } } } } },
  attachments: { where: { deletedAt: null }, select: { id: true, originalName: true, mimeType: true, size: true } },
} satisfies Prisma.ChatMessageInclude;

type Row = Prisma.ChatMessageGetPayload<{ include: typeof include }>;

/**
 * `visibleFrom`: the reader's history boundary. A reply quotes the message it
 * answers; when that message is older than the boundary the quote is withheld.
 */
export function toDTO(m: Row, visibleFrom: Date | null = null): ChatMessageDTO {
  const deleted = Boolean(m.deletedAt);
  const quoteHidden = Boolean(m.replyTo && visibleFrom && m.replyTo.createdAt < visibleFrom);
  return {
    id: m.id,
    kind: m.kind,
    channelId: m.channelId,
    clientId: m.clientId,
    body: deleted ? "" : m.body,
    deleted,
    editedAt: m.editedAt?.toISOString() ?? null,
    createdAt: m.createdAt.toISOString(),
    author: m.author ? { id: m.author.id, name: m.author.profile?.displayName ?? "Member", staff: m.author.role !== "MEMBER" } : null,
    replyTo: m.replyTo
      ? {
          id: m.replyTo.id,
          authorName: quoteHidden ? "" : (m.replyTo.author?.profile?.displayName ?? "Member"),
          excerpt: quoteHidden ? "(a message from before you joined)" : m.replyTo.deletedAt ? "(deleted message)" : m.replyTo.body.slice(0, 140),
        }
      : null,
    attachments: deleted ? [] : m.attachments.map((a) => ({ id: a.id, name: a.originalName, mimeType: a.mimeType, size: a.size })),
  };
}

/** One page of messages, newest last. `from`: nothing older than this is returned (ChannelAccess.historyFrom). */
export async function history(db: PrismaClient, channelId: string, before?: string | null, take = 50, from: Date | null = null) {
  let cursorDate: Date | undefined;
  if (before) {
    const ref = await db.chatMessage.findUnique({ where: { id: before }, select: { createdAt: true, channelId: true } });
    if (ref && ref.channelId === channelId) cursorDate = ref.createdAt;
  }
  const rows = await db.chatMessage.findMany({
    where: { channelId, ...(cursorDate || from ? { createdAt: { ...(cursorDate ? { lt: cursorDate } : {}), ...(from ? { gte: from } : {}) } } : {}) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
    include,
  });
  const page = rows.slice(0, take).reverse();
  return { messages: page.map((r) => toDTO(r, from)), hasMore: rows.length > take };
}

/** One message as a given reader may see it, or null when it lies before their boundary. */
export async function messageFor(db: PrismaClient, messageId: string, visibleFrom: Date | null): Promise<ChatMessageDTO | null> {
  const m = await db.chatMessage.findUnique({ where: { id: messageId }, include });
  if (!m || (visibleFrom && m.createdAt < visibleFrom)) return null;
  return toDTO(m, visibleFrom);
}

/**
 * Writes a SYSTEM line into the group's chat (inside the transaction that makes
 * the membership change, so the two can never disagree). Returns the message
 * id; publish { t: "chat.system", messageId } after the transaction commits.
 */
export async function writeSystemLine(tx: Prisma.TransactionClient, groupId: string, body: string): Promise<string | null> {
  const channel = await tx.groupChannel.findFirst({ where: { groupId, isDefault: true }, select: { id: true } });
  if (!channel) return null;
  const m = await tx.chatMessage.create({ data: { channelId: channel.id, kind: "SYSTEM", authorId: null, clientId: null, body: body.slice(0, 300) } });
  return m.id;
}

class AttachmentGone extends Error {}

export type SendInput = { channelId: string; body: string; clientId: string; replyToId?: string | null; attachmentIds: string[] };
export type SendResult = { ok: true; message: ChatMessageDTO; duplicate: boolean } | { ok: false; error: string };

export async function sendMessage(db: PrismaClient, userId: string, access: ChannelAccess, input: SendInput): Promise<SendResult> {
  if (!access.canPost) return { ok: false, error: "This group is archived; chat is read-only." };
  if (!input.body && input.attachmentIds.length === 0) return { ok: false, error: "Write a message or attach a file." };

  // Idempotent resend after a reconnect: same author + clientId returns the stored message.
  const existing = await db.chatMessage.findUnique({ where: { authorId_clientId: { authorId: userId, clientId: input.clientId } }, include });
  if (existing) return { ok: true, message: toDTO(existing), duplicate: true };

  let replyToId: string | null = null;
  if (input.replyToId) {
    const r = await db.chatMessage.findUnique({ where: { id: input.replyToId }, select: { channelId: true, kind: true, createdAt: true } });
    // Only real messages the sender can see may be answered.
    if (r?.channelId === access.channelId && r.kind === "USER" && !(access.historyFrom && r.createdAt < access.historyFrom)) replyToId = input.replyToId;
  }
  if (input.attachmentIds.length) {
    const files = await db.storedFile.findMany({
      where: { id: { in: input.attachmentIds }, ownerId: userId, scope: "CHAT_ATTACHMENT", groupId: access.groupId, messageId: null, deletedAt: null },
      select: { id: true },
    });
    if (files.length !== new Set(input.attachmentIds).size) return { ok: false, error: "An attachment is missing. Please upload it again." };
  }
  try {
    const created = await db.$transaction(async (tx) => {
      const m = await tx.chatMessage.create({ data: { channelId: access.channelId, authorId: userId, clientId: input.clientId, body: input.body, replyToId } });
      if (input.attachmentIds.length) {
        // Claim the files only while they are still unattached: two messages sent at the same moment cannot share one.
        const claimed = await tx.storedFile.updateMany({ where: { id: { in: input.attachmentIds }, ownerId: userId, messageId: null, deletedAt: null }, data: { messageId: m.id } });
        if (claimed.count !== new Set(input.attachmentIds).size) throw new AttachmentGone();
      }
      await tx.researchGroup.update({ where: { id: access.groupId }, data: { lastActivityAt: new Date() } });
      await tx.channelReadState.upsert({
        where: { channelId_userId: { channelId: access.channelId, userId } },
        create: { channelId: access.channelId, userId, lastReadAt: m.createdAt },
        update: { lastReadAt: m.createdAt },
      });
      return tx.chatMessage.findUniqueOrThrow({ where: { id: m.id }, include });
    });
    return { ok: true, message: toDTO(created), duplicate: false };
  } catch (err) {
    if (err instanceof AttachmentGone) return { ok: false, error: "An attachment is missing. Please upload it again." };
    // A concurrent duplicate resend hit the unique constraint.
    const again = await db.chatMessage.findUnique({ where: { authorId_clientId: { authorId: userId, clientId: input.clientId } }, include });
    if (again) return { ok: true, message: toDTO(again), duplicate: true };
    throw err;
  }
}

export async function editMessage(db: PrismaClient, userId: string, access: ChannelAccess, messageId: string, body: string) {
  if (!access.canPost) return { ok: false as const, error: "This group is archived." };
  const m = await db.chatMessage.findUnique({ where: { id: messageId } });
  if (!m || m.kind !== "USER" || m.channelId !== access.channelId || m.authorId !== userId || m.deletedAt) return { ok: false as const, error: "You can only edit your own messages." };
  if (!body) return { ok: false as const, error: "A message cannot be empty." };
  const updated = await db.chatMessage.update({ where: { id: messageId }, data: { body, editedAt: new Date() }, include });
  return { ok: true as const, message: toDTO(updated) };
}

/** Soft delete. Content is hidden at once and purged after the retention period. */
export async function deleteMessage(db: PrismaClient, userId: string, access: ChannelAccess, messageId: string) {
  const m = await db.chatMessage.findUnique({ where: { id: messageId } });
  if (!m || m.kind !== "USER" || m.channelId !== access.channelId || m.authorId !== userId || m.deletedAt) return { ok: false as const, error: "You can only delete your own messages." };
  const updated = await db.chatMessage.update({ where: { id: messageId }, data: { deletedAt: new Date() }, include });
  await db.storedFile.updateMany({ where: { messageId }, data: { deletedAt: new Date() } });
  return { ok: true as const, message: toDTO(updated) };
}

export async function markChannelRead(db: PrismaClient, userId: string, channelId: string) {
  await db.channelReadState.upsert({
    where: { channelId_userId: { channelId, userId } },
    create: { channelId, userId, lastReadAt: new Date() },
    update: { lastReadAt: new Date() },
  });
}
