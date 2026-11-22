/**
 * Regression tests for the corrective implementation plan
 * (docs/CORRECTIVE-IMPLEMENTATION-PLAN.md). One describe block per audit finding.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { resetEnvCache } from "@/lib/env";
import { deactivateUser, reactivateUser, setMembership, suspendUser } from "@/server/accounts";
import { backupNowAction, memberStatusAction } from "@/app/admin/actions/community";
import { createIdea, endorseIdea } from "@/server/community/ideas";
import { leaveGroup } from "@/server/community/groups";
import { cookieJar, createMember, createUser, resetDb, signIn } from "./helpers";

beforeEach(async () => {
  await resetDb();
  cookieJar.clear();
});
afterAll(async () => {
  await db.$disconnect();
});

const form = (data: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(data)) fd.set(k, v);
  return fd;
};
const ideaInput = (title = "Neighborhood bookkeeping service") => ({
  title,
  summary: "Small local shops need simple, affordable monthly bookkeeping help.",
  category: "ONLINE_SERVICES" as const,
  description: null, problem: null, proposal: null, customers: null, revenueModel: null, skillsNeeded: null, timeEstimate: null,
  links: [],
});

/** A group formed from an idea: Alice is the author and coordinator; Bob and Cara supported it. */
async function groupOfThree() {
  const [a, b, c] = [await createMember("Alice"), await createMember("Bob"), await createMember("Cara")];
  const res = await createIdea(a.id, ideaInput());
  if (!res.ok) throw new Error(res.error);
  await endorseIdea(b.id, res.id);
  await endorseIdea(c.id, res.id);
  const g = await db.researchGroup.findUniqueOrThrow({ where: { ideaId: res.id }, include: { channels: true } });
  return { a, b, c, g, ideaId: res.id, channelId: g.channels[0]!.id };
}

/** "Name:ROLE:membership status" for every membership row, plus the group's own state. */
async function groupState(groupId: string) {
  const g = await db.researchGroup.findUniqueOrThrow({
    where: { id: groupId },
    include: { memberships: { include: { user: { select: { name: true } } } } },
  });
  const rows = g.memberships.map((m) => `${m.user.name}:${m.role}:${m.status}`).sort();
  return { status: g.status, adminManaged: g.adminManaged, memberCount: g.memberCount, rows, coordinators: rows.filter((r) => r.includes(":COORDINATOR:ACTIVE")) };
}

/** Server actions end with redirect(), which the test stand-in turns into an error carrying the address. */
const redirectOf = async (p: Promise<unknown>) => decodeURIComponent(await p.then(() => "returned").catch((e: Error) => e.message));

describe("P1-7: the Back up now button reports what really happened", () => {
  it("shows success and records a successful job when the backup was written", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cowork-backup-test-"));
    process.env.BACKUP_DIR = dir;
    resetEnvCache();
    try {
      const owner = await createUser({ totp: true });
      await signIn(owner.id, "OWNER");
      const shown = await redirectOf(backupNowAction());
      expect(shown).toContain("/admin/backups?ok=Backup written:");
      const run = await db.jobRun.findFirstOrThrow({ where: { job: "backup" } });
      expect(run.ok).toBe(true);
      expect(run.error).toBeNull();
      expect(fs.readdirSync(dir)).toHaveLength(1);
      expect(await db.auditLog.count({ where: { action: "backup.manual" } })).toBe(1);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
      delete process.env.BACKUP_DIR;
      resetEnvCache();
    }
  });

  it("shows failure and records a failed job when the backup cannot be written", async () => {
    // A path below an existing FILE can never be created as a folder.
    const file = path.join(os.tmpdir(), `cowork-not-a-folder-${Date.now()}`);
    fs.writeFileSync(file, "x");
    process.env.BACKUP_DIR = path.join(file, "sub");
    resetEnvCache();
    try {
      const owner = await createUser({ totp: true });
      await signIn(owner.id, "OWNER");
      const shown = await redirectOf(backupNowAction());
      expect(shown).toContain("/admin/backups?error=Backup failed");
      expect((await db.jobRun.findFirstOrThrow({ where: { job: "backup" } })).ok).toBe(false);
    } finally {
      fs.rmSync(file, { force: true });
      delete process.env.BACKUP_DIR;
      resetEnvCache();
    }
  });
});

