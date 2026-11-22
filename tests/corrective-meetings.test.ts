/**
 * Regression tests for the corrective implementation plan.
 * P2-10: meetings are shared Google Meet links with a limited lifetime, one at a time per group.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { meetingSchema } from "@/lib/validation/community";
import { expireMeetings } from "@/ops/housekeeping";
import { adminSetGroupState, leaveGroup } from "@/server/community/groups";
import { createIdea, endorseIdea } from "@/server/community/ideas";
import { activeMeeting, endMeeting, joinMeeting, liveMeeting, MEETING_MAX_HOURS, startMeeting } from "@/server/community/meetings";
import { cookieJar, createMember, createUser, resetDb } from "./helpers";

beforeEach(async () => {
  await resetDb();
  cookieJar.clear();
});
afterAll(async () => {
  await db.$disconnect();
});

const LINK = "https://meet.google.com/abc-defg-hij";
async function group() {
  const [a, b, c] = [await createMember("Alice"), await createMember("Bob"), await createMember("Cara")];
  const res = await createIdea(a.id, {
    title: "Neighborhood bookkeeping service", summary: "Small local shops need simple, affordable monthly bookkeeping help.", category: "ONLINE_SERVICES",
    description: null, problem: null, proposal: null, customers: null, revenueModel: null, skillsNeeded: null, timeEstimate: null, links: [],
  });
  if (!res.ok) throw new Error(res.error);
  await endorseIdea(b.id, res.id);
  await endorseIdea(c.id, res.id);
  const g = await db.researchGroup.findUniqueOrThrow({ where: { ideaId: res.id } });
  return { a, b, c, g };
}
const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000);
const live = (groupId: string) => db.groupMeeting.count({ where: { groupId, ...liveMeeting() } });

describe("P2-10: meetings", () => {
  it("starting a meeting needs only a Google Meet link; other links are refused", async () => {
    expect(meetingSchema.safeParse({ title: "", joinUrl: LINK }).success).toBe(true);
    expect(meetingSchema.safeParse({ kind: "VOICE", title: "Plan", joinUrl: LINK }).success).toBe(true); // older forms
    for (const bad of ["https://zoom.us/j/123", "https://evil.example/meet.google.com/abc-defg-hij", "http://meet.google.com/abc-defg-hij", "meet.google.com/abc-defg-hij"]) {
      expect(meetingSchema.safeParse({ title: "", joinUrl: bad }).success, bad).toBe(false);
    }
  });

  it("members are notified with accurate wording, and only current members get the link", async () => {
    const { a, b, g } = await group();
    const outsider = await createMember("Olga");
    const started = await startMeeting(a.id, g.id, { title: "Plan interviews", joinUrl: LINK });
    expect(started.ok).toBe(true);
    const notice = await db.notification.findFirstOrThrow({ where: { userId: b.id, type: "MEETING_STARTED" } });
    expect(notice.title).toContain("a meeting started (Google Meet)");
    expect(notice.title).not.toMatch(/voice|video/i);
    if (!started.ok) return;
    expect(await joinMeeting(b.id, g.id, started.id)).toMatchObject({ ok: true, url: LINK });
    await expect(joinMeeting(outsider.id, g.id, started.id)).rejects.toThrow();
    await expect(startMeeting(outsider.id, g.id, { title: null, joinUrl: LINK })).rejects.toThrow();
    // After leaving, the link is no longer given out.
    await leaveGroup(b.id, g.id);
    await expect(joinMeeting(b.id, g.id, started.id)).rejects.toThrow();
  });

  it("a group has one meeting at a time, also when two members press Start at the same moment", async () => {
    for (let round = 0; round < 6; round++) {
      await resetDb();
      const { a, b, c, g } = await group();
      const results = await Promise.all([a, b, c].map((u) => startMeeting(u.id, g.id, { title: null, joinUrl: LINK })));
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      for (const r of results) if (!r.ok) expect(r.error).toContain("already in progress");
      expect(await db.groupMeeting.count({ where: { groupId: g.id, endedAt: null } })).toBe(1);
    }
    // The database itself refuses a second meeting in progress.
    await resetDb();
    const { a, g } = await group();
    await startMeeting(a.id, g.id, { title: null, joinUrl: LINK });
    await expect(db.groupMeeting.create({ data: { groupId: g.id, kind: "VIDEO", joinUrl: LINK, startedById: a.id } })).rejects.toThrow();
  }, 120_000);

  it("a meeting nobody ended stops being 'in progress' after the limit, and a new one can then be started", async () => {
    const { a, b, g } = await group();
    const started = await startMeeting(a.id, g.id, { title: null, joinUrl: LINK });
    if (!started.ok) throw new Error(started.error);
    expect(await live(g.id)).toBe(1);
    await db.groupMeeting.update({ where: { id: started.id }, data: { startedAt: hoursAgo(MEETING_MAX_HOURS + 1) } });
    // Treated as ended everywhere at once, even before the clean-up has run.
    expect(await live(g.id)).toBe(0);
    expect(await activeMeeting(g.id)).toBeNull();
    expect(await joinMeeting(b.id, g.id, started.id)).toMatchObject({ ok: false, error: "This meeting has ended." });
    // A new meeting can be started (the stale one is closed first).
    const second = await startMeeting(b.id, g.id, { title: null, joinUrl: LINK });
    expect(second.ok).toBe(true);
    const old = await db.groupMeeting.findUniqueOrThrow({ where: { id: started.id } });
    expect(old.endedAt).not.toBeNull();
    expect(Math.round((old.endedAt!.getTime() - old.startedAt.getTime()) / 3600_000)).toBe(MEETING_MAX_HOURS);
  });

  it("the hourly clean-up writes the end time of forgotten meetings and leaves current ones alone", async () => {
    const one = await group();
    await db.groupMeeting.create({ data: { groupId: one.g.id, kind: "VIDEO", joinUrl: LINK, startedById: one.a.id, startedAt: hoursAgo(30) } });
    const fresh = await db.groupMeeting.create({ data: { groupId: (await otherGroup()).id, kind: "VIDEO", joinUrl: LINK, startedAt: hoursAgo(1) } });
    expect(await expireMeetings(db)).toBe(1);
    expect((await db.groupMeeting.findUniqueOrThrow({ where: { id: fresh.id } })).endedAt).toBeNull();
    expect(await expireMeetings(db)).toBe(0);
  });

  it("during the first hour only the starter or the coordinator can end it; afterwards anyone in the group", async () => {
    const { a, b, c, g } = await group();
    const started = await startMeeting(b.id, g.id, { title: null, joinUrl: LINK }); // Bob starts; Alice coordinates
    if (!started.ok) throw new Error(started.error);
    expect(await endMeeting(c.id, g.id, started.id)).toMatchObject({ ok: false });
    await db.groupMeeting.update({ where: { id: started.id }, data: { startedAt: hoursAgo(2) } });
    expect(await endMeeting(c.id, g.id, started.id)).toEqual({ ok: true });
    expect(await live(g.id)).toBe(0);
    // The coordinator can always end one.
    const again = await startMeeting(b.id, g.id, { title: null, joinUrl: LINK });
    if (!again.ok) throw new Error(again.error);
    expect(await endMeeting(a.id, g.id, again.id)).toEqual({ ok: true });
  });

  it("archiving or suspending a group ends its meeting", async () => {
    const owner = await createUser({ totp: true });
    for (const action of ["archive", "suspend"] as const) {
      await db.groupMeeting.deleteMany({});
      const { a, g } = await freshGroup(action);
      await startMeeting(a.id, g.id, { title: null, joinUrl: LINK });
      await adminSetGroupState(owner.id, g.id, action, "test");
      expect(await db.groupMeeting.count({ where: { groupId: g.id, endedAt: null } })).toBe(0);
    }
  });
});

/** A second, unrelated group (plain row) for tests that need two. */
async function otherGroup() {
  return db.researchGroup.create({ data: { slug: `other-${Date.now()}`, name: "Other group" } });
}
/** A group with one member, named so that several can exist in one test. */
async function freshGroup(tag: string) {
  const a = await createMember(`Member${tag}`);
  const g = await db.researchGroup.create({ data: { slug: `group-${tag}`, name: `Group ${tag}`, memberCount: 1, memberships: { create: { userId: a.id, role: "COORDINATOR" } } } });
  return { a, g };
}
