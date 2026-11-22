/**
 * Regression tests for the corrective implementation plan: live chat.
 * P1-2: a chat connection ends together with its session.
 */
import { createServer, type Server as HttpServer } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { io as ioClient, type Socket } from "socket.io-client";
import { db } from "@/lib/db";
import { SESSION_COOKIE } from "@/lib/auth/constants";
import { createSession, revokeSessionById, revokeSessionByToken, revokeUserSessions } from "@/lib/auth/session";
import { changePassword } from "@/server/accounts";
import { createIdea, endorseIdea } from "@/server/community/ideas";
import { attachRealtime, type RealtimeHandle } from "@/realtime/server";
import { cookieJar, createMember, PASSWORD, resetDb } from "./helpers";

let http: HttpServer;
let rt: RealtimeHandle;
let port = 0;
const clients: Socket[] = [];

beforeAll(async () => {
  http = createServer();
  await new Promise<void>((r) => http.listen(0, "127.0.0.1", () => r()));
  port = (http.address() as { port: number }).port;
  rt = await attachRealtime(http, db, { siteUrl: `http://127.0.0.1:${port}`, databaseUrl: process.env.DATABASE_URL! });
});
beforeEach(async () => {
  await resetDb();
  cookieJar.clear();
});
afterAll(async () => {
  for (const c of clients) c.close();
  await rt.close();
  await db.$disconnect();
});

async function connect(token: string) {
  const c = ioClient(`http://127.0.0.1:${port}`, {
    path: "/socket.io",
    transports: ["websocket"],
    extraHeaders: { cookie: `${SESSION_COOKIE}=${encodeURIComponent(token)}`, origin: `http://127.0.0.1:${port}` },
    reconnection: false,
  });
  clients.push(c);
  await new Promise<void>((resolve, reject) => {
    c.on("connect", () => resolve());
    c.on("connect_error", reject);
  });
  return c;
}
const emit = (c: Socket, ev: string, data: unknown, waitMs = 3000) =>
  new Promise<Record<string, unknown> | "no answer">((resolve) => {
    const t = setTimeout(() => resolve("no answer"), waitMs);
    c.emit(ev, data, (res: Record<string, unknown>) => {
      clearTimeout(t);
      resolve(res);
    });
  });
/** Resolves true when the server closes the connection within the time limit. */
const closedWithin = (c: Socket, ms = 5000) =>
  new Promise<boolean>((resolve) => {
    if (!c.connected) return resolve(true);
    const t = setTimeout(() => resolve(false), ms);
    c.once("disconnect", () => {
      clearTimeout(t);
      resolve(true);
    });
  });

async function chatGroup() {
  const [a, b, c] = [await createMember("Alice"), await createMember("Bob"), await createMember("Cara")];
  const res = await createIdea(a.id, {
    title: "Neighborhood bookkeeping service",
    summary: "Small local shops need simple, affordable monthly bookkeeping help.",
    category: "ONLINE_SERVICES",
    description: null, problem: null, proposal: null, customers: null, revenueModel: null, skillsNeeded: null, timeEstimate: null,
    links: [],
  });
  if (!res.ok) throw new Error(res.error);
  await endorseIdea(b.id, res.id);
  await endorseIdea(c.id, res.id);
  const g = await db.researchGroup.findUniqueOrThrow({ where: { ideaId: res.id }, include: { channels: true } });
  return { a, b, c, g, channelId: g.channels[0]!.id };
}
const message = (channelId: string, n: number) => ({ channelId, body: `message ${n}`, clientId: `corrective-test-client-${n}`, attachmentIds: [] });