describe("P1-4: only the owner may act on owner and administrator accounts", () => {
  async function staff() {
    const owner = await createUser({ email: "owner@example.test", totp: true });
    const owner2 = await createUser({ email: "owner2@example.test", totp: true });
    const admin = await createUser({ email: "admin@example.test", role: "ADMIN", totp: true });
    const admin2 = await createUser({ email: "admin2@example.test", role: "ADMIN", totp: true });
    const member = await createMember("Mia");
    return { owner, owner2, admin, admin2, member };
  }
  const status = async (id: string) => (await db.user.findUniqueOrThrow({ where: { id } })).status;

  it("refuses an administrator who tries to suspend, deactivate or reactivate an owner or another administrator", async () => {
    const { owner, owner2, admin, admin2 } = await staff();
    for (const target of [owner2, admin2]) {
      expect(await suspendUser(admin.id, target.id, "x")).toMatchObject({ ok: false, error: expect.stringContaining("Only the owner") });
      expect(await deactivateUser(admin.id, target.id)).toMatchObject({ ok: false, error: expect.stringContaining("Only the owner") });
      expect(await status(target.id)).toBe("ACTIVE");
    }
    // The owner suspends an administrator; another administrator cannot undo it.
    expect((await suspendUser(owner.id, admin2.id, "x")).ok).toBe(true);
    expect(await reactivateUser(admin.id, admin2.id)).toMatchObject({ ok: false, error: expect.stringContaining("Only the owner") });
    expect(await status(admin2.id)).toBe("SUSPENDED");
    expect((await reactivateUser(owner.id, admin2.id)).ok).toBe(true);
  });

  it("refuses an administrator who tries to change an owner's community access", async () => {
    const { owner2, admin } = await staff();
    await db.user.update({ where: { id: owner2.id }, data: { membershipStatus: "ACTIVE" } });
    expect(await setMembership(admin.id, owner2.id, "REVOKED")).toMatchObject({ ok: false, error: expect.stringContaining("Only the owner") });
    expect((await db.user.findUniqueOrThrow({ where: { id: owner2.id } })).membershipStatus).toBe("ACTIVE");
  });

  it("still lets administrators manage ordinary members, and members close their own account", async () => {
    const { admin, member } = await staff();
    expect((await suspendUser(admin.id, member.id, "x")).ok).toBe(true);
    expect((await reactivateUser(admin.id, member.id)).ok).toBe(true);
    expect((await setMembership(admin.id, member.id, "SUSPENDED")).ok).toBe(true);
    expect((await deactivateUser(member.id, member.id)).ok).toBe(true);
    expect(await status(member.id)).toBe("DEACTIVATED");
  });

  it("does not let anyone change their own account from the admin area", async () => {
    const { owner } = await staff();
    await signIn(owner.id, "OWNER");
    const shown = await redirectOf(memberStatusAction(form({ id: owner.id, action: "deactivate" })));
    expect(shown).toContain("error=You cannot change your own account");
    expect(await status(owner.id)).toBe("ACTIVE");
  });
});

describe("P2-5: simultaneous membership changes of one group never collide", () => {
  it("the last two members can leave at the same moment; the group ends up empty and archived", async () => {
    for (let round = 0; round < 8; round++) {
      await resetDb();
      const { a, b, c, g } = await groupOfThree();
      await leaveGroup(c.id, g.id);
      const results = await Promise.allSettled([leaveGroup(a.id, g.id), leaveGroup(b.id, g.id)]);
      expect(results.map((r) => r.status)).toEqual(["fulfilled", "fulfilled"]);
      expect(await groupState(g.id)).toMatchObject({ status: "ARCHIVED", adminManaged: true, memberCount: 0, coordinators: [] });
    }
  }, 120_000);

  it("the coordinator and a member can leave at the same moment; exactly one coordinator remains", async () => {
    for (let round = 0; round < 8; round++) {
      await resetDb();
      const { a, b, g } = await groupOfThree();
      const results = await Promise.allSettled([leaveGroup(a.id, g.id), leaveGroup(b.id, g.id)]);
      expect(results.map((r) => r.status)).toEqual(["fulfilled", "fulfilled"]);
      expect(await groupState(g.id)).toMatchObject({ status: "FORMING", memberCount: 1, coordinators: ["Cara:COORDINATOR:ACTIVE"] });
    }
  }, 120_000);
});

