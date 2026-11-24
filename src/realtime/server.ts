// Socket.IO server for group chat, presence, typing indicators and live
// notification badges. Attached to the same HTTP server and origin as Next.js.
//
// Security model:
// - Handshake: Origin must match SITE_URL; the session cookie is resolved in
//   the database (revoked/expired/suspended sessions are refused).
// - Every channel join and every send/edit/delete re-checks group membership
//   in the database. Client-supplied user ids are never trusted.
// - Server-side events (left group, suspended, revoked) arrive via Postgres
//   LISTEN/NOTIFY and immediately remove sockets from rooms.
// - A connection belongs to ONE session. When that session ends (sign-out,
//   "sign out of other sessions", password change...) the connection is closed.
//   As a safety net the session is also re-checked on every operation and once
//   a minute, so a missed event cannot leave a signed-out session connected.
import type { Server as HttpServer } from "node:http";
import { Client } from "pg";
import type { PrismaClient } from "@prisma/client";
import { Server, type Socket } from "socket.io";
import { z } from "zod";
import { lookupSession, readCookie } from "../lib/auth/session-core";
import { REALTIME_CHANNEL, type RealtimeEvent } from "../lib/realtime-events";
import { chatMessageSchema } from "../lib/validation/community";
import { channelAccess, deleteMessage, editMessage, history, markChannelRead, messageFor, sendMessage, type ChatMessageDTO } from "./chat-service";

type SocketUser = { id: string; name: string };
/** A joined chat: its group, and the earliest moment this person may see (null = everything; see ChannelAccess.historyFrom). */
type Joined = { groupId: string; from: Date | null };
type Data = { user: SocketUser; sessionId: string; channels: Map<string, Joined> };

/** How often an open connection re-checks that its session still exists. */
const SESSION_RECHECK_MS = 60_000;
type Ack = (res: unknown) => void;

// Simple per-user token buckets (single instance; see README for scaling).
const buckets = new Map<string, { n: number; reset: number }>();
let lastSweep = Date.now();
function allow(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  // Forget counters whose time window is over, so the list cannot grow without end.
  if (now - lastSweep > 60_000) {
    for (const [k, b] of buckets) if (b.reset < now) buckets.delete(k);
    lastSweep = now;
  }
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { n: 1, reset: now + windowMs });
    return true;
  }
  if (b.n >= limit) return false;
  b.n++;
  return true;
}

const idSchema = z.object({ channelId: z.string().min(1).max(40) });
const moreSchema = idSchema.extend({ before: z.string().max(40).nullish() });
const editSchema = idSchema.extend({ messageId: z.string().min(1).max(40), body: z.string().max(4000).transform((s) => s.trim()) });
const delSchema = idSchema.extend({ messageId: z.string().min(1).max(40) });

function safeAck(ack: unknown): Ack {
  return typeof ack === "function" ? (ack as Ack) : () => {};
}

export type RealtimeHandle = { io: Server; close: () => Promise<void> };

