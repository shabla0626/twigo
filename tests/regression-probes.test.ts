/**
 * The twelve failure scenarios from the audit (formerly `tests/audit-probe.test.ts`, which only
 * REPORTED what happened). Each one now ASSERTS the corrected behaviour and runs in the normal
 * test run. Numbers match section 10.3 of docs/FINAL-PRODUCT-AUDIT.md.
 */
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { io as ioClient, type Socket } from "socket.io-client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { SESSION_COOKIE } from "@/lib/auth/constants";
import { createSession } from "@/lib/auth/session";
import { lookupSession } from "@/lib/auth/session-core";
import { resetEnvCache } from "@/lib/env";
import { readFlash } from "@/lib/flash";
import { channelAccess, history, sendMessage } from "@/realtime/chat-service";
import { attachRealtime } from "@/realtime/server";
import { reactivateUser, setMembership, suspendUser } from "@/server/accounts";
import { updateApplicationStatus } from "@/server/admin/applications";
import { activeMemberIds, groupAccess } from "@/server/community/access";
import { adminSetGroupState, getGroupOverview, joinGroup, leaveGroup } from "@/server/community/groups";
import { createIdea, endorseIdea } from "@/server/community/ideas";
import { backupNowAction } from "@/app/admin/actions/community";
import { cookieJar, createMember, createUser, resetDb, signIn, submitTestApplication } from "./helpers";

const idea = (title = "Probe idea") => ({
  title,
  summary: "Small local shops need simple, affordable monthly bookkeeping help.",
  category: "ONLINE_SERVICES" as const,
  description: null, problem: null, proposal: null, customers: null, revenueModel: null, skillsNeeded: null, timeEstimate: null,
  links: [],
});

async function group() {
  const [a, b, c] = [await createMember("Alice"), await createMember("Bob"), await createMember("Cara")];
  const res = await createIdea(a.id, idea());
  if (!res.ok) throw new Error(res.error);
  await endorseIdea(b.id, res.id);
  await endorseIdea(c.id, res.id);
  const g = await db.researchGroup.findUniqueOrThrow({ where: { ideaId: res.id }, include: { channels: true } });
  return { a, b, c, g, ideaId: res.id, channelId: g.channels[0]!.id };
}

/** The state of a group as the rules see it: active members are those who can use the community. */
async function state(groupId: string) {
  const g = await db.researchGroup.findUniqueOrThrow({
    where: { id: groupId },
    include: { memberships: { include: { user: { select: { name: true, status: true, membershipStatus: true, role: true, emailVerifiedAt: true } } } } },
  });
  const eligible = (u: (typeof g.memberships)[number]["user"]) =>
    u.status === "ACTIVE" && Boolean(u.emailVerifiedAt) && (u.membershipStatus === "ACTIVE" || u.role !== "MEMBER");
  const active = g.memberships.filter((m) => m.status === "ACTIVE");
  return {
    status: g.status,
    adminManaged: g.adminManaged,
    memberCount: g.memberCount,
    activeEligible: active.filter((m) => eligible(m.user)).map((m) => m.user.name),
    coordinators: active.filter((m) => m.role === "COORDINATOR").map((m) => ({ name: m.user.name, eligible: eligible(m.user) })),
  };
}
/** Exactly one coordinator, and that person may use the community; or no members and the group is flagged/archived. */
function expectSoundCoordination(s: Awaited<ReturnType<typeof state>>) {
  expect(s.coordinators.length).toBeLessThanOrEqual(1);
  if (s.activeEligible.length > 0) {
    expect(s.coordinators).toHaveLength(1);
    expect(s.coordinators[0]!.eligible).toBe(true);
  }
  expect(s.memberCount).toBe(s.activeEligible.length);
}

beforeEach(async () => {
  await resetDb();
  cookieJar.clear();
});
afterAll(async () => {
  await db.$disconnect();
});

