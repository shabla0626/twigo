/**
 * Regression tests for the corrective implementation plan, Stage 2 (medium findings).
 * One describe block per audit finding.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { safeNext } from "@/lib/auth/safe-next";
import { can } from "@/lib/auth/permissions";
import { issueToken } from "@/lib/auth/tokens";
import { isLocalTestMail } from "@/lib/email/status";
import { confirmIdentityAction } from "@/app/account/actions";
import { reactivateUser, setMembership, suspendUser } from "@/server/accounts";
import { hasOtherOpenApplication, updateApplicationStatus } from "@/server/admin/applications";
import { addAssignment, assignableParticipants, createProject, saveCompensation } from "@/server/admin/projects";
import { activeMemberIds } from "@/server/community/access";
import { createIdea, endorseIdea, reevaluateIdeas, withdrawEndorsement } from "@/server/community/ideas";
import { notify } from "@/server/community/notifications";
import { saveApplicationStep } from "@/server/membership-application";
import { verifyEmailToken } from "@/server/onboarding";
import { applicationsCsv, exportUserData } from "@/server/privacy";
import { saveSetting } from "@/server/settings";
import { applicationAnswers, cookieJar, createLegacyApplication, createMember, createUser, PASSWORD, resetDb, signIn, submitTestApplication } from "./helpers";

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
const redirectOf = async (p: Promise<unknown>) => decodeURIComponent(await p.then(() => "returned").catch((e: Error) => e.message));
const ideaInput = (title = "Neighborhood bookkeeping service") => ({
  title,
  summary: "Small local shops need simple, affordable monthly bookkeeping help.",
  category: "ONLINE_SERVICES" as const,
  description: null, problem: null, proposal: null, customers: null, revenueModel: null, skillsNeeded: null, timeEstimate: null,
  links: [],
});
async function openIdea(title?: string) {
  const author = await createMember("Author");
  const res = await createIdea(author.id, ideaInput(title));
  if (!res.ok) throw new Error(res.error);
  return { author, ideaId: res.id };
}
const count = async (ideaId: string) => (await db.businessIdea.findUniqueOrThrow({ where: { id: ideaId } })).endorsementCount;

describe("P2-1: a return address can only lead back into this site", () => {
  it("accepts paths inside the site, with their query and fragment", () => {
    expect(safeNext("/account")).toBe("/account");
    expect(safeNext("/account/security?setup=1")).toBe("/account/security?setup=1");
    expect(safeNext("/admin/privacy#run")).toBe("/admin/privacy#run");
  });

  it("refuses everything that could leave the site", () => {
    for (const bad of ["//evil.example", "/\\evil.example", "/\\/evil.example", "https://evil.example", "http://evil.example/x", "javascript:alert(1)", "evil.example", "/ok\\path", "/a\nb", "/a\u0000b", "", null, undefined, 42, "/" + "a".repeat(3000)]) {
      expect(safeNext(bad), String(bad)).toBe("");
      expect(safeNext(bad, "/account"), String(bad)).toBe("/account");
    }
  });

  it("after confirming identity, a crafted address lands on the account page", async () => {
    const m = await createMember("Mia");
    await signIn(m.id);
    for (const crafted of ["/\\example.org/phish", "//example.org/phish", "https://example.org"]) {
      expect(await redirectOf(confirmIdentityAction(undefined, form({ password: PASSWORD, next: crafted })))).toBe("REDIRECT:/account");
    }
    expect(await redirectOf(confirmIdentityAction(undefined, form({ password: PASSWORD, next: "/account/data" })))).toBe("REDIRECT:/account/data");
  });
});

describe("P2-4: a declined application cannot be re-opened once a new one exists", () => {
  it("gives a clear answer instead of failing, and changes nothing", async () => {
    const owner = await createUser({ totp: true });
    const { user, application } = await submitTestApplication();
    await updateApplicationStatus(owner.id, application.id, "DECLINED");
    expect(await hasOtherOpenApplication(application.applicantId, application.id)).toBe(false);
    // The person starts again: a new draft now exists.
    expect((await saveApplicationStep(user.id, 1, applicationAnswers().about)).ok).toBe(true);
    expect(await hasOtherOpenApplication(application.applicantId, application.id)).toBe(true);

    const res = await updateApplicationStatus(owner.id, application.id, "UNDER_REVIEW");
    expect(res).toMatchObject({ ok: false, error: expect.stringContaining("already started a new application") });
    expect((await db.application.findUniqueOrThrow({ where: { id: application.id } })).status).toBe("DECLINED");
  });

  it("re-opening still works when there is no newer application", async () => {
    const owner = await createUser({ totp: true });
    const { application } = await submitTestApplication();
    await updateApplicationStatus(owner.id, application.id, "DECLINED");
    expect((await updateApplicationStatus(owner.id, application.id, "UNDER_REVIEW")).ok).toBe(true);
  });
});

describe("P2-13 / P2-14: exports", () => {
  it("downloading all applications is owner-only", () => {
    expect(can("OWNER", "applications.export")).toBe(true);
    expect(can("ADMIN", "applications.export")).toBe(false);
    // Administrators keep reviewing applications and editing public content (founder decision 6).
    for (const p of ["applications.view", "applications.review", "content.edit", "members.view", "moderation.act"] as const) expect(can("ADMIN", p), p).toBe(true);
  });

  it("the applications file never contains unfinished drafts and shows the submission date", async () => {
    const { application } = await submitTestApplication({ email: "sub@example.test", fullName: "Sub Mitted" });
    const drafter = await db.user.create({ data: { email: "draft@example.test", name: "Dra Fter", role: "MEMBER", status: "ACTIVE", emailVerifiedAt: new Date() } });
    await saveApplicationStep(drafter.id, 1, applicationAnswers().about);
    expect(await db.application.count({ where: { status: "DRAFT" } })).toBe(1);

    const all = await applicationsCsv();
    expect(all).toContain("Sub Mitted");
    expect(all).not.toContain("Dra Fter");
    expect(await applicationsCsv({ status: "DRAFT" })).not.toContain("Dra Fter");
    // Make "created" and "submitted" differ, then check which one is exported.
    await db.application.update({ where: { id: application.id }, data: { createdAt: new Date("2020-01-01T00:00:00Z"), submittedAt: new Date("2026-06-15T10:00:00Z") } });
    const csv = await applicationsCsv({ status: "SUBMITTED" });
    expect(csv).toContain("2026-06-15");
    expect(csv).not.toContain("2020-01-01");
  });

  it("a person who was not accepted still gets their application in their own data export", async () => {
    const owner = await createUser({ totp: true });
    const { user, application } = await submitTestApplication({ fullName: "Wanda Waiting" });
    await updateApplicationStatus(owner.id, application.id, "WAITLISTED");
    const data = await exportUserData(user.id);
    expect(data.application).not.toBeNull();
    expect(JSON.stringify(data.application)).toContain("Wanda Waiting");
    expect(data.compensationAgreements).toEqual([]);
  });

  it("an accepted person's export includes their own compensation agreements", async () => {
    const owner = await createUser({ totp: true });
    const { user, application } = await submitTestApplication();
    await updateApplicationStatus(owner.id, application.id, "ACCEPTED");
    const participant = await db.participant.findFirstOrThrow();
    const project = await createProject(owner.id, { title: "Market Research", summary: "s", description: null, category: "RESEARCH", status: "PLANNING", isPublished: false, publicSummary: null, startDate: null, targetDate: null });
    expect((await addAssignment(owner.id, { projectId: project.id, participantId: participant.id, roleId: null, responsibilities: null })).ok).toBe(true);
    const assignment = await db.projectAssignment.findFirstOrThrow();
    await saveCompensation(owner.id, { assignmentId: assignment.id, terms: "Fixed fee on delivery", basis: "fixed", amount: 50000, currency: "USD", status: "AGREED", documentRef: null });
    const data = await exportUserData(user.id);
    expect(data.compensationAgreements).toHaveLength(1);
    expect(data.compensationAgreements[0]).toMatchObject({ terms: "Fixed fee on delivery", amountMinor: 50000, currency: "USD", status: "AGREED" });
  });
});

describe("P2-15: changing an email address to one used by an earlier application", () => {
  it("is refused with a clear answer; the account is unchanged", async () => {
    await createLegacyApplication("taken@example.test", "Someone Else");
    const { user } = await submitTestApplication({ email: "me@example.test" });
    const { token } = await issueToken(user.id, "VERIFY_EMAIL", { email: "taken@example.test" });
    const res = await verifyEmailToken(token);
    expect(res).toMatchObject({ ok: false, error: expect.stringContaining("already used by an earlier application") });
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).email).toBe("me@example.test");
    expect((await db.applicant.findUniqueOrThrow({ where: { userId: user.id } })).email).toBe("me@example.test");
  });

  it("a normal change updates the account and its application record together", async () => {
    const { user } = await submitTestApplication({ email: "me@example.test" });
    const { token } = await issueToken(user.id, "VERIFY_EMAIL", { email: "new@example.test" });
    expect((await verifyEmailToken(token)).ok).toBe(true);
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).email).toBe("new@example.test");
    expect((await db.applicant.findUniqueOrThrow({ where: { userId: user.id } })).email).toBe("new@example.test");
  });
});

describe("P2-21: the test-inbox label exists only outside production", () => {
  it("a mail server on the same machine is a real relay in production", () => {
    const before = process.env.NODE_ENV;
    try {
      (process.env as Record<string, string>).NODE_ENV = "production";
      expect(isLocalTestMail("127.0.0.1")).toBe(false);
      expect(isLocalTestMail("localhost")).toBe(false);
      // The browser tests: a production build on this computer, explicitly marked as a local test.
      const site = process.env.SITE_URL;
      process.env.LOCAL_PRODUCTION_TEST = "1";
      process.env.SITE_URL = "http://127.0.0.1:3210";
      expect(isLocalTestMail("127.0.0.1")).toBe(true);
      // The switch left on with a real site address changes nothing (and the server would refuse to start).
      process.env.SITE_URL = "https://www.organization.org";
      expect(isLocalTestMail("127.0.0.1")).toBe(false);
      delete process.env.LOCAL_PRODUCTION_TEST;
      process.env.SITE_URL = site;
      (process.env as Record<string, string>).NODE_ENV = "development";
      expect(isLocalTestMail("127.0.0.1")).toBe(true);
      expect(isLocalTestMail("smtp.resend.com")).toBe(false);
    } finally {
      (process.env as Record<string, string>).NODE_ENV = before ?? "test";
      delete process.env.LOCAL_PRODUCTION_TEST;
    }
  });
});

describe("P2-7: someone whose community access is paused is not an active group member", () => {
  async function group() {
    const owner = await createUser({ totp: true });
    const [a, b, c] = [await createMember("Alice"), await createMember("Bob"), await createMember("Cara")];
    const res = await createIdea(a.id, ideaInput());
    if (!res.ok) throw new Error(res.error);
    await endorseIdea(b.id, res.id);
    await endorseIdea(c.id, res.id);
    const g = await db.researchGroup.findUniqueOrThrow({ where: { ideaId: res.id } });
    return { owner, a, b, c, g };
  }
  const memberCount = async (id: string) => (await db.researchGroup.findUniqueOrThrow({ where: { id } })).memberCount;

  it("is not counted and not notified while paused, and both again once restored", async () => {
    const { owner, c, g } = await group();
    expect(await memberCount(g.id)).toBe(3);
    await setMembership(owner.id, c.id, "SUSPENDED");
    expect(await memberCount(g.id)).toBe(2);
    expect(await activeMemberIds(g.id)).not.toContain(c.id);
    const before = await db.notification.count({ where: { userId: c.id } });
    await notify([c.id], { type: "GROUP_ANNOUNCEMENT", title: "News for the group", link: "/community" });
    expect(await db.notification.count({ where: { userId: c.id } })).toBe(before);

    await setMembership(owner.id, c.id, "ACTIVE");
    expect(await memberCount(g.id)).toBe(3);
    expect(await activeMemberIds(g.id)).toContain(c.id);
  });

  it("the same applies to a suspended account", async () => {
    const { owner, b, g } = await group();
    await suspendUser(owner.id, b.id, "test");
    expect(await memberCount(g.id)).toBe(2);
    await reactivateUser(owner.id, b.id);
    expect(await memberCount(g.id)).toBe(3);
  });

  it("cannot be given new project work", async () => {
    const owner = await createUser({ totp: true });
    const { user, application } = await submitTestApplication();
    await updateApplicationStatus(owner.id, application.id, "ACCEPTED");
    const participant = await db.participant.findFirstOrThrow();
    const project = await createProject(owner.id, { title: "P", summary: "s", description: null, category: "RESEARCH", status: "PLANNING", isPublished: false, publicSummary: null, startDate: null, targetDate: null });
    expect((await assignableParticipants()).map((p) => p.id)).toEqual([participant.id]);
    await setMembership(owner.id, user.id, "SUSPENDED");
    expect(await assignableParticipants()).toEqual([]);
    expect(await addAssignment(owner.id, { projectId: project.id, participantId: participant.id, roleId: null, responsibilities: null })).toMatchObject({ ok: false });
    await setMembership(owner.id, user.id, "ACTIVE");
    expect((await addAssignment(owner.id, { projectId: project.id, participantId: participant.id, roleId: null, responsibilities: null })).ok).toBe(true);
  });
});

describe("P2-8: the number of supporters shown is the number that decides", () => {
  it("a suspended supporter is not counted, and reinstating them creates the group", async () => {
    const owner = await createUser({ totp: true });
    const { ideaId } = await openIdea();
    const [a, b] = [await createMember("Anna"), await createMember("Ben")];
    await endorseIdea(a.id, ideaId);
    await suspendUser(owner.id, a.id, "test");
    expect(await count(ideaId)).toBe(0);
    await endorseIdea(b.id, ideaId);
    expect(await count(ideaId)).toBe(1); // was shown as "2 of 2" with no group
    expect(await db.researchGroup.count()).toBe(0);

    await reactivateUser(owner.id, a.id);
    expect(await count(ideaId)).toBe(2);
    expect(await db.researchGroup.count()).toBe(1);
    expect((await db.businessIdea.findUniqueOrThrow({ where: { id: ideaId } })).status).toBe("GROUP_FORMED");
    expect(await db.notification.count({ where: { type: "IDEA_GROUP_CREATED" } })).toBe(1);
  });

  it("pausing community access and withdrawing support lower the number", async () => {
    const owner = await createUser({ totp: true });
    await saveSetting(owner.id, "community.endorsementThreshold", 5);
    const { ideaId } = await openIdea();
    const [a, b, c] = [await createMember("Anna"), await createMember("Ben"), await createMember("Cleo")];
    for (const u of [a, b, c]) await endorseIdea(u.id, ideaId);
    expect(await count(ideaId)).toBe(3);
    await setMembership(owner.id, a.id, "SUSPENDED");
    expect(await count(ideaId)).toBe(2);
    await withdrawEndorsement(b.id, ideaId);
    expect(await count(ideaId)).toBe(1);
    await setMembership(owner.id, a.id, "ACTIVE");
    expect(await count(ideaId)).toBe(2);
    expect(await db.researchGroup.count()).toBe(0);
  });

  it("lowering the threshold creates groups for ideas that already have enough support, and says how many", async () => {
    const owner = await createUser({ totp: true });
    await saveSetting(owner.id, "community.endorsementThreshold", 4);
    const { ideaId } = await openIdea();
    const [a, b] = [await createMember("Anna"), await createMember("Ben")];
    await endorseIdea(a.id, ideaId);
    await endorseIdea(b.id, ideaId);
    expect(await db.researchGroup.count()).toBe(0);
    expect(await saveSetting(owner.id, "community.endorsementThreshold", 2)).toMatchObject({ ok: true, groupsCreated: 1 });
    expect(await db.researchGroup.count()).toBe(1);
    // Nothing more to do on a second pass.
    expect(await reevaluateIdeas()).toMatchObject({ groupsCreated: 0 });
  });
});

describe("P2-12: simultaneous support never ends in an error", () => {
  it("12 rounds of eight members supporting one idea at the same moment", async () => {
    for (let round = 0; round < 12; round++) {
      await resetDb();
      const { author, ideaId } = await openIdea(`Concurrent idea ${round}`);
      const members = await Promise.all(["E1", "E2", "E3", "E4", "E5", "E6", "E7", "E8"].map((n) => createMember(n)));
      const results = await Promise.allSettled(members.map((m) => endorseIdea(m.id, ideaId)));
      expect(results.filter((r) => r.status === "rejected")).toEqual([]);
      expect(results.filter((r) => r.status === "fulfilled" && r.value.ok)).toHaveLength(2);
      expect(await db.researchGroup.count({ where: { ideaId } })).toBe(1);
      expect(await db.auditLog.count({ where: { action: "group.auto_created" } })).toBe(1);
      // One "new supporter" notice for the author (the two are counted onto one row).
      const notice = await db.notification.findMany({ where: { userId: author.id, type: "IDEA_ENDORSED" } });
      expect(notice).toHaveLength(1);
      expect(notice[0]!.count).toBe(2);
      expect(await db.notification.count({ where: { type: "GROUP_MEMBERSHIP" } })).toBe(2);
    }
  }, 300_000);

  it("two notices with the same subject for the same person at the same moment become one row", async () => {
    const m = await createMember("Mia");
    const input = { type: "IDEA_ENDORSED" as const, title: "Your idea has a new supporter", link: "/community", dedupeKey: "endorse:test" };
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => notify([m.id], input)));
    expect(results.filter((r) => r.status === "rejected")).toEqual([]);
    const rows = await db.notification.findMany({ where: { userId: m.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.count).toBe(8);
  });
});
