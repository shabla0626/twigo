/**
 * Regression tests for the corrective implementation plan.
 * P1-1: membership changes are visible in the group chat and recorded, and
 * owners / administrators get no view into conversations from before they joined.
 */
import { createServer, type Server as HttpServer } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { io as ioClient, type Socket } from "socket.io-client";
import { db } from "@/lib/db";
import { SESSION_COOKIE } from "@/lib/auth/constants";
import { createSession } from "@/lib/auth/session";
import { createIdea, endorseIdea } from "@/server/community/ideas";
import { adminAssignCoordinator, joinGroup, leaveGroup, myGroups, removeMember, transferCoordinator } from "@/server/community/groups";
import { authorizeDownload, listGroupFiles } from "@/server/community/files";
import { fileReport, recordPrivateReportView } from "@/server/community/reports";
import { suspendUser } from "@/server/accounts";
import { groupUnread } from "@/server/community/group-page";
import { channelAccess, deleteMessage, editMessage, history, sendMessage, type ChatMessageDTO } from "@/realtime/chat-service";
import { attachRealtime, type RealtimeHandle } from "@/realtime/server";
import { cookieJar, createMember, createUser, resetDb } from "./helpers";

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

async function connectAs(userId: string, role: "OWNER" | "ADMIN" | "MEMBER" = "MEMBER") {
  const s = await createSession(userId, role, { mfaVerified: true });
  const c = ioClient(`http://127.0.0.1:${port}`, {
    path: "/socket.io",
    transports: ["websocket"],
    extraHeaders: { cookie: `${SESSION_COOKIE}=${encodeURIComponent(s.token)}`, origin: `http://127.0.0.1:${port}` },
    reconnection: false,
  });
  clients.push(c);
  await new Promise<void>((resolve, reject) => {
    c.on("connect", () => resolve());
    c.on("connect_error", reject);
  });
  return c;
}
type JoinAnswer = { ok: boolean; messages?: ChatMessageDTO[]; hasMore?: boolean };
const emit = <T = Record<string, unknown>>(c: Socket, ev: string, data: unknown) => new Promise<T>((r) => c.emit(ev, data, (res: T) => r(res)));
const pause = (ms = 400) => new Promise((r) => setTimeout(r, ms));
const collect = (c: Socket, event: string) => {
  const got: ChatMessageDTO[] = [];
  c.on(event, (m: ChatMessageDTO) => got.push(m));
  return got;
};

/** Alice (author, coordinator), Bob and Cara form a group; an owner with a profile exists but is not in it. */
async function setup() {
  const [a, b, c] = [await createMember("Alice"), await createMember("Bob"), await createMember("Cara")];
  const owner = await createUser({ email: "olivia@example.test", name: "Olivia Owner", role: "OWNER", totp: true, profile: true });
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
  return { a, b, c, owner, g, channelId: g.channels[0]!.id };
}
let n = 0;
async function say(userId: string, channelId: string, body: string, replyToId?: string) {
  const access = (await channelAccess(db, userId, channelId))!;
  const res = await sendMessage(db, userId, access, { channelId, body, clientId: `corrective-chat-test-${++n}`, replyToId, attachmentIds: [] });
  if (!res.ok) throw new Error(res.error);
  return res.message;
}
const bodies = (list: ChatMessageDTO[] | undefined) => (list ?? []).map((m) => m.body);
const systemLines = async (channelId: string) => (await db.chatMessage.findMany({ where: { channelId, kind: "SYSTEM" }, orderBy: { createdAt: "asc" } })).map((m) => m.body);

