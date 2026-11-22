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

  it("an owner or administrator is named as such when they join or leave", async () => {
    const { owner, g, channelId } = await setup();
    await joinGroup(owner.id, g.id);
    await leaveGroup(owner.id, g.id);
    expect(await systemLines(channelId)).toEqual(["Olivia Owner (administrator) joined the group", "Olivia Owner (administrator) left the group"]);
    expect(await db.auditLog.count({ where: { action: { in: ["group.member_joined", "group.member_left"] }, actorId: owner.id } })).toBe(2);
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
      "Alice is now the coordinator (assigned by the organization)",
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

describe("P1-1: no view into conversations from before an administrator joined", () => {
  it("an owner who joins sees the chat only from that moment; an ordinary member still sees the history", async () => {
    const { a, owner, g, channelId } = await setup();
    await say(a.id, channelId, "private plan from before");
    await pause(30);
    await joinGroup(owner.id, g.id);
    const dora = await createMember("Dora");
    await joinGroup(dora.id, g.id);
    await say(a.id, channelId, "hello everyone");

    const co = await connectAs(owner.id, "OWNER");
    const ownerView = await emit<JoinAnswer>(co, "channel:join", { channelId });
    expect(ownerView.ok).toBe(true);
    expect(bodies(ownerView.messages)).toEqual(["Olivia Owner (administrator) joined the group", "Dora joined the group", "hello everyone"]);
    expect(ownerView.hasMore).toBe(false);
    // Asking for older pages returns nothing from before the join either.
    const first = ownerView.messages![0]!;
    const older = await emit<JoinAnswer>(co, "history:more", { channelId, before: first.id });
    expect(bodies(older.messages)).toEqual([]);

    const cd = await connectAs(dora.id);
    const memberView = await emit<JoinAnswer>(cd, "channel:join", { channelId });
    expect(bodies(memberView.messages)).toContain("private plan from before");
  });

  it("leaving and joining again does not open the gap in between", async () => {
    const { a, owner, g, channelId } = await setup();
    await joinGroup(owner.id, g.id);
    await say(a.id, channelId, "while the owner was a member");
    await leaveGroup(owner.id, g.id);
    await say(a.id, channelId, "said while the owner was away");
    await pause(30);
    await joinGroup(owner.id, g.id);
    const access = (await channelAccess(db, owner.id, channelId))!;
    const page = await history(db, channelId, null, 50, access.historyFrom);
    expect(bodies(page.messages)).toEqual(["Olivia Owner (administrator) joined the group"]);
  });

  it("editing or deleting an earlier message is not sent to the administrator, and a quote of it is withheld", async () => {
    const { a, b, owner, g, channelId } = await setup();
    const old = await say(a.id, channelId, "the earlier secret");
    await pause(30);
    await joinGroup(owner.id, g.id);

    const [ca, cb, co] = [await connectAs(a.id), await connectAs(b.id), await connectAs(owner.id, "OWNER")];
    for (const c of [ca, cb, co]) await emit(c, "channel:join", { channelId });
    const ownerNew = collect(co, "message:new");
    const ownerUpdated = collect(co, "message:updated");
    const bobUpdated = collect(cb, "message:updated");
    const bobNew = collect(cb, "message:new");

    expect((await emit<{ ok: boolean }>(ca, "message:edit", { channelId, messageId: old.id, body: "the earlier secret, edited" })).ok).toBe(true);
    expect((await emit<{ ok: boolean }>(ca, "message:send", { channelId, body: "as I said", clientId: "corrective-chat-reply-1", replyToId: old.id, attachmentIds: [] })).ok).toBe(true);
    await pause();

    expect(bobUpdated.map((m) => m.body)).toEqual(["the earlier secret, edited"]);
    expect(ownerUpdated).toEqual([]); // never sent
    expect(bobNew[0]!.replyTo).toMatchObject({ authorName: "Alice", excerpt: "the earlier secret, edited" });
    expect(ownerNew).toHaveLength(1);
    expect(ownerNew[0]!.body).toBe("as I said");
    expect(ownerNew[0]!.replyTo).toMatchObject({ authorName: "", excerpt: "(a message from before you joined)" });
    expect(JSON.stringify([ownerNew, ownerUpdated])).not.toContain("secret");

    // The administrator cannot answer or report an earlier message by guessing its id.
    const viaReply = await emit<{ ok: boolean; message: ChatMessageDTO }>(co, "message:send", { channelId, body: "what was that?", clientId: "corrective-chat-reply-2", replyToId: old.id, attachmentIds: [] });
    expect(viaReply.message.replyTo).toBeNull();
    expect((await fileReport(owner.id, { targetType: "MESSAGE", targetId: old.id, reason: "OTHER", details: null })).ok).toBe(false);
    expect(await db.contentReport.count()).toBe(0);
  });

  it("chat attachments from before the join cannot be listed or downloaded by the administrator", async () => {
    const { a, owner, g, channelId } = await setup();
    const msg = await say(a.id, channelId, "see attached");
    const file = (scope: "CHAT_ATTACHMENT" | "GROUP_FILE", key: string, messageId?: string) =>
      db.storedFile.create({ data: { ownerId: a.id, scope, groupId: g.id, messageId, originalName: `${key}.pdf`, mimeType: "application/pdf", size: 10, sha256: key, storageKey: key } });
    const earlierAttachment = await file("CHAT_ATTACHMENT", "earlier-attachment", msg.id);
    const researchFile = await file("GROUP_FILE", "research-file");
    await pause(30);
    await joinGroup(owner.id, g.id);
    const laterAttachment = await file("CHAT_ATTACHMENT", "later-attachment");

    expect(await authorizeDownload(owner.id, earlierAttachment.id)).toBeNull();
    expect((await authorizeDownload(owner.id, laterAttachment.id))?.id).toBe(laterAttachment.id);
    expect((await authorizeDownload(owner.id, researchFile.id))?.id).toBe(researchFile.id); // shared research material, not conversation
    expect((await listGroupFiles(g.id, owner.id)).map((f) => f.originalName).sort()).toEqual(["later-attachment.pdf", "research-file.pdf"]);
    // Ordinary members are unaffected.
    expect((await authorizeDownload(a.id, earlierAttachment.id))?.id).toBe(earlierAttachment.id);
    expect(await listGroupFiles(g.id, a.id)).toHaveLength(3);
  });

  it("the unread badge never counts messages from before the administrator joined", async () => {
    const { a, owner, g, channelId } = await setup();
    await say(a.id, channelId, "earlier one");
    await say(a.id, channelId, "earlier two");
    await pause(30);
    await joinGroup(owner.id, g.id);
    expect(await groupUnread(g.id, owner.id)).toBe(0);
    expect((await myGroups(owner.id))[0]!.unread).toBe(0);
    await say(a.id, channelId, "after the join");
    expect((await myGroups(owner.id))[0]!.unread).toBe(1);
  });

  it("an administrator who helped found the group sees it from its creation", async () => {
    const [a, b] = [await createMember("Alice"), await createMember("Bob")];
    const admin = await createUser({ email: "adam@example.test", name: "Adam Admin", role: "ADMIN", totp: true, profile: true });
    const res = await createIdea(a.id, {
      title: "Weekend tutoring", summary: "Adults returning to school need help with math and writing in the evenings.", category: "ONLINE_SERVICES",
      description: null, problem: null, proposal: null, customers: null, revenueModel: null, skillsNeeded: null, timeEstimate: null, links: [],
    });
    if (!res.ok) throw new Error(res.error);
    await endorseIdea(b.id, res.id);
    await endorseIdea(admin.id, res.id); // counts like any member; the group forms with the administrator in it
    const g = await db.researchGroup.findUniqueOrThrow({ where: { ideaId: res.id }, include: { channels: true } });
    const channelId = g.channels[0]!.id;
    const first = await say(a.id, channelId, "first message of the group");
    const access = (await channelAccess(db, admin.id, channelId))!;
    expect(bodies((await history(db, channelId, null, 50, access.historyFrom)).messages)).toEqual(["first message of the group"]);
    // Their messages carry the administrator label for everyone.
    expect((await say(admin.id, channelId, "hello")).author).toMatchObject({ name: "Adam Admin", staff: true });
    expect(first.author).toMatchObject({ staff: false });
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