export async function attachRealtime(httpServer: HttpServer, db: PrismaClient, opts: { siteUrl: string; databaseUrl: string; log?: (msg: string, meta?: object) => void }): Promise<RealtimeHandle> {
  const log = opts.log ?? (() => {});
  const allowedOrigin = new URL(opts.siteUrl).origin;
  const io = new Server(httpServer, {
    path: "/socket.io",
    serveClient: false,
    maxHttpBufferSize: 64 * 1024,
    cors: { origin: allowedOrigin, credentials: true },
    allowRequest: (req, cb) => {
      // Protects against cross-site WebSocket hijacking.
      const origin = req.headers.origin;
      const host = req.headers.host;
      const ok = !origin || origin === allowedOrigin || (host !== undefined && (origin === `http://${host}` || origin === `https://${host}`));
      cb(null, ok);
    },
  });

  // presence: channelId -> userId -> socket count
  const presence = new Map<string, Map<string, number>>();
  const presenceList = (channelId: string) => [...(presence.get(channelId)?.keys() ?? [])];
  const presenceAdd = (channelId: string, userId: string) => {
    const m = presence.get(channelId) ?? new Map<string, number>();
    m.set(userId, (m.get(userId) ?? 0) + 1);
    presence.set(channelId, m);
  };
  const presenceRemove = (channelId: string, userId: string) => {
    const m = presence.get(channelId);
    if (!m) return;
    const n = (m.get(userId) ?? 1) - 1;
    if (n <= 0) m.delete(userId);
    else m.set(userId, n);
    if (!m.size) presence.delete(channelId);
  };

  /**
   * Sends a message event to everyone in a chat. People with a history boundary
   * (owners and administrators who joined later) get their own version: a
   * message from before they joined is not sent at all (for example when it is
   * edited), and a quote of such a message is withheld.
   */
  async function emitToChannel(channelId: string, event: "message:new" | "message:updated", message: ChatMessageDTO) {
    const created = new Date(message.createdAt);
    for (const socket of io.sockets.sockets.values()) {
      const joined = (socket.data as Data).channels?.get(channelId);
      if (!joined) continue;
      if (!joined.from) socket.emit(event, message);
      else if (created >= joined.from) {
        const own = message.replyTo ? await messageFor(db, message.id, joined.from) : message;
        if (own) socket.emit(event, own);
      }
    }
  }

  function leaveChannel(socket: Socket, channelId: string) {
    const data = socket.data as Data;
    if (!data.channels.has(channelId)) return;
    data.channels.delete(channelId);
    socket.leave(`channel:${channelId}`);
    presenceRemove(channelId, data.user.id);
    io.to(`channel:${channelId}`).emit("presence", { channelId, userIds: presenceList(channelId) });
  }

  io.use(async (socket, next) => {
    try {
      const token = readCookie(socket.handshake.headers.cookie);
      // A background connection is not "activity": it must not keep an idle administrator signed in.
      const s = await lookupSession(db, token, new Date(), { touch: false });
      if (!s || s.mfaPending || !s.user.communityAccess || !s.user.displayName) return next(new Error("unauthorized"));
      (socket.data as Data).user = { id: s.user.id, name: s.user.displayName };
      (socket.data as Data).sessionId = s.sessionId;
      (socket.data as Data).channels = new Map();
      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });

  /** Closes a connection whose session has ended. The browser is told why, so it can show "signed out". */
  function endConnection(socket: Socket) {
    socket.emit("session:ended");
    socket.disconnect(true);
  }
  async function sessionAlive(sessionId: string): Promise<boolean> {
    const s = await db.session.findUnique({ where: { id: sessionId }, select: { revokedAt: true, expiresAt: true } });
    return Boolean(s && !s.revokedAt && s.expiresAt > new Date());
  }

  io.on("connection", (socket) => {
    const data = socket.data as Data;
    const user = data.user;
    socket.join(`user:${user.id}`);

    // Every operation first confirms that this connection's session still exists.
    socket.use((_packet, next) => {
      sessionAlive(data.sessionId)
        .then((alive) => (alive ? next() : endConnection(socket)))
        .catch(() => next(new Error("unavailable")));
    });
    const recheck = setInterval(() => {
      sessionAlive(data.sessionId)
        .then((alive) => !alive && endConnection(socket))
        .catch(() => {});
    }, SESSION_RECHECK_MS);
    socket.on("disconnect", () => clearInterval(recheck));

    socket.on("channel:join", async (raw: unknown, ackRaw: unknown) => {
      const ack = safeAck(ackRaw);
      const p = idSchema.safeParse(raw);
      if (!p.success) return ack({ ok: false, error: "invalid" });
      const access = await channelAccess(db, user.id, p.data.channelId);
      if (!access) return ack({ ok: false, error: "forbidden" });
      if (!data.channels.has(access.channelId)) {
        data.channels.set(access.channelId, { groupId: access.groupId, from: access.historyFrom });
        socket.join(`channel:${access.channelId}`);
        socket.join(`group:${access.groupId}`);
        presenceAdd(access.channelId, user.id);
      }
      const page = await history(db, access.channelId, null, 50, access.historyFrom);
      await markChannelRead(db, user.id, access.channelId);
      io.to(`channel:${access.channelId}`).emit("presence", { channelId: access.channelId, userIds: presenceList(access.channelId) });
      ack({ ok: true, canPost: access.canPost, ...page, presence: presenceList(access.channelId) });
    });

    socket.on("channel:leave", (raw: unknown) => {
      const p = idSchema.safeParse(raw);
      if (p.success) leaveChannel(socket, p.data.channelId);
    });

    socket.on("history:more", async (raw: unknown, ackRaw: unknown) => {
      const ack = safeAck(ackRaw);
      const p = moreSchema.safeParse(raw);
      if (!p.success) return ack({ ok: false, error: "invalid" });
      const access = await channelAccess(db, user.id, p.data.channelId);
      if (!access) return ack({ ok: false, error: "forbidden" });
      ack({ ok: true, ...(await history(db, access.channelId, p.data.before, 50, access.historyFrom)) });
    });

    socket.on("message:send", async (raw: unknown, ackRaw: unknown) => {
      const ack = safeAck(ackRaw);
      const p = chatMessageSchema.safeParse(raw);
      if (!p.success) return ack({ ok: false, error: p.error.issues[0]?.message ?? "Invalid message." });
      if (!allow(`msg:${user.id}`, 20, 10_000)) return ack({ ok: false, error: "You are sending messages too quickly. Please slow down." });
      const access = await channelAccess(db, user.id, p.data.channelId);
      if (!access) {
        leaveChannel(socket, p.data.channelId);
        return ack({ ok: false, error: "You no longer have access to this chat.", revoked: true });
      }
      try {
        const res = await sendMessage(db, user.id, access, p.data);
        if (!res.ok) return ack(res);
        if (!res.duplicate) await emitToChannel(access.channelId, "message:new", res.message);
        ack({ ok: true, message: res.message });
      } catch (err) {
        log("realtime.send_failed", { err: String(err) });
        ack({ ok: false, error: "The message could not be saved. It will be retried." });
      }
    });

    socket.on("message:edit", async (raw: unknown, ackRaw: unknown) => {
      const ack = safeAck(ackRaw);
      const p = editSchema.safeParse(raw);
      if (!p.success) return ack({ ok: false, error: "Invalid edit." });
      if (!allow(`edit:${user.id}`, 20, 10_000)) return ack({ ok: false, error: "Too many edits." });
      const access = await channelAccess(db, user.id, p.data.channelId);
      if (!access) return ack({ ok: false, error: "forbidden", revoked: true });
      const res = await editMessage(db, user.id, access, p.data.messageId, p.data.body);
      if (res.ok) await emitToChannel(access.channelId, "message:updated", res.message);
      ack(res);
    });

    socket.on("message:delete", async (raw: unknown, ackRaw: unknown) => {
      const ack = safeAck(ackRaw);
      const p = delSchema.safeParse(raw);
      if (!p.success) return ack({ ok: false, error: "Invalid request." });
      const access = await channelAccess(db, user.id, p.data.channelId);
      if (!access) return ack({ ok: false, error: "forbidden", revoked: true });
      const res = await deleteMessage(db, user.id, access, p.data.messageId);
      if (res.ok) await emitToChannel(access.channelId, "message:updated", res.message);
      ack(res);
    });

    socket.on("typing", (raw: unknown) => {
      const p = idSchema.safeParse(raw);
      if (!p.success || !data.channels.has(p.data.channelId)) return;
      if (!allow(`typing:${user.id}`, 10, 5_000)) return;
      socket.to(`channel:${p.data.channelId}`).emit("typing", { channelId: p.data.channelId, userId: user.id, name: user.name });
    });

    socket.on("read", async (raw: unknown) => {
      const p = idSchema.safeParse(raw);
      if (!p.success || !data.channels.has(p.data.channelId)) return;
      if (!allow(`read:${user.id}`, 30, 10_000)) return;
      await markChannelRead(db, user.id, p.data.channelId).catch(() => {});
    });

    socket.on("disconnect", () => {
      for (const channelId of [...data.channels.keys()]) leaveChannel(socket, channelId);
    });
  });

  // ---- server-side events via LISTEN/NOTIFY
  let listener: Client | null = null;
  let closed = false;
  const handle = async (ev: RealtimeEvent) => {
    switch (ev.t) {
      case "user.revoked":
        io.in(`user:${ev.userId}`).disconnectSockets(true);
        break;
      case "sessions.ended": {
        const ended = new Set(ev.sessionIds);
        for (const socket of io.sockets.sockets.values()) if (ended.has((socket.data as Data).sessionId)) endConnection(socket);
        break;
      }
      case "group.access_revoked": {
        const sockets = await io.in(`group:${ev.groupId}`).fetchSockets();
        for (const remote of sockets) {
          const d = remote.data as Data;
          if (ev.userId && d.user.id !== ev.userId) continue;
          const local = io.sockets.sockets.get(remote.id);
          if (!local) continue;
          for (const [channelId, joined] of [...d.channels]) if (joined.groupId === ev.groupId) leaveChannel(local, channelId);
          local.leave(`group:${ev.groupId}`);
          local.emit("access:revoked", { groupId: ev.groupId });
        }
        break;
      }
      case "chat.system": {
        // A membership change was written into a chat: show the line to the people who have it open.
        const m = await messageFor(db, ev.messageId, null);
        if (m) await emitToChannel(m.channelId, "message:new", m);
        break;
      }
      case "chat.message_changed": {
        const m = await messageFor(db, ev.messageId, null);
        if (m) await emitToChannel(m.channelId, "message:updated", m);
        break;
      }
      case "notifications.changed": {
        const count = await db.notification.count({ where: { userId: ev.userId, readAt: null } });
        io.to(`user:${ev.userId}`).emit("notifications:count", { count });
        break;
      }
      case "group.updated":
        io.to(`group:${ev.groupId}`).emit("group:updated", { groupId: ev.groupId, what: ev.what });
        break;
      case "legal.reacceptance_required": {
        // Open chats are checked again: members who have not accepted the new version yet leave them
        // until they do (the same check every chat operation makes).
        for (const socket of io.sockets.sockets.values()) {
          const d = socket.data as Data;
          for (const [channelId, joined] of [...d.channels]) {
            if (await channelAccess(db, d.user.id, channelId).catch(() => null)) continue;
            leaveChannel(socket, channelId);
            socket.emit("access:revoked", { groupId: joined.groupId });
          }
        }
        break;
      }
    }
  };

  const connectListener = async () => {
    if (closed) return;
    const url = new URL(opts.databaseUrl);
    url.searchParams.delete("schema");
    const c = new Client({ connectionString: url.toString() });
    c.on("notification", (msg) => {
      if (msg.channel !== REALTIME_CHANNEL || !msg.payload) return;
      try {
        void handle(JSON.parse(msg.payload) as RealtimeEvent).catch((err) => log("realtime.event_failed", { err: String(err) }));
      } catch {
        /* ignore malformed payloads */
      }
    });
    c.on("error", () => {
      listener = null;
      c.end().catch(() => {});
      if (!closed) setTimeout(() => void connectListener().catch(() => {}), 2000);
    });
    await c.connect();
    await c.query(`LISTEN ${REALTIME_CHANNEL}`);
    listener = c;
  };
  await connectListener();

  return {
    io,
    close: async () => {
      closed = true;
      await new Promise<void>((r) => io.close(() => r()));
      await listener?.end().catch(() => {});
    },
  };
}