describe("P1-1: membership changes are visible to the group and recorded", () => {
  it("joining and leaving each write a line into the chat and an audit entry", async () => {
    const { g, channelId } = await setup();
    const dora = await createMember("Dora");
    expect((await joinGroup(dora.id, g.id)).ok).toBe(true);
    await leaveGroup(dora.id, g.id);
    expect(await systemLines(channelId)).toEqual(["Dora joined the group", "Dora left the group"]);
    expect(await db.auditLog.count({ where: { action: "group.member_joined", actorId: dora.id, entityId: g.id } })).toBe(1);
    expect(await db.auditLog.count({ where: { action: "group.member_left", actorId: dora.id, entityId: g.id } })).toBe(1);
    // Joining twice (already a member) writes nothing more.
    await joinGroup(dora.id, g.id);
    await joinGroup(dora.id, g.id);
    expect((await systemLines(channelId)).filter((l) => l === "Dora joined the group")).toHaveLength(2);
  });

  it("an owner or administrator cannot join a group, so no join line is written for them (decision of 24 November 2026)", async () => {
    const { owner, g, channelId } = await setup();
    const before = await systemLines(channelId);
    expect(await joinGroup(owner.id, g.id)).toMatchObject({ ok: false });
    expect(await systemLines(channelId)).toEqual(before);
    expect(await db.auditLog.count({ where: { action: "group.member_joined", actorId: owner.id } })).toBe(0);
  });

  it("removal, hand-over, assignment and succession are written into the chat too", async () => {
    const { a, b, c, owner, g, channelId } = await setup();
    await transferCoordinator(a.id, g.id, b.id);
    await removeMember(b.id, g.id, c.id);
    await adminAssignCoordinator(owner.id, g.id, a.id);
    await suspendUser(owner.id, a.id, "test"); // the coordinator becomes unavailable
    expect(await systemLines(channelId)).toEqual([
      "Bob is now the coordinator (handed over by Alice)",
      "Cara was removed from the group by the coordinator",
      "Alice is now the coordinator (assigned by an administrator)",
      "Bob is now the coordinator",
    ]);
  });

  it("people who have the chat open see the line at once", async () => {
    const { a, g, channelId } = await setup();
    const ca = await connectAs(a.id);
    await emit(ca, "channel:join", { channelId });
    const seen = collect(ca, "message:new");
    const dora = await createMember("Dora");
    await joinGroup(dora.id, g.id);
    await pause();
    expect(seen.map((m) => [m.kind, m.body, m.author])).toEqual([["SYSTEM", "Dora joined the group", null]]);
  });

  it("a line written by the site cannot be edited, deleted, answered or reported, and is not counted as unread", async () => {
    const { a, b, g, channelId } = await setup();
    const dora = await createMember("Dora");
    await joinGroup(dora.id, g.id);
    const line = await db.chatMessage.findFirstOrThrow({ where: { channelId, kind: "SYSTEM" } });
    const access = (await channelAccess(db, a.id, channelId))!;
    expect((await editMessage(db, a.id, access, line.id, "changed")).ok).toBe(false);
    expect((await deleteMessage(db, a.id, access, line.id)).ok).toBe(false);
    expect((await fileReport(a.id, { targetType: "MESSAGE", targetId: line.id, reason: "SPAM", details: null })).ok).toBe(false);
    const reply = await say(a.id, channelId, "welcome", line.id);
    expect(reply.replyTo).toBeNull();
    expect((await db.chatMessage.findUniqueOrThrow({ where: { id: line.id } })).body).toBe("Dora joined the group");
    // Bob has read nothing yet: only the message written by a person counts.
    expect(await groupUnread(g.id, b.id)).toBe(1);
  });
});

describe("administrators never see a group's chat (replaces the earlier join-with-history-boundary rule)", () => {
  it("an owner's socket is refused by the chat, and a member still sees the history", async () => {
    const { a, owner, g, channelId } = await setup();
    await say(a.id, channelId, "private plan from before");
    await joinGroup(owner.id, g.id);
    const co = await connectAs(owner.id, "OWNER");
    expect((await emit<JoinAnswer>(co, "channel:join", { channelId })).ok).toBe(false);
    expect(await channelAccess(db, owner.id, channelId)).toBeNull();
    const dora = await createMember("Dora");
    await joinGroup(dora.id, g.id);
    const cd = await connectAs(dora.id);
    expect(bodies((await emit<JoinAnswer>(cd, "channel:join", { channelId })).messages)).toContain("private plan from before");
  });

  it("chat attachments cannot be listed or downloaded by an administrator", async () => {
    const { a, owner, g, channelId } = await setup();
    const m = await say(a.id, channelId, "see attached");
    const f = await db.storedFile.create({ data: { ownerId: a.id, scope: "CHAT_ATTACHMENT", groupId: g.id, messageId: m.id, originalName: "a.pdf", mimeType: "application/pdf", size: 3, sha256: "0".repeat(64), storageKey: "chat/2026-11/a" } });
    expect(await authorizeDownload(owner.id, f.id)).toBeNull();
    expect(await authorizeDownload(a.id, f.id)).not.toBeNull();
  });

  it("an administrator's support does not count and does not make them a founding member", async () => {
    const [a, b] = [await createMember("Alice"), await createMember("Bob")];
    const admin = await createUser({ email: "adam@example.test", name: "Adam Admin", role: "ADMIN", totp: true, profile: true });
    const res = await createIdea(a.id, {
      title: "Weekend tutoring", summary: "Adults returning to school need help with math and writing in the evenings.", category: "ONLINE_SERVICES",
      description: null, problem: null, proposal: null, customers: null, revenueModel: null, skillsNeeded: null, timeEstimate: null, links: [],
    });
    if (!res.ok) throw new Error(res.error);
    await endorseIdea(b.id, res.id);
    expect(await endorseIdea(admin.id, res.id)).toMatchObject({ ok: false });
    expect(await db.researchGroup.count({ where: { ideaId: res.id } })).toBe(0);
  });

  it("looking at reported chat messages is itself recorded", async () => {
    const { a, b, owner, channelId } = await setup();
    const m = await say(a.id, channelId, "something reportable");
    expect((await fileReport(b.id, { targetType: "MESSAGE", targetId: m.id, reason: "HARASSMENT", details: null })).ok).toBe(true);
    const open = await db.contentReport.findMany({ where: { status: "OPEN" } });
    await recordPrivateReportView(owner.id, open);
    await recordPrivateReportView(owner.id, open); // again within the hour: one entry
    expect(await db.auditLog.count({ where: { action: "moderation.private_reports_viewed", actorId: owner.id } })).toBe(1);
    await recordPrivateReportView(owner.id, []);
  });
});