describe("P1-2: a chat connection ends together with its session", () => {
  it("signing out closes the connection, tells the browser why, and nothing more can be sent", async () => {
    const { a, channelId } = await chatGroup();
    const s = await createSession(a.id, "MEMBER", { mfaVerified: true });
    const c = await connect(s.token);
    expect((await emit(c, "channel:join", { channelId }) as { ok: boolean }).ok).toBe(true);
    expect((await emit(c, "message:send", message(channelId, 1)) as { ok: boolean }).ok).toBe(true);

    let toldWhy = false;
    c.once("session:ended", () => (toldWhy = true));
    const closed = closedWithin(c);
    await revokeSessionByToken(s.token);
    expect(await closed).toBe(true);
    expect(toldWhy).toBe(true);
    expect(await db.chatMessage.count({ where: { channelId } })).toBe(1);
  });

  it("\"sign out of other sessions\" closes the other connection and keeps the current one", async () => {
    const { a, channelId } = await chatGroup();
    const here = await createSession(a.id, "MEMBER", { mfaVerified: true });
    const elsewhere = await createSession(a.id, "MEMBER", { mfaVerified: true });
    const [cHere, cElsewhere] = [await connect(here.token), await connect(elsewhere.token)];
    await emit(cHere, "channel:join", { channelId });
    await emit(cElsewhere, "channel:join", { channelId });
    const hereId = (await db.session.findFirstOrThrow({ where: { userId: a.id }, orderBy: { createdAt: "asc" } })).id;

    const closed = closedWithin(cElsewhere);
    expect(await revokeUserSessions(a.id, hereId)).toBe(1);
    expect(await closed).toBe(true);
    expect(cHere.connected).toBe(true);
    expect((await emit(cHere, "message:send", message(channelId, 2)) as { ok: boolean }).ok).toBe(true);
  });

  it("ending one session from the security page closes only that connection", async () => {
    const { a, channelId } = await chatGroup();
    const one = await createSession(a.id, "MEMBER", { mfaVerified: true });
    const two = await createSession(a.id, "MEMBER", { mfaVerified: true });
    const [c1, c2] = [await connect(one.token), await connect(two.token)];
    await emit(c1, "channel:join", { channelId });
    const secondId = (await db.session.findFirstOrThrow({ where: { userId: a.id }, orderBy: { createdAt: "desc" } })).id;
    const closed = closedWithin(c2);
    expect(await revokeSessionById(a.id, secondId)).toBe(1);
    expect(await closed).toBe(true);
    expect(c1.connected).toBe(true);
    // Someone else's session id is ignored.
    const other = await createMember("Dora");
    expect(await revokeSessionById(other.id, (await db.session.findFirstOrThrow({ where: { userId: a.id, revokedAt: null } })).id)).toBe(0);
  });

  it("changing the password closes the connections of the other sessions", async () => {
    const { a, channelId } = await chatGroup();
    const here = await createSession(a.id, "MEMBER", { mfaVerified: true });
    const elsewhere = await createSession(a.id, "MEMBER", { mfaVerified: true });
    const cElsewhere = await connect(elsewhere.token);
    await emit(cElsewhere, "channel:join", { channelId });
    const hereId = (await db.session.findFirstOrThrow({ where: { userId: a.id }, orderBy: { createdAt: "asc" } })).id;
    void here;
    const closed = closedWithin(cElsewhere);
    expect((await changePassword(a.id, hereId, PASSWORD, "another-correct-horse-7")).ok).toBe(true);
    expect(await closed).toBe(true);
  });

  it("safety net: even if the signal is missed, the next action is refused and the connection closed", async () => {
    const { a, b, channelId } = await chatGroup();
    const s = await createSession(a.id, "MEMBER", { mfaVerified: true });
    const c = await connect(s.token);
    await emit(c, "channel:join", { channelId });
    // The session is revoked directly in the database: no signal reaches the chat server.
    await db.session.updateMany({ where: { userId: a.id }, data: { revokedAt: new Date() } });

    const closed = closedWithin(c);
    const answer = await emit(c, "message:send", message(channelId, 3), 1500);
    expect(answer).toBe("no answer");
    expect(await closed).toBe(true);
    expect(await db.chatMessage.count({ where: { channelId, authorId: a.id } })).toBe(0);

    // And it no longer receives what others write.
    let leaked = false;
    c.on("message:new", () => (leaked = true));
    const sb = await createSession(b.id, "MEMBER", { mfaVerified: true });
    const cb = await connect(sb.token);
    await emit(cb, "channel:join", { channelId });
    expect((await emit(cb, "message:send", message(channelId, 4)) as { ok: boolean }).ok).toBe(true);
    await new Promise((r) => setTimeout(r, 300));
    expect(leaked).toBe(false);
  });
});
