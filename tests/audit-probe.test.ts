/**
 * AUDIT DIAGNOSTIC (temporary; isolated test database only).
 * Each test REPORTS what happens in a realistic failure scenario; nothing here
 * asserts the desired behaviour, so results are printed as "PROBE ..." lines.
 *
 * Skipped in the normal test run. To run it:
 *   AUDIT_PROBES=1 npx vitest run tests/audit-probe.test.ts --silent=false --reporter=verbose
 */
import { afterAll, beforeEach, describe, it } from "vitest";
import { db } from "@/lib/db";
import { setMembership, suspendUser, reactivateUser } from "@/server/accounts";
import { updateApplicationStatus } from "@/server/admin/applications";
import { createIdea, endorseIdea } from "@/server/community/ideas";
import { joinGroup, leaveGroup, adminSetGroupState } from "@/server/community/groups";
import { groupAccess, activeMemberIds } from "@/server/community/access";
import { channelAccess } from "@/realtime/chat-service";
import { lookupSession } from "@/lib/auth/session-core";
import { createSession } from "@/lib/auth/session";
import { cookieJar, createMember, createUser, resetDb, submitTestApplication } from "./helpers";

const idea = (title = "Probe idea") => ({
  title,
  summary: "Small local shops need simple, affordable monthly bookkeeping help.",
  category: "ONLINE_SERVICES" as const,
  description: null, problem: null, proposal: null, customers: null, revenueModel: null, skillsNeeded: null, timeEstimate: null,
  links: [],
});
const say = (label: string, data: unknown) => console.log(`PROBE ${label}: ${JSON.stringify(data)}`);

async function group() {
  const [a, b, c] = [await createMember("Alice"), await createMember("Bob"), await createMember("Cara")];
  const res = await createIdea(a.id, idea());
  if (!res.ok) throw new Error(res.error);
  await endorseIdea(b.id, res.id);
  await endorseIdea(c.id, res.id);
  const g = await db.researchGroup.findUniqueOrThrow({ where: { ideaId: res.id }, include: { channels: true } });
  return { a, b, c, g, ideaId: res.id };
}
const snapshot = async (groupId: string) => {
  const g = await db.researchGroup.findUniqueOrThrow({ where: { id: groupId }, include: { memberships: { include: { user: { select: { name: true, status: true, membershipStatus: true } } } } } });
  return { status: g.status, adminManaged: g.adminManaged, memberCount: g.memberCount, members: g.memberships.map((m) => `${m.user.name}:${m.role}:${m.status}:${m.user.status}/${m.user.membershipStatus}`) };
};

beforeEach(async () => {
  await resetDb();
  cookieJar.clear();
});
afterAll(async () => {
  await db.$disconnect();
});

