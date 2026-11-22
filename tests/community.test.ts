import { createServer, type Server as HttpServer } from "node:http";
import { readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { io as ioClient, type Socket } from "socket.io-client";
import type { SMTPServer } from "smtp-server";
import { db } from "@/lib/db";
import { resetEnvCache } from "@/lib/env";
import { resetEmailTransport } from "@/lib/email";
import { SESSION_COOKIE } from "@/lib/auth/constants";
import { requireAdmin, requireMember } from "@/lib/auth/guard";
import { createSession } from "@/lib/auth/session";
import { lookupSession } from "@/lib/auth/session-core";
import { activateAccount, sendInvitation, suspendUser } from "@/server/accounts";
import { updateApplicationStatus } from "@/server/admin/applications";
import { endorseIdea, createIdea, withdrawEndorsement } from "@/server/community/ideas";
import { joinGroup, leaveGroup, removeMember } from "@/server/community/groups";
import { addComment } from "@/server/community/comments";
import { authorizeDownload, storeUpload } from "@/server/community/files";
import { fileReport } from "@/server/community/reports";
import { startMeeting, joinMeeting } from "@/server/community/meetings";
import { notify } from "@/server/community/notifications";
import { saveSetting } from "@/server/settings";
import { channelAccess, sendMessage, editMessage } from "@/realtime/chat-service";
import { attachRealtime, type RealtimeHandle } from "@/realtime/server";
import { runRetention } from "@/ops/retention";
import { createBackup, restoreBackup } from "@/ops/backup";
import { deploy } from "../scripts/migrate";
import { startDevMail } from "../scripts/dev-mail";
import { cookieJar, createLegacyApplication, createMember, createUser, resetDb, signIn } from "./helpers";

const idea = (title = "Neighborhood bookkeeping service") => ({
  title,
  summary: "Small local shops need simple, affordable monthly bookkeeping help.",
  category: "ONLINE_SERVICES" as const,
  description: null, problem: null, proposal: null, customers: null, revenueModel: null, skillsNeeded: null, timeEstimate: null,
  links: [],
});

async function threeMembersAndIdea() {
  const [a, b, c] = [await createMember("Alice"), await createMember("Bob"), await createMember("Cara")];
  const res = await createIdea(a.id, idea());
  if (!res.ok) throw new Error(res.error);
  return { a, b, c, ideaId: res.id };
}

async function groupWithMembers() {
  const { a, b, c, ideaId } = await threeMembersAndIdea();
  await endorseIdea(b.id, ideaId);
  const r = await endorseIdea(c.id, ideaId);
  if (!r.ok || !r.groupCreated) throw new Error("group not created");
  const group = await db.researchGroup.findUniqueOrThrow({ where: { ideaId }, include: { channels: true } });
  return { a, b, c, ideaId, group, channelId: group.channels[0]!.id };
}

beforeEach(async () => {
  await resetDb();
  cookieJar.clear();
});

afterAll(async () => {
  await db.$disconnect();
});

describe("idea endorsements and automatic group creation", () => {
  it("creates exactly one group when two members other than the author endorse", async () => {
    const { a, b, c, ideaId } = await threeMembersAndIdea();
    const first = await endorseIdea(b.id, ideaId);
    expect(first.ok && first.groupCreated).toBe(null);
    expect(await db.researchGroup.count()).toBe(0);

    const second = await endorseIdea(c.id, ideaId);
    expect(second.ok && second.groupCreated).toBeTruthy();
    const groups = await db.researchGroup.findMany({ include: { memberships: true, channels: true } });
    expect(groups).toHaveLength(1);
    const g = groups[0]!;
    expect(g.ideaId).toBe(ideaId);
    expect(g.name).toBe("Neighborhood bookkeeping service");
    expect(g.channels.filter((ch) => ch.isDefault)).toHaveLength(1);
    const roles = Object.fromEntries(g.memberships.map((m) => [m.userId, m.role]));
    expect(roles).toEqual({ [a.id]: "COORDINATOR", [b.id]: "MEMBER", [c.id]: "MEMBER" });
    expect(g.memberCount).toBe(3);
    expect((await db.businessIdea.findUniqueOrThrow({ where: { id: ideaId } })).status).toBe("GROUP_FORMED");
    expect(await db.notification.count({ where: { userId: a.id, type: "IDEA_GROUP_CREATED" } })).toBe(1);
    expect(await db.notification.count({ where: { type: "GROUP_MEMBERSHIP", userId: { in: [b.id, c.id] } } })).toBe(2);
  });

  it("enforces endorsement rules (no self, no duplicates, no inactive members)", async () => {
    const { a, b, c, ideaId } = await threeMembersAndIdea();
    expect((await endorseIdea(a.id, ideaId)).ok).toBe(false);
    await endorseIdea(b.id, ideaId);
    await endorseIdea(b.id, ideaId);
    expect(await db.ideaEndorsement.count({ where: { ideaId } })).toBe(1);
    await db.user.update({ where: { id: c.id }, data: { status: "SUSPENDED" } });
    expect((await endorseIdea(c.id, ideaId)).ok).toBe(false);
    expect(await db.researchGroup.count()).toBe(0);
  });

  it("does not count endorsers who were suspended afterwards", async () => {
    const { b, c, ideaId } = await threeMembersAndIdea();
    const d = await createMember("Dan");
    await endorseIdea(b.id, ideaId);
    await db.user.update({ where: { id: b.id }, data: { status: "SUSPENDED" } });
    await endorseIdea(c.id, ideaId);
    expect(await db.researchGroup.count()).toBe(0);
    await endorseIdea(d.id, ideaId);
    const g = await db.researchGroup.findFirstOrThrow({ include: { memberships: true } });
    expect(g.memberships.map((m) => m.userId).sort()).not.toContain(b.id);
  });

  it("simultaneous endorsements create exactly one group", async () => {
    const author = await createMember("Author");
    const res = await createIdea(author.id, idea("Concurrent idea"));
    if (!res.ok) throw new Error();
    const endorsers = await Promise.all(["E1", "E2", "E3", "E4", "E5", "E6"].map((n) => createMember(n)));
    const results = await Promise.all(endorsers.map((e) => endorseIdea(e.id, res.id)));
    // Requests processed after the group formed are refused with a "join the group" hint.
    for (const r of results) if (!r.ok) expect(r.error).toMatch(/already has a research group/);
    expect(results.filter((r) => r.ok)).toHaveLength(2);
    expect(await db.researchGroup.count({ where: { ideaId: res.id } })).toBe(1);
    expect(results.filter((r) => r.ok && r.groupCreated)).toHaveLength(1);
    expect((await db.businessIdea.findUniqueOrThrow({ where: { id: res.id } })).endorsementCount).toBe(2);
  });

  it("uses the configured threshold", async () => {
    const owner = await createUser({ email: "owner@example.test" });
    await saveSetting(owner.id, "community.endorsementThreshold", 3);
    const { ideaId, b, c } = await threeMembersAndIdea();
    await endorseIdea(b.id, ideaId);
    await endorseIdea(c.id, ideaId);
    expect(await db.researchGroup.count()).toBe(0);
    await endorseIdea((await createMember("Dee")).id, ideaId);
    expect(await db.researchGroup.count()).toBe(1);
  });

  it("withdrawing before creation lowers the count; after creation the group stays", async () => {
    const { b, c, ideaId } = await threeMembersAndIdea();
    await endorseIdea(b.id, ideaId);
    await withdrawEndorsement(b.id, ideaId);
    expect((await db.businessIdea.findUniqueOrThrow({ where: { id: ideaId } })).endorsementCount).toBe(0);
    await endorseIdea(b.id, ideaId);
    await endorseIdea(c.id, ideaId);
    await withdrawEndorsement(c.id, ideaId);
    expect(await db.researchGroup.count()).toBe(1);
  });
});

describe("group membership", () => {
  it("join, leave and rejoin; coordinator succession; archive when empty", async () => {
    const { a, b, c, group } = await groupWithMembers();
    const d = await createMember("Dora");
    expect((await joinGroup(d.id, group.id)).ok).toBe(true);
    await leaveGroup(d.id, group.id);
    expect((await db.groupMembership.findFirstOrThrow({ where: { userId: d.id } })).status).toBe("LEFT");
    expect((await joinGroup(d.id, group.id)).ok).toBe(true);
    expect((await db.researchGroup.findUniqueOrThrow({ where: { id: group.id } })).memberCount).toBe(4);
    // Leaving the group never affects organization membership.
    await leaveGroup(d.id, group.id);
    expect((await db.user.findUniqueOrThrow({ where: { id: d.id } })).status).toBe("ACTIVE");

    await leaveGroup(a.id, group.id);
    const coord = await db.groupMembership.findFirstOrThrow({ where: { groupId: group.id, role: "COORDINATOR", status: "ACTIVE" } });
    expect(coord.userId).toBe(b.id); // longest-standing remaining member
    expect(await db.notification.count({ where: { userId: b.id, type: "COORDINATOR_ASSIGNED" } })).toBe(1);

    await leaveGroup(b.id, group.id);
    await leaveGroup(c.id, group.id);
    const g = await db.researchGroup.findUniqueOrThrow({ where: { id: group.id } });
    expect(g.status).toBe("ARCHIVED");
    expect(g.adminManaged).toBe(true);
  });

  it("a removed member cannot rejoin by themselves", async () => {
    const { a, c, group } = await groupWithMembers();
    expect((await removeMember(a.id, group.id, c.id)).ok).toBe(true);
    expect((await joinGroup(c.id, group.id)).ok).toBe(false);
  });
});

describe("chat authorization and isolation", () => {
  it("only active members of the group can access its channel", async () => {
    const { a, group, channelId } = await groupWithMembers();
    const outsider = await createMember("Olive");
    expect(await channelAccess(db, a.id, channelId)).not.toBeNull();
    expect(await channelAccess(db, outsider.id, channelId)).toBeNull();
    await joinGroup(outsider.id, group.id);
    expect(await channelAccess(db, outsider.id, channelId)).not.toBeNull();
    await leaveGroup(outsider.id, group.id);
    expect(await channelAccess(db, outsider.id, channelId)).toBeNull();
    await db.researchGroup.update({ where: { id: group.id }, data: { suspendedAt: new Date() } });
    expect(await channelAccess(db, a.id, channelId)).toBeNull();
  });

  it("messages persist, resends are idempotent and only authors can edit", async () => {
    const { a, b, channelId } = await groupWithMembers();
    const access = (await channelAccess(db, a.id, channelId))!;
    const m1 = await sendMessage(db, a.id, access, { channelId, body: "Hello <b>team</b>", clientId: "client-001", attachmentIds: [] });
    const again = await sendMessage(db, a.id, access, { channelId, body: "Hello <b>team</b>", clientId: "client-001", attachmentIds: [] });
    expect(m1.ok && again.ok && again.duplicate).toBe(true);
    expect(await db.chatMessage.count({ where: { channelId } })).toBe(1);
    const stored = await db.chatMessage.findFirstOrThrow();
    expect(stored.body).toBe("Hello <b>team</b>"); // stored as text; rendered escaped by React
    const bAccess = (await channelAccess(db, b.id, channelId))!;
    expect((await editMessage(db, b.id, bAccess, stored.id, "hijack")).ok).toBe(false);
  });

  it("attachments from another group cannot be attached", async () => {
    const g1 = await groupWithMembers();
    const author2 = await createMember("Zed");
    const i2 = await createIdea(author2.id, idea("Second idea"));
    if (!i2.ok) throw new Error();
    await endorseIdea(g1.a.id, i2.id);
    await endorseIdea(g1.b.id, i2.id);
    const g2 = await db.researchGroup.findUniqueOrThrow({ where: { ideaId: i2.id } });
    const png = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000", "hex");
    const up = await storeUpload(g1.a.id, { scope: "CHAT_ATTACHMENT", groupId: g2.id, name: "x.gif", bytes: Buffer.concat([Buffer.from("GIF89a"), png]) });
    expect(up.ok).toBe(true);
    const access = (await channelAccess(db, g1.a.id, g1.channelId))!;
    const res = await sendMessage(db, g1.a.id, access, { channelId: g1.channelId, body: "see file", clientId: "client-xyz", attachmentIds: [up.ok ? up.file.id : ""] });
    expect(res.ok).toBe(false);
  });
});

describe("files", () => {
  it("rejects disguised files and uploads by non-members; downloads are member-only", async () => {
    const { a, group } = await groupWithMembers();
    const outsider = await createMember("Owen");
    expect((await storeUpload(a.id, { scope: "GROUP_FILE", groupId: group.id, name: "a.svg", bytes: Buffer.from("<svg onload=alert(1)>") })).ok).toBe(false);
    expect((await storeUpload(a.id, { scope: "GROUP_FILE", groupId: group.id, name: "readme.txt", bytes: Buffer.from("<html><script>x</script>") })).ok).toBe(false);
    expect((await storeUpload(outsider.id, { scope: "GROUP_FILE", groupId: group.id, name: "n.txt", bytes: Buffer.from("plain notes") })).ok).toBe(false);
    const ok = await storeUpload(a.id, { scope: "GROUP_FILE", groupId: group.id, name: "notes.txt", bytes: Buffer.from("Market notes") });
    expect(ok.ok).toBe(true);
    const id = ok.ok ? ok.file.id : "";
    expect(await authorizeDownload(a.id, id)).not.toBeNull();
    expect(await authorizeDownload(outsider.id, id)).toBeNull();
  });
});

describe("reports, meetings and notifications", () => {
  it("non-members cannot report (and so cannot read) private chat messages", async () => {
    const { a, channelId } = await groupWithMembers();
    const access = (await channelAccess(db, a.id, channelId))!;
    const m = await sendMessage(db, a.id, access, { channelId, body: "private plan", clientId: "client-002", attachmentIds: [] });
    const outsider = await createMember("Pat");
    const id = m.ok ? m.message.id : "";
    expect((await fileReport(outsider.id, { targetType: "MESSAGE", targetId: id, reason: "SPAM", details: null })).ok).toBe(false);
    const memberReport = await fileReport((await db.groupMembership.findFirstOrThrow({ where: { role: "MEMBER" } })).userId, { targetType: "MESSAGE", targetId: id, reason: "SPAM", details: null });
    expect(memberReport.ok).toBe(true);
    expect((await db.contentReport.findFirstOrThrow()).snapshot).toBe("private plan");
  });

  it("meeting links are only given to current members", async () => {
    const { a, group } = await groupWithMembers();
    const outsider = await createMember("Quinn");
    const m = await startMeeting(a.id, group.id, { kind: "VOICE", title: null, joinUrl: "https://meet.google.com/abc-defg-hij" });
    expect(m.ok).toBe(true);
    await expect(joinMeeting(outsider.id, group.id, m.ok ? m.id : "")).rejects.toThrow();
    const ok = await joinMeeting(a.id, group.id, m.ok ? m.id : "");
    expect(ok.ok && ok.url).toBe("https://meet.google.com/abc-defg-hij");
    expect(await db.notification.count({ where: { type: "MEETING_STARTED" } })).toBe(2);
  });

  it("coalesces repeated notifications and respects preferences", async () => {
    const u = await createMember("Rae");
    await notify([u.id], { type: "IDEA_COMMENT", title: "New comments", dedupeKey: "k1" });
    await notify([u.id], { type: "IDEA_COMMENT", title: "New comments", dedupeKey: "k1" });
    const n = await db.notification.findMany({ where: { userId: u.id } });
    expect(n).toHaveLength(1);
    expect(n[0]!.count).toBe(2);
    await db.notificationPreference.create({ data: { userId: u.id, type: "GROUP_STATUS", inApp: false, email: false } });
    await notify([u.id], { type: "GROUP_STATUS", title: "x" });
    expect(await db.notification.count({ where: { userId: u.id, type: "GROUP_STATUS" } })).toBe(0);
  });

  it("replying notifies the comment author and the idea author", async () => {
    const { a, b, ideaId } = await threeMembersAndIdea();
    const c1 = await addComment(b.id, { ideaId }, { body: "Question?", parentId: null });
    await addComment(a.id, { ideaId }, { body: "Answer", parentId: c1.ok ? c1.id : null });
    expect(await db.notification.count({ where: { userId: a.id, type: "IDEA_COMMENT" } })).toBe(1);
    expect(await db.notification.count({ where: { userId: b.id, type: "COMMENT_REPLY" } })).toBe(1);
  });
});

describe("member access guard", () => {
  it("requires an active account with a profile; suspended members are locked out", async () => {
    const m = await createMember("Sam");
    await signIn(m.id);
    expect((await requireMember()).id).toBe(m.id);
    const owner = await createUser({ email: "own@example.test" });
    await suspendUser(owner.id, m.id, "test");
    await expect(requireMember()).rejects.toThrow(/REDIRECT:\/login/);
    expect(await db.session.count({ where: { userId: m.id, revokedAt: null } })).toBe(0);
  });

  it("ADMIN cannot use owner-only permissions; members cannot open admin", async () => {
    const admin = await createUser({ email: "adm@example.test", role: "ADMIN", totp: true });
    await signIn(admin.id, "ADMIN");
    await expect(requireAdmin("compensation.view")).rejects.toThrow("REDIRECT:/admin/no-access");
    await expect(requireAdmin("moderation.act")).resolves.toBeTruthy();
    const m = await createMember("Tia");
    await signIn(m.id);
    await expect(requireAdmin()).rejects.toThrow("REDIRECT:/community");
  });
});

// Invitations are the older way in (before self-registration). They still work for accounts invited earlier.
describe("legacy invitation, activation and email delivery", () => {
  let smtp: SMTPServer;
  const mailDir = path.join(tmpdir(), `cowork-test-mail-${Date.now()}`);

  beforeAll(async () => {
    smtp = await startDevMail({ port: 2727, dir: mailDir, quiet: true });
    process.env.SMTP_HOST = "127.0.0.1";
    process.env.SMTP_PORT = "2727";
    process.env.EMAIL_FROM = "no-reply@cowork.test";
    process.env.SEND_APPLICANT_CONFIRMATION = "false";
    resetEnvCache();
    resetEmailTransport();
  });
  afterAll(async () => {
    await new Promise<void>((r) => smtp.close(() => r()));
    process.env.SMTP_HOST = "";
    resetEnvCache();
    resetEmailTransport();
    rmSync(mailDir, { recursive: true, force: true });
  });

  function lastMailTo(addr: string) {
    const files = readdirSync(mailDir).filter((f) => f.endsWith(".json")).sort();
    for (const f of files.reverse()) {
      const meta = JSON.parse(readFileSync(path.join(mailDir, f), "utf8")) as { to: string[] };
      if (meta.to.includes(addr)) return readFileSync(path.join(mailDir, f.replace(".json", ".eml")), "utf8");
    }
    throw new Error(`no mail to ${addr}`);
  }

  it("accepted applicant receives a single-use link and can activate once", async () => {
    const owner = await createUser({ email: "owner2@example.test" });
    const { application: app } = await createLegacyApplication("new@example.test");
    // Not accepted yet: no invitation possible.
    expect((await sendInvitation(owner.id, app.id, { subject: "s", body: "{{activationLink}}" })).ok).toBe(false);
    await updateApplicationStatus(owner.id, app.id, "ACCEPTED");
    const sent = await sendInvitation(owner.id, app.id, { subject: "Activate", body: "Link: {{activationLink}}" });
    expect(sent.ok).toBe(true);
    const delivery = await db.emailDelivery.findFirstOrThrow({ where: { templateKey: "account_invitation" } });
    // The test mail server is local: logged as captured, never as delivered.
    expect(delivery.status).toBe("CAPTURED_LOCALLY");
    expect(delivery.sentById).toBe(owner.id);
    const mail = lastMailTo("new@example.test").replace(/=\r?\n/g, "");
    const token = /\/activate\/([A-Za-z0-9_-]+)/.exec(mail)?.[1];
    expect(token).toBeTruthy();
    // The raw token is never stored.
    expect(await db.accountToken.count({ where: { tokenHash: token! } })).toBe(0);

    const act = await activateAccount(token!, { password: "a-strong-password-1", displayName: "Newbie" });
    expect(act.ok).toBe(true);
    const user = await db.user.findUniqueOrThrow({ where: { email: "new@example.test" }, include: { profile: true } });
    expect(user.status).toBe("ACTIVE");
    expect(user.emailVerifiedAt).not.toBeNull();
    expect(user.profile?.displayName).toBe("Newbie");
    // An invited person was already accepted: activation includes community access.
    expect(user.membershipStatus).toBe("ACTIVE");
    expect((await activateAccount(token!, { password: "a-strong-password-1", displayName: "Again" })).ok).toBe(false);
  });

  it("expired activation tokens are rejected", async () => {
    const owner = await createUser({ email: "owner3@example.test" });
    const { application: app } = await createLegacyApplication("late@example.test");
    await updateApplicationStatus(owner.id, app.id, "ACCEPTED");
    await sendInvitation(owner.id, app.id, { subject: "Activate", body: "{{activationLink}}" });
    const token = /\/activate\/([A-Za-z0-9_-]+)/.exec(lastMailTo("late@example.test").replace(/=\r?\n/g, ""))![1]!;
    await db.accountToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    const res = await activateAccount(token, { password: "a-strong-password-1", displayName: "Late" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/expired/);
  });

  it("records provider failures honestly", async () => {
    process.env.SMTP_PORT = "1"; // nothing listens there
    resetEnvCache();
    resetEmailTransport();
    const owner = await createUser({ email: "owner4@example.test" });
    const { application: app } = await createLegacyApplication("fail@example.test");
    await updateApplicationStatus(owner.id, app.id, "ACCEPTED");
    const res = await sendInvitation(owner.id, app.id, { subject: "Activate", body: "{{activationLink}}" });
    expect(res.ok).toBe(false);
    expect((await db.emailDelivery.findFirstOrThrow({ where: { templateKey: "account_invitation" } })).status).toBe("SERVER_UNAVAILABLE");
    // The unsent token is invalidated.
    expect(await db.accountToken.count({ where: { usedAt: null } })).toBe(0);
    process.env.SMTP_PORT = "2727";
    resetEnvCache();
    resetEmailTransport();
  });
});

describe("retention", () => {
  it("dry run counts without deleting; a real run deletes only expired categories", async () => {
    const u = await createMember("Uma");
    const old = new Date(Date.now() - 400 * 86_400_000);
    await db.notification.create({ data: { userId: u.id, type: "ADMIN_MESSAGE", title: "old", readAt: old } });
    await db.notification.create({ data: { userId: u.id, type: "ADMIN_MESSAGE", title: "unread" } });
    const dir = path.join(tmpdir(), "cowork-test-storage");
    const dry = await runRetention(db, { dryRun: true, storageDir: dir });
    expect(dry.categories.find((c) => c.key === "notifications")?.count).toBe(1);
    expect(await db.notification.count()).toBe(2);
    await runRetention(db, { dryRun: false, storageDir: dir });
    expect(await db.notification.count()).toBe(1);
    expect(await db.auditLog.count({ where: { action: "retention.purge" } })).toBe(1);
    expect(await db.user.count()).toBe(1);
  });
});

describe("backup and restore", () => {
  it("restores into a separate database and verifies every table; refuses the live database", async () => {
    await groupWithMembers();
    const url = process.env.DATABASE_URL!;
    const dir = path.join(tmpdir(), `cowork-test-backups-${Date.now()}`);
    const b = await createBackup({ connectionString: url, dir });
    expect(b.manifest.tables.find((t) => t.name === "ResearchGroup")?.rows).toBe(1);
    await expect(
      restoreBackup({ file: b.file, serverConnectionString: url, targetDb: "cowork_test", protectedDbs: ["cowork_test"], migrate: (cs) => deploy(cs, () => {}) }),
    ).rejects.toThrow(/Refusing/);
    const r = await restoreBackup({
      file: b.file,
      serverConnectionString: url,
      targetDb: "cowork_restore_test",
      protectedDbs: ["cowork_test"],
      replaceExisting: true,
      migrate: (cs) => deploy(cs, () => {}),
    });
    expect(r.ok).toBe(true);
    expect(r.tables.find((t) => t.name === "GroupMembership")?.restored).toBe(3);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("realtime server", () => {
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
  afterAll(async () => {
    for (const c of clients) c.close();
    await rt.close();
  });

  async function connect(token?: string, origin = `http://127.0.0.1:${port}`) {
    const c = ioClient(`http://127.0.0.1:${port}`, {
      path: "/socket.io",
      transports: ["websocket"],
      extraHeaders: { ...(token ? { cookie: `${SESSION_COOKIE}=${encodeURIComponent(token)}` } : {}), origin },
      reconnection: false,
    });
    clients.push(c);
    return new Promise<{ c: Socket; error?: string }>((resolve) => {
      c.on("connect", () => resolve({ c }));
      c.on("connect_error", (e) => resolve({ c, error: e.message }));
    });
  }
  const emit = (c: Socket, ev: string, data: unknown) => new Promise<Record<string, unknown>>((r) => c.emit(ev, data, (res: Record<string, unknown>) => r(res)));

  it("refuses unauthenticated, suspended and cross-site connections", async () => {
    expect((await connect()).error).toBe("unauthorized");
    const m = await createMember("Vic");
    const s = await createSession(m.id, "MEMBER");
    expect((await connect(s.token, "https://evil.example")).error).toBeTruthy();
    await db.user.update({ where: { id: m.id }, data: { status: "SUSPENDED" } });
    expect((await connect(s.token)).error).toBe("unauthorized");
    expect(await lookupSession(db, s.token)).not.toBeNull();
  });

  it("delivers messages in real time to members only, and revokes access on leave", async () => {
    const { a, b, group, channelId } = await groupWithMembers();
    const outsider = await createMember("Wes");
    const [ta, tb, to] = await Promise.all([a, b, outsider].map(async (u) => (await createSession(u.id, "MEMBER")).token));
    const ca = (await connect(ta)).c;
    const cb = (await connect(tb)).c;
    const co = (await connect(to)).c;
    expect((await emit(ca, "channel:join", { channelId })).ok).toBe(true);
    expect((await emit(cb, "channel:join", { channelId })).ok).toBe(true);
    expect((await emit(co, "channel:join", { channelId })).ok).toBe(false);

    const received = new Promise<{ body: string }>((r) => cb.once("message:new", r));
    const sent = await emit(ca, "message:send", { channelId, body: "Real-time hello", clientId: "rt-client-1", attachmentIds: [] });
    expect(sent.ok).toBe(true);
    expect((await received).body).toBe("Real-time hello");
    // An outsider cannot post by guessing the channel id.
    expect((await emit(co, "message:send", { channelId, body: "intrusion", clientId: "rt-client-2", attachmentIds: [] })).ok).toBe(false);
    expect(await db.chatMessage.count({ where: { channelId } })).toBe(1);

    const revoked = new Promise<{ groupId: string }>((r) => cb.once("access:revoked", r));
    await leaveGroup(b.id, group.id);
    expect((await revoked).groupId).toBe(group.id);
    expect((await emit(cb, "message:send", { channelId, body: "after leaving", clientId: "rt-client-3", attachmentIds: [] })).ok).toBe(false);
  });
});