describe("audit scenarios, now with the corrected behaviour asserted", () => {
  it("1. the only coordinator's account is suspended: another member takes over at once (P1-9)", async () => {
    const owner = await createUser({ totp: true });
    const { a, g } = await group();
    await suspendUser(owner.id, a.id, "probe");
    const after = await state(g.id);
    expectSoundCoordination(after);
    expect(after.coordinators[0]!.name).not.toBe("Alice");
    await reactivateUser(owner.id, a.id);
    const back = await state(g.id);
    expectSoundCoordination(back);
    // Coming back does not create a second coordinator.
    expect(back.coordinators).toHaveLength(1);
  });

  it("2. the only coordinator's community access is removed: no access, not counted, one coordinator throughout (P1-9, P2-7)", async () => {
    const owner = await createUser({ totp: true });
    const { a, b, g, channelId } = await group();
    await setMembership(owner.id, a.id, "REVOKED");
    expectSoundCoordination(await state(g.id));
    expect((await groupAccess(g.id, a.id))?.isMember).toBe(false);
    expect(await channelAccess(db, a.id, channelId)).toBeNull();
    expect(await activeMemberIds(g.id)).not.toContain(a.id);
    await leaveGroup(b.id, g.id);
    expectSoundCoordination(await state(g.id));
    await setMembership(owner.id, a.id, "ACTIVE");
    const restored = await state(g.id);
    expectSoundCoordination(restored);
    expect(restored.coordinators).toHaveLength(1);
  });

  it("3. the last two members leave at the same moment: no error, the group is archived with count 0 (P2-5)", { timeout: 120_000 }, async () => {
    for (let i = 0; i < 12; i++) {
      await resetDb();
      const { a, b, c, g } = await group();
      await leaveGroup(c.id, g.id);
      const rs = await Promise.allSettled([leaveGroup(a.id, g.id), leaveGroup(b.id, g.id)]);
      expect(rs.filter((r) => r.status === "rejected"), `run ${i}`).toHaveLength(0);
      const s = await state(g.id);
      expect([s.status, s.memberCount, s.coordinators.length], `run ${i}`).toEqual(["ARCHIVED", 0, 0]);
    }
  });

  it("4. coordinator and one member leave at the same moment: no error, exactly one coordinator remains (P2-5, P1-9)", { timeout: 120_000 }, async () => {
    for (let i = 0; i < 6; i++) {
      await resetDb();
      const { a, b, g } = await group();
      const rs = await Promise.allSettled([leaveGroup(a.id, g.id), leaveGroup(b.id, g.id)]);
      expect(rs.filter((r) => r.status === "rejected"), `run ${i}`).toHaveLength(0);
      const s = await state(g.id);
      expectSoundCoordination(s);
      expect(s.coordinators.map((x) => x.name), `run ${i}`).toEqual(["Cara"]);
    }
  });

  it("5. two administrators decide the same application at the same moment: one consistent result", async () => {
    const owner = await createUser({ totp: true });
    const admin2 = await createUser({ email: "second@example.test", role: "ADMIN", totp: true });
    const { user, application } = await submitTestApplication({ fullName: "Ada Example" });
    await updateApplicationStatus(owner.id, application.id, "UNDER_REVIEW");
    const res = await Promise.allSettled([
      updateApplicationStatus(owner.id, application.id, "ACCEPTED"),
      updateApplicationStatus(admin2.id, application.id, "DECLINED"),
    ]);
    expect(res.every((r) => r.status === "fulfilled")).toBe(true);
    const app = await db.application.findUniqueOrThrow({ where: { id: application.id } });
    const u = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    const participants = await db.participant.count();
    if (app.status === "ACCEPTED") expect([u.membershipStatus, participants]).toEqual(["ACTIVE", 1]);
    else expect([app.status, u.membershipStatus, participants]).toEqual(["DECLINED", "NONE", 0]);
    // Exactly one of the two decisions was applied; the other was refused with a reason.
    const applied = res.filter((r) => r.status === "fulfilled" && (r.value as { ok: boolean }).ok);
    expect(applied).toHaveLength(1);
  });

  it("6. an accepted application cannot be turned into a declined one (access would stay while the record says declined)", async () => {
    const owner = await createUser({ totp: true });
    const { user, application } = await submitTestApplication({ fullName: "Ada Example" });
    await updateApplicationStatus(owner.id, application.id, "UNDER_REVIEW");
    await updateApplicationStatus(owner.id, application.id, "ACCEPTED");
    const back = await updateApplicationStatus(owner.id, application.id, "DECLINED");
    expect(back.ok).toBe(false);
    expect((await db.application.findUniqueOrThrow({ where: { id: application.id } })).status).toBe("ACCEPTED");
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).membershipStatus).toBe("ACTIVE");
  });

  it("7. sessions: paused access keeps sign-in but not the community; a suspended account's sessions end", async () => {
    const owner = await createUser({ totp: true });
    const m = await createMember("Dora");
    const s = await createSession(m.id, "MEMBER", { mfaVerified: true });
    await setMembership(owner.id, m.id, "SUSPENDED");
    expect((await lookupSession(db, s.token))?.user.communityAccess).toBe(false);
    const s2 = await createSession(m.id, "MEMBER", { mfaVerified: true });
    expect((await lookupSession(db, s2.token))?.user.communityAccess).toBe(false);
    await setMembership(owner.id, m.id, "ACTIVE");
    await suspendUser(owner.id, m.id, "probe");
    expect(await lookupSession(db, s.token)).toBeNull();
    expect(await lookupSession(db, s2.token)).toBeNull();
  });

  it("8. an archived group with no members is reopened: it stays open and flagged, and the first to join coordinates (P2-6)", async () => {
    const owner = await createUser({ totp: true });
    const { a, b, c, g } = await group();
    for (const u of [a, b, c]) await leaveGroup(u.id, g.id);
    expect((await state(g.id)).status).toBe("ARCHIVED");
    await adminSetGroupState(owner.id, g.id, "reopen");
    const reopened = await state(g.id);
    expect(reopened.status).not.toBe("ARCHIVED");
    expect(reopened.adminManaged).toBe(true);
    const d = await createMember("Dora");
    expect((await joinGroup(d.id, g.id)).ok).toBe(true);
    const after = await state(g.id);
    expectSoundCoordination(after);
    expect(after.coordinators.map((x) => x.name)).toEqual(["Dora"]);
  });

  it("9. staff take part as ordinary members (decision 1): an owner's support counts like any member's", async () => {
    const owner = await createUser({ totp: true, profile: true, name: "Olivia Owner" });
    const a = await createMember("Alice");
    const b = await createMember("Bob");
    const res = await createIdea(a.id, idea());
    if (!res.ok) throw new Error(res.error);
    await endorseIdea(b.id, res.id);
    expect((await endorseIdea(owner.id, res.id)).ok).toBe(true);
    const g = await db.researchGroup.findUniqueOrThrow({ where: { ideaId: res.id } });
    // The owner is a founding member like the others, and the member list marks staff for everyone.
    const overview = await getGroupOverview(g.slug);
    expect(overview!.memberships.find((m) => m.user.id === owner.id)).toMatchObject({ founding: true, user: { role: "OWNER" } });
    expect(readFileSync("src/app/community/(portal)/groups/[slug]/members/page.tsx", "utf8")).toContain('{m.user.role !== "MEMBER" && <Badge>Administrator</Badge>}');
  });

  it("10. the owner presses Back up now: the success message matches the file written and the job history (P1-7)", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "cowork-regression-backup-"));
    process.env.BACKUP_DIR = dir;
    resetEnvCache();
    try {
      const owner = await createUser({ totp: true });
      await signIn(owner.id, "OWNER");
      const outcome = await backupNowAction().then(() => "returned").catch((e: Error) => e.message);
      expect(outcome.startsWith("REDIRECT:/admin/backups?")).toBe(true);
      const shown = readFlash(Object.fromEntries(new URL(outcome.slice(9), "http://x").searchParams));
      expect(shown.error).toBeUndefined();
      expect(shown.ok).toMatch(/^Backup written/);
      const run = await db.jobRun.findFirstOrThrow({ where: { job: "backup" }, orderBy: { startedAt: "desc" } });
      expect([run.ok, run.error]).toEqual([true, null]);
      expect(readdirSync(dir).length).toBeGreaterThan(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
      delete process.env.BACKUP_DIR;
      resetEnvCache();
    }
  }, 60_000);

  it("11. an owner joins a group: earlier messages stay hidden, the group sees it, and it is recorded (P1-1)", async () => {
    const owner = await createUser({ totp: true, profile: true, name: "Olivia Owner" });
    const { a, g, channelId } = await group();
    const accA = (await channelAccess(db, a.id, channelId))!;
    await sendMessage(db, a.id, accA, { channelId, body: "private plan", clientId: "regression-probe-client-1", attachmentIds: [] });
    const auditBefore = await db.auditLog.count();
    expect((await joinGroup(owner.id, g.id)).ok).toBe(true);
    const accOwner = await channelAccess(db, owner.id, channelId);
    expect(accOwner).not.toBeNull();
    const visible = await history(db, channelId, undefined, 50, accOwner!.historyFrom);
    expect(JSON.stringify(visible)).not.toContain("private plan");
    await leaveGroup(owner.id, g.id);
    const lines = (await db.chatMessage.findMany({ where: { channelId, kind: "SYSTEM" }, orderBy: { createdAt: "asc" } })).map((m) => m.body);
    expect(lines.some((l) => /Olivia Owner.*joined/.test(l))).toBe(true);
    expect(lines.some((l) => /Olivia Owner.*left/.test(l))).toBe(true);
    expect((await db.auditLog.count()) - auditBefore).toBeGreaterThanOrEqual(2);
    expect((await state(g.id)).activeEligible).not.toContain("Olivia Owner");
  });

  it("12. a session signed out elsewhere: its open chat connection closes within 5 seconds and nothing more gets through (P1-2)", async () => {
    const http = createServer();
    await new Promise<void>((r) => http.listen(0, "127.0.0.1", () => r()));
    const port = (http.address() as { port: number }).port;
    const rt = await attachRealtime(http, db, { siteUrl: `http://127.0.0.1:${port}`, databaseUrl: process.env.DATABASE_URL! });
    const sockets: Socket[] = [];
    const connect = async (token: string) => {
      const c = ioClient(`http://127.0.0.1:${port}`, { path: "/socket.io", transports: ["websocket"], extraHeaders: { cookie: `${SESSION_COOKIE}=${encodeURIComponent(token)}`, origin: `http://127.0.0.1:${port}` }, reconnection: false });
      sockets.push(c);
      await new Promise<void>((r, j) => {
        c.on("connect", () => r());
        c.on("connect_error", j);
      });
      return c;
    };
    const emit = (c: Socket, ev: string, data: unknown) =>
      new Promise<Record<string, unknown> | "no answer">((resolve) => {
        const t = setTimeout(() => resolve("no answer"), 2000);
        c.emit(ev, data, (res: Record<string, unknown>) => {
          clearTimeout(t);
          resolve(res);
        });
      });
    try {
      const { a, b, channelId } = await group();
      const s = await createSession(a.id, "MEMBER", { mfaVerified: true });
      const c = await connect(s.token);
      expect((await emit(c, "channel:join", { channelId })) as Record<string, unknown>).toMatchObject({ ok: true });
      let received = false;
      c.on("message:new", () => (received = true));
      const closed = new Promise<boolean>((resolve) => {
        const t = setTimeout(() => resolve(false), 5000);
        c.once("disconnect", () => {
          clearTimeout(t);
          resolve(true);
        });
      });
      const { revokeUserSessions } = await import("@/lib/auth/session");
      await revokeUserSessions(a.id);
      expect(await lookupSession(db, s.token)).toBeNull();
      expect(await closed).toBe(true);
      // Someone else keeps writing: the closed connection receives nothing.
      const s2 = await createSession(b.id, "MEMBER", { mfaVerified: true });
      const c2 = await connect(s2.token);
      await emit(c2, "channel:join", { channelId });
      await emit(c2, "message:send", { channelId, body: "live message after sign-out", clientId: "regression-probe-client-4", attachmentIds: [] });
      await new Promise((r) => setTimeout(r, 500));
      expect(received).toBe(false);
      expect(await db.chatMessage.count({ where: { channelId, authorId: a.id, kind: "USER" } })).toBe(0);
    } finally {
      for (const x of sockets) x.close();
      await rt.close();
      await new Promise<void>((r) => http.close(() => r()));
    }
  });
});