describe.skipIf(!process.env.AUDIT_PROBES)("audit probes", () => {
  it("1. the only coordinator's account is suspended", async () => {
    const owner = await createUser({ totp: true });
    const { a, g } = await group();
    await suspendUser(owner.id, a.id, "probe");
    say("1 after suspending coordinator", await snapshot(g.id));
    await reactivateUser(owner.id, a.id);
    say("1 after reactivating", await snapshot(g.id));
  });

  it("2. the only coordinator's community membership is removed (REVOKED)", async () => {
    const owner = await createUser({ totp: true });
    const { a, b, g } = await group();
    await setMembership(owner.id, a.id, "REVOKED");
    say("2 after revoking coordinator", await snapshot(g.id));
    say("2 revoked person: groupAccess.isMember", (await groupAccess(g.id, a.id))?.isMember);
    say("2 revoked person: channelAccess", (await channelAccess(db, a.id, g.channels[0]!.id)) !== null);
    say("2 notification recipients include revoked person", (await activeMemberIds(g.id)).includes(a.id));
    // Then a member leaves: does succession create a second coordinator?
    await leaveGroup(b.id, g.id);
    say("2 after another member leaves", await snapshot(g.id));
    await setMembership(owner.id, a.id, "ACTIVE");
    say("2 after membership restored", await snapshot(g.id));
  });

  it("3. the last two members leave at the same moment", { timeout: 120_000 }, async () => {
    let odd = 0;
    let errors = 0;
    for (let i = 0; i < 12; i++) {
      await resetDb();
      const { a, b, c, g } = await group();
      await leaveGroup(c.id, g.id);
      const rs = await Promise.allSettled([leaveGroup(a.id, g.id), leaveGroup(b.id, g.id)]);
      errors += rs.filter((r) => r.status === "rejected").length;
      if (rs.some((r) => r.status === "rejected") && errors === 1) say("3 first error", String((rs.find((r) => r.status === "rejected") as PromiseRejectedResult).reason).slice(0, 160));
      const s = await snapshot(g.id);
      const active = s.members.filter((m) => m.includes(":ACTIVE:")).length;
      if ((active === 0 && (s.status !== "ARCHIVED" || s.memberCount !== 0)) || s.memberCount !== active) {
        odd++;
        if (odd === 1) say("3 inconsistent example", s);
      }
    }
    say("3 runs with an empty group that is NOT archived or has a wrong count (of 12)", odd);
    say("3 leave requests that failed with a database error (of 24)", errors);
  });

  it("4. coordinator and one member leave at the same moment (others remain)", { timeout: 120_000 }, async () => {
    let odd = 0;
    let errors = 0;
    for (let i = 0; i < 6; i++) {
      await resetDb();
      const { a, b, g } = await group();
      const rs = await Promise.allSettled([leaveGroup(a.id, g.id), leaveGroup(b.id, g.id)]);
      errors += rs.filter((r) => r.status === "rejected").length;
      const s = await snapshot(g.id);
      const coords = s.members.filter((m) => m.includes(":COORDINATOR:ACTIVE:")).length;
      const active = s.members.filter((m) => m.includes(":ACTIVE:")).length;
      if (coords !== 1 || s.memberCount !== active) {
        odd++;
        if (odd === 1) say("4 inconsistent example", s);
      }
    }
    say("4 runs without exactly one active coordinator or with a wrong count (of 6)", odd);
    say("4 leave requests that failed with a database error (of 12)", errors);
  });

  it("5. two administrators decide the same application at the same moment", async () => {
    const owner = await createUser({ totp: true });
    const admin2 = await createUser({ email: "second@example.test", role: "ADMIN", totp: true });
    const { user, application } = await submitTestApplication({ fullName: "Ada Example" });
    await updateApplicationStatus(owner.id, application.id, "UNDER_REVIEW");
    const res = await Promise.allSettled([
      updateApplicationStatus(owner.id, application.id, "ACCEPTED"),
      updateApplicationStatus(admin2.id, application.id, "DECLINED"),
    ]);
    const app = await db.application.findUniqueOrThrow({ where: { id: application.id } });
    const u = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    say("5 results", res.map((r) => (r.status === "fulfilled" ? r.value : `rejected: ${(r.reason as Error).message.slice(0, 80)}`)));
    say("5 final", { application: app.status, membership: u.membershipStatus, participants: await db.participant.count(), profiles: await db.memberProfile.count() });
  });

  it("6. a declined application is later accepted; an accepted one is later declined", async () => {
    const owner = await createUser({ totp: true });
    const { user, application } = await submitTestApplication({ fullName: "Ada Example" });
    await updateApplicationStatus(owner.id, application.id, "UNDER_REVIEW");
    await updateApplicationStatus(owner.id, application.id, "ACCEPTED");
    const back = await updateApplicationStatus(owner.id, application.id, "DECLINED");
    const u = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    say("6 accepted -> declined", { result: back, application: (await db.application.findUniqueOrThrow({ where: { id: application.id } })).status, membership: u.membershipStatus });
  });

  it("7. a session opened before suspension / membership removal", async () => {
    const owner = await createUser({ totp: true });
    const m = await createMember("Dora");
    const s = await createSession(m.id, "MEMBER", { mfaVerified: true });
    await setMembership(owner.id, m.id, "SUSPENDED");
    const paused = await lookupSession(db, s.token);
    say("7 paused member session", paused ? { found: true, communityAccess: paused.user.communityAccess } : null);
    const s2 = await createSession(m.id, "MEMBER", { mfaVerified: true });
    const again = await lookupSession(db, s2.token);
    say("7 paused member signs in again", again ? { found: true, communityAccess: again.user.communityAccess } : null);
    await setMembership(owner.id, m.id, "ACTIVE");
    await suspendUser(owner.id, m.id, "probe");
    const s3 = await createSession(m.id, "MEMBER", { mfaVerified: true }).catch(() => null);
    const sus = s3 ? await lookupSession(db, s3.token) : null;
    say("7 suspended account, old session", (await lookupSession(db, s2.token)) ? "still found" : null);
    say("7 suspended account, new session", sus ? { found: true, status: sus.user.status, communityAccess: sus.user.communityAccess } : null);
  });

  it("8. an archived group with no members is reopened, then someone joins", async () => {
    const owner = await createUser({ totp: true });
    const { a, b, c, g } = await group();
    for (const u of [a, b, c]) await leaveGroup(u.id, g.id);
    say("8 after everyone left", await snapshot(g.id));
    await adminSetGroupState(owner.id, g.id, "reopen");
    say("8 after admin reopen", await snapshot(g.id));
    const d = await createMember("Dora");
    say("8 join result", await joinGroup(d.id, g.id));
    say("8 after a new member joins", await snapshot(g.id));
  });

  it("10. the owner presses Back up now", async () => {
    const os = await import("node:os");
    const path = await import("node:path");
    const fs = await import("node:fs");
    const { resetEnvCache } = await import("@/lib/env");
    const { backupNowAction } = await import("@/app/admin/actions/community");
    const { signIn } = await import("./helpers");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cowork-audit-backup-"));
    process.env.BACKUP_DIR = dir;
    resetEnvCache();
    const owner = await createUser({ totp: true });
    await signIn(owner.id, "OWNER");
    const outcome = await backupNowAction().then(() => "returned").catch((e: Error) => e.message);
    const run = await db.jobRun.findFirst({ where: { job: "backup" }, orderBy: { startedAt: "desc" } });
    say("10 what the owner is shown", decodeURIComponent(outcome));
    say("10 job history", { ok: run?.ok, error: run?.error?.slice(0, 80) });
    say("10 backup files actually written", fs.readdirSync(dir));
    fs.rmSync(dir, { recursive: true, force: true });
    delete process.env.BACKUP_DIR;
    resetEnvCache();
  });

  it("11. an administrator joins a group, reads the chat and leaves", async () => {
    const owner = await createUser({ totp: true });
    const { a, g } = await group();
    const { sendMessage, history: chatHistory } = await import("@/realtime/chat-service");
    const accA = (await channelAccess(db, a.id, g.channels[0]!.id))!;
    await sendMessage(db, a.id, accA, { channelId: g.channels[0]!.id, body: "private plan", clientId: "audit-probe-client-1", attachmentIds: [] });
    const before = await db.notification.count();
    const auditBefore = await db.auditLog.count();
    say("11 owner join result", await joinGroup(owner.id, g.id));
    const accOwner = await channelAccess(db, owner.id, g.channels[0]!.id);
    say("11 owner has chat access", accOwner !== null);
    say("11 owner can read history", accOwner ? JSON.stringify(await chatHistory(db, g.channels[0]!.id)).includes("private plan") : false);
    await leaveGroup(owner.id, g.id);
    say("11 notifications to members about the join/leave", (await db.notification.count()) - before);
    say("11 audit entries about the join/leave", (await db.auditLog.count()) - auditBefore);
    say("11 active members listed afterwards", (await snapshot(g.id)).members.filter((m) => m.includes(":ACTIVE:")).length);
  });

  it("12. a session is signed out elsewhere while its chat is open", async () => {
    const { createServer } = await import("node:http");
    const { io } = await import("socket.io-client");
    const { attachRealtime } = await import("@/realtime/server");
    const { SESSION_COOKIE } = await import("@/lib/auth/constants");
    const http = createServer();
    await new Promise<void>((r) => http.listen(0, "127.0.0.1", () => r()));
    const port = (http.address() as { port: number }).port;
    const rt = await attachRealtime(http, db, { siteUrl: `http://127.0.0.1:${port}`, databaseUrl: process.env.DATABASE_URL! });
    const { a, g } = await group();
    const s = await createSession(a.id, "MEMBER", { mfaVerified: true });
    const c = io(`http://127.0.0.1:${port}`, { path: "/socket.io", transports: ["websocket"], extraHeaders: { cookie: `${SESSION_COOKIE}=${encodeURIComponent(s.token)}`, origin: `http://127.0.0.1:${port}` }, reconnection: false });
    await new Promise<void>((r, j) => { c.on("connect", () => r()); c.on("connect_error", j); });
    const emit = (ev: string, data: unknown) => new Promise<Record<string, unknown>>((r) => c.emit(ev, data, (res: Record<string, unknown>) => r(res)));
    const channelId = g.channels[0]!.id;
    say("12 join before sign-out", (await emit("channel:join", { channelId })).ok);
    say("12 send before sign-out", (await emit("message:send", { channelId, body: "before", clientId: "audit-probe-client-0", attachmentIds: [] })).ok);
    // "Sign out of other sessions" / sign out on that device: the session row is revoked.
    await db.session.updateMany({ where: { userId: a.id }, data: { revokedAt: new Date() } });
    say("12 session still valid for pages", (await lookupSession(db, s.token)) !== null);
    await new Promise((r) => setTimeout(r, 1500));
    say("12 socket still connected after 1.5 s", c.connected);
    const after = await emit("message:send", { channelId, body: "sent after sign-out", clientId: "audit-probe-client-2", attachmentIds: [] });
    say("12 send after sign-out", { ok: after.ok, error: after.error });
    let got = false;
    c.on("message:new", () => (got = true));
    const { sendMessage } = await import("@/realtime/chat-service");
    const other = await db.groupMembership.findFirstOrThrow({ where: { groupId: g.id, userId: { not: a.id }, status: "ACTIVE" } });
    const acc = (await channelAccess(db, other.userId, channelId))!;
    void sendMessage;
    void acc;
    const c2s = await createSession(other.userId, "MEMBER", { mfaVerified: true });
    const c2 = io(`http://127.0.0.1:${port}`, { path: "/socket.io", transports: ["websocket"], extraHeaders: { cookie: `${SESSION_COOKIE}=${encodeURIComponent(c2s.token)}`, origin: `http://127.0.0.1:${port}` }, reconnection: false });
    await new Promise<void>((r, j) => { c2.on("connect", () => r()); c2.on("connect_error", j); });
    const emit2 = (ev: string, data: unknown) => new Promise<Record<string, unknown>>((r) => c2.emit(ev, data, (res: Record<string, unknown>) => r(res)));
    await emit2("channel:join", { channelId });
    await emit2("message:send", { channelId, body: "live message after sign-out", clientId: "audit-probe-client-4", attachmentIds: [] });
    await new Promise((r) => setTimeout(r, 800));
    say("12 signed-out socket still RECEIVES new messages", got);
    say("12 signed-out socket can page history", (await emit("history:more", { channelId })).ok ?? "no ack");
    c2.close();
    c.close();
    await rt.close();
  });

  it("9. an administrator's endorsement counts toward creating a group", async () => {
    const owner = await createUser({ totp: true });
    const a = await createMember("Alice");
    const b = await createMember("Bob");
    const res = await createIdea(a.id, idea());
    if (!res.ok) throw new Error(res.error);
    await endorseIdea(b.id, res.id);
    const r = await endorseIdea(owner.id, res.id);
    say("9 owner endorsement", r);
    say("9 groups", await db.researchGroup.count());
  });
});