describe("P1-9: a coordinator who loses access is replaced at once", () => {
  it("suspending the coordinator account promotes the longest-standing eligible member and notifies them", async () => {
    const owner = await createUser({ totp: true });
    const { a, b, g } = await groupOfThree();
    expect((await suspendUser(owner.id, a.id, "test")).ok).toBe(true);
    const after = await groupState(g.id);
    expect(after.coordinators).toEqual(["Bob:COORDINATOR:ACTIVE"]);
    expect(after.rows).toContain("Alice:MEMBER:ACTIVE"); // keeps her place, not her role
    expect(after.adminManaged).toBe(false);
    expect(await db.notification.count({ where: { userId: b.id, type: "COORDINATOR_ASSIGNED" } })).toBe(1);
    expect(await db.auditLog.count({ where: { action: "group.coordinator_succession" } })).toBe(1);

    // Reinstated: an ordinary member again. Never two coordinators.
    expect((await reactivateUser(owner.id, a.id)).ok).toBe(true);
    expect((await groupState(g.id)).coordinators).toEqual(["Bob:COORDINATOR:ACTIVE"]);
  });

  it("pausing the community access of the coordinator does the same", async () => {
    const owner = await createUser({ totp: true });
    const { a, g } = await groupOfThree();
    expect((await setMembership(owner.id, a.id, "SUSPENDED")).ok).toBe(true);
    expect((await groupState(g.id)).coordinators).toEqual(["Bob:COORDINATOR:ACTIVE"]);
    expect((await setMembership(owner.id, a.id, "ACTIVE")).ok).toBe(true);
    const after = await groupState(g.id);
    expect(after.coordinators).toEqual(["Bob:COORDINATOR:ACTIVE"]);
    expect(after.rows).toContain("Alice:MEMBER:ACTIVE");
  });

  it("removing the community access of the coordinator ends their group memberships and promotes a successor", async () => {
    const owner = await createUser({ totp: true });
    const { a, g } = await groupOfThree();
    expect((await setMembership(owner.id, a.id, "REVOKED")).ok).toBe(true);
    const after = await groupState(g.id);
    expect(after.rows).toContain("Alice:MEMBER:LEFT");
    expect(after.coordinators).toEqual(["Bob:COORDINATOR:ACTIVE"]);
    expect(after.memberCount).toBe(2);
  });

  it("with nobody eligible the group is flagged for administrators (not archived) and recovers when someone returns", async () => {
    const owner = await createUser({ totp: true });
    const { a, b, c, g } = await groupOfThree();
    await suspendUser(owner.id, b.id, "test");
    await suspendUser(owner.id, c.id, "test");
    await suspendUser(owner.id, a.id, "test");
    expect(await groupState(g.id)).toMatchObject({ status: "FORMING", adminManaged: true, coordinators: [] });
    await reactivateUser(owner.id, c.id);
    expect(await groupState(g.id)).toMatchObject({ adminManaged: false, coordinators: ["Cara:COORDINATOR:ACTIVE"] });
  });

  it("a later leave never creates a second coordinator", async () => {
    const owner = await createUser({ totp: true });
    const { a, b, g } = await groupOfThree();
    await setMembership(owner.id, a.id, "SUSPENDED");
    await leaveGroup(b.id, g.id);
    await setMembership(owner.id, a.id, "ACTIVE");
    expect((await groupState(g.id)).coordinators).toEqual(["Cara:COORDINATOR:ACTIVE"]);
  });
});
