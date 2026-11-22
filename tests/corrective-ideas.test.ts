/**
 * Regression tests for the corrective implementation plan.
 * P2-9 (founder decision 5): editing an idea after people supported it, and
 * changing a research group's direction, both happen openly and are recorded.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { updateGroupInfo } from "@/server/community/groups";
import { createIdea, endorseIdea, ideaRevisions, updateIdea } from "@/server/community/ideas";
import { saveSetting } from "@/server/settings";
import { cookieJar, createMember, createUser, resetDb } from "./helpers";

beforeEach(async () => {
  await resetDb();
  cookieJar.clear();
});
afterAll(async () => {
  await db.$disconnect();
});

const base = {
  title: "Neighborhood bookkeeping service",
  summary: "Small local shops need simple, affordable monthly bookkeeping help.",
  category: "ONLINE_SERVICES" as const,
  description: null, problem: null, proposal: null, customers: null, revenueModel: "A monthly fee per shop.", skillsNeeded: null, timeEstimate: null,
  links: [] as string[],
};
async function idea() {
  const author = await createMember("Author");
  const res = await createIdea(author.id, base);
  if (!res.ok) throw new Error(res.error);
  return { author, ideaId: res.id };
}
const supporters = (ideaId: string) => db.ideaEndorsement.count({ where: { ideaId } });
const stored = (ideaId: string) => db.businessIdea.findUniqueOrThrow({ where: { id: ideaId } });

describe("P2-9: editing an idea", () => {
  it("before anyone supports it, the author edits freely, and the change is still recorded", async () => {
    const { author, ideaId } = await idea();
    expect(await updateIdea(author.id, ideaId, { ...base, summary: "Small shops need simple and affordable monthly bookkeeping help." })).toMatchObject({ ok: true });
    const history = await ideaRevisions(ideaId);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ kind: "MINOR", changedFields: ["summary"], supportersBefore: 0, supportReset: false });
    expect((history[0]!.before as { summary: string }).summary).toBe(base.summary);
    expect((await stored(ideaId)).editedAt).not.toBeNull();
  });

  it("saving without changing anything records nothing", async () => {
    const { author, ideaId } = await idea();
    expect((await updateIdea(author.id, ideaId, { ...base })).ok).toBe(true);
    expect(await ideaRevisions(ideaId)).toHaveLength(0);
    expect((await stored(ideaId)).editedAt).toBeNull();
  });

  it("once people support it, the author must say what kind of change it is", async () => {
    const owner = await createUser({ totp: true });
    await saveSetting(owner.id, "community.endorsementThreshold", 5);
    const { author, ideaId } = await idea();
    const s1 = await createMember("Sara");
    await endorseIdea(s1.id, ideaId);
    const res = await updateIdea(author.id, ideaId, { ...base, title: "Neighbourhood bookkeeping service" });
    expect(res).toMatchObject({ ok: false, error: expect.stringContaining("minor correction or a material change") });
    expect((await stored(ideaId)).title).toBe(base.title);
    expect(await ideaRevisions(ideaId)).toHaveLength(0);
  });

  it("a minor correction keeps the support, tells the supporters, and shows what the text said before", async () => {
    const owner = await createUser({ totp: true });
    await saveSetting(owner.id, "community.endorsementThreshold", 5);
    const { author, ideaId } = await idea();
    const [s1, s2] = [await createMember("Sara"), await createMember("Tom")];
    await endorseIdea(s1.id, ideaId);
    await endorseIdea(s2.id, ideaId);

    expect(await updateIdea(author.id, ideaId, { ...base, title: "Neighbourhood bookkeeping service" }, { kind: "MINOR" })).toMatchObject({ ok: true, reset: false });
    expect(await supporters(ideaId)).toBe(2);
    expect((await stored(ideaId)).endorsementCount).toBe(2);
    const notices = await db.notification.findMany({ where: { type: "IDEA_CHANGED" } });
    expect(notices.map((n) => n.userId).sort()).toEqual([s1.id, s2.id].sort());
    expect(notices[0]!.title).toContain("was corrected");
    expect(notices[0]!.link).toContain("#history");
    const [rev] = await ideaRevisions(ideaId);
    expect(rev).toMatchObject({ kind: "MINOR", changedFields: ["title"], supportersBefore: 2, supportReset: false });
    expect((rev!.before as { title: string }).title).toBe(base.title);
  });

  it("a material change resets the support and asks the supporters again", async () => {
    const owner = await createUser({ totp: true });
    await saveSetting(owner.id, "community.endorsementThreshold", 5);
    const { author, ideaId } = await idea();
    const [s1, s2] = [await createMember("Sara"), await createMember("Tom")];
    await endorseIdea(s1.id, ideaId);
    await endorseIdea(s2.id, ideaId);

    const changed = { ...base, summary: "A paid newsletter with tax tips for freelancers, sold by yearly subscription.", revenueModel: "Yearly subscriptions." };
    expect(await updateIdea(author.id, ideaId, changed, { kind: "MATERIAL" })).toMatchObject({ ok: true, reset: true });
    expect(await supporters(ideaId)).toBe(0);
    expect(await stored(ideaId)).toMatchObject({ endorsementCount: 0, status: "OPEN", summary: changed.summary });
    const notices = await db.notification.findMany({ where: { type: "IDEA_CHANGED" } });
    expect(notices).toHaveLength(2);
    expect(notices[0]!.title).toContain("was changed materially");
    const [rev] = await ideaRevisions(ideaId);
    expect(rev).toMatchObject({ kind: "MATERIAL", supportersBefore: 2, supportReset: true });
    expect(rev!.changedFields.sort()).toEqual(["revenueModel", "summary"]);

    // Supporting the new version counts from zero again.
    await endorseIdea(s1.id, ideaId);
    expect((await stored(ideaId)).endorsementCount).toBe(1);
    expect(await db.researchGroup.count()).toBe(0);
  });

  it("changing the area is always a material change", async () => {
    const owner = await createUser({ totp: true });
    await saveSetting(owner.id, "community.endorsementThreshold", 5);
    const { author, ideaId } = await idea();
    await endorseIdea((await createMember("Sara")).id, ideaId);
    const other = { ...base, category: "OTHER" as const };
    expect(await updateIdea(author.id, ideaId, other, { kind: "MINOR" })).toMatchObject({ ok: false, error: expect.stringContaining("material change") });
    expect(await supporters(ideaId)).toBe(1);
    expect((await updateIdea(author.id, ideaId, other, { kind: "MATERIAL" })).ok).toBe(true);
    expect(await supporters(ideaId)).toBe(0);
  });

  it("only the author can edit, and the history keeps every step in order", async () => {
    const { author, ideaId } = await idea();
    const stranger = await createMember("Stan");
    expect(await updateIdea(stranger.id, ideaId, { ...base, title: "Hijacked title here" })).toMatchObject({ ok: false });
    await updateIdea(author.id, ideaId, { ...base, title: "Second title of the idea" });
    await updateIdea(author.id, ideaId, { ...base, title: "Third title of the idea" });
    const history = await ideaRevisions(ideaId);
    expect(history.map((r) => (r.before as { title: string }).title)).toEqual(["Second title of the idea", base.title]); // newest first
    expect(history[0]!.editor?.profile?.displayName).toBe("Author");
  });
});

describe("P2-9: after a research group exists", () => {
  async function formed() {
    const { author, ideaId } = await idea();
    const [b, c] = [await createMember("Bob"), await createMember("Cara")];
    await endorseIdea(b.id, ideaId);
    await endorseIdea(c.id, ideaId);
    const g = await db.researchGroup.findUniqueOrThrow({ where: { ideaId }, include: { channels: true } });
    return { author, b, c, ideaId, g };
  }

  it("the idea accepts minor corrections only; its supporters and the group are untouched", async () => {
    const { author, ideaId, g } = await formed();
    expect(await updateIdea(author.id, ideaId, { ...base, summary: "A completely different business." + " x".repeat(10) }, { kind: "MATERIAL" })).toMatchObject({
      ok: false,
      error: expect.stringContaining("only minor corrections"),
    });
    expect(await updateIdea(author.id, ideaId, { ...base, category: "OTHER" })).toMatchObject({ ok: false });
    expect((await updateIdea(author.id, ideaId, { ...base, title: "Neighbourhood bookkeeping service" })).ok).toBe(true);
    expect(await supporters(ideaId)).toBe(2);
    expect((await stored(ideaId)).status).toBe("GROUP_FORMED");
    expect((await ideaRevisions(ideaId))[0]).toMatchObject({ kind: "MINOR", supportReset: false });
    expect((await db.researchGroup.findUniqueOrThrow({ where: { id: g.id } })).purpose).toBe(base.summary);
  });

  it("the group's direction cannot be changed without a note for the members", async () => {
    const { author, g } = await formed();
    const input = { name: g.name, purpose: "Tax newsletters for freelancers instead of bookkeeping.", description: null };
    expect(await updateGroupInfo(author.id, g.id, input)).toMatchObject({ ok: false, error: expect.stringContaining("what changes, and why") });
    expect(await updateGroupInfo(author.id, g.id, input, "short")).toMatchObject({ ok: false });
    expect((await db.researchGroup.findUniqueOrThrow({ where: { id: g.id } })).purpose).toBe(base.summary);
    expect(await db.groupDecision.count()).toBe(0);
  });

  it("a change of direction is recorded as a decision, announced, shown in the chat and sent to every member, with the previous text", async () => {
    const { author, b, c, g } = await formed();
    const next = "Tax newsletters for freelancers instead of bookkeeping.";
    const why = "Interviews showed that shops already have bookkeepers, but freelancers asked for tax help.";
    expect(await updateGroupInfo(author.id, g.id, { name: g.name, purpose: next, description: null }, why)).toMatchObject({ ok: true, purposeChanged: true });

    expect((await db.researchGroup.findUniqueOrThrow({ where: { id: g.id } })).purpose).toBe(next);
    const decision = await db.groupDecision.findFirstOrThrow({ where: { groupId: g.id } });
    expect(decision.decision).toContain(next);
    expect(decision.rationale).toContain(why);
    expect(decision.rationale).toContain(base.summary); // the previous purpose stays on record
    const announcement = await db.groupAnnouncement.findFirstOrThrow({ where: { groupId: g.id } });
    expect(announcement.body).toContain(base.summary);
    expect(announcement.body).toContain(why);
    const line = await db.chatMessage.findFirstOrThrow({ where: { channelId: g.channels[0]!.id, kind: "SYSTEM", body: { contains: "changed what the group is working on" } } });
    expect(line.body).toContain("Author");
    const notified = await db.notification.findMany({ where: { type: "GROUP_DECISION" } });
    expect(notified.map((n) => n.userId).sort()).toEqual([b.id, c.id].sort());
    expect(await db.auditLog.count({ where: { action: "group.purpose_changed", entityId: g.id } })).toBe(1);
  });

  it("editing the name or the longer description alone needs no note and records no decision", async () => {
    const { author, g } = await formed();
    expect(await updateGroupInfo(author.id, g.id, { name: "Bookkeeping for local shops", purpose: g.purpose, description: "We meet on Thursdays." })).toMatchObject({ ok: true, purposeChanged: false });
    expect(await db.groupDecision.count()).toBe(0);
    expect(await db.groupAnnouncement.count()).toBe(0);
  });

  it("only the coordinator can change the group's details", async () => {
    const { b, g } = await formed();
    await expect(updateGroupInfo(b.id, g.id, { name: g.name, purpose: "Something else entirely for this group.", description: null }, "Because I prefer it this way.")).rejects.toThrow();
  });
});
