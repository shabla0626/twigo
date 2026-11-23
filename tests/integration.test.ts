import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { issueFormToken } from "@/lib/security";
import { authenticate } from "@/lib/auth/service";
import { getCurrentUser, requireAdmin } from "@/lib/auth/guard";
import { SESSION_COOKIE } from "@/lib/auth/constants";
import { submitInquiry } from "@/server/contact";
import {
  addApplicationNote,
  updateApplicationStatus,
  deleteApplicantData,
  getOverviewStats,
  listApplications,
} from "@/server/admin/applications";
import { addAssignment, addRole, createProject, saveCompensation } from "@/server/admin/projects";
import { getPublishedOpportunities } from "@/server/public";
import { getSiteContent, saveContent } from "@/lib/content";
import { cookieJar, createUser, resetDb, signIn, submitTestApplication } from "./helpers";

const NOW = Date.now();
const token = () => issueFormToken(NOW - 10_000);
const ctx = (ip = "ip-a") => ({ ipHash: ip, now: NOW });

async function createAdmin(overrides: Partial<{ email: string; status: "ACTIVE" | "DEACTIVATED" | "SUSPENDED"; totp: boolean }> = {}) {
  return createUser({ email: overrides.email, status: overrides.status, totp: overrides.totp ?? true });
}
const authCtx = (ip = "ip") => ({ ipHash: ip });

beforeEach(async () => {
  await resetDb();
  cookieJar.clear();
});

afterAll(async () => {
  await db.$disconnect();
});

describe("spam protection on the public contact form", () => {
  it("silently discards honeypot submissions", async () => {
    const inq = await submitInquiry(
      { name: "Bot", email: "bot@example.test", category: "GENERAL", subject: "x", message: "buy cheap stuff now", website: "x", formToken: token() },
      ctx(),
    );
    expect(inq.ok).toBe(true);
    expect(await db.contactInquiry.count()).toBe(0);
  });
});

describe("contact inquiries", () => {
  it("stores a valid inquiry", async () => {
    const res = await submitInquiry(
      { name: "Bo", email: "bo@example.test", category: "BUSINESS", subject: "Project", message: "We need a website built.", formToken: token() },
      ctx(),
    );
    expect(res.ok).toBe(true);
    expect(await db.contactInquiry.count()).toBe(1);
  });
});

describe("admin authentication", () => {
  it("password step for a 2FA account yields only a pending second-factor session", async () => {
    const admin = await createAdmin();
    const res = await authenticate("FOUNDER@example.test ", "correct-horse-battery-9", authCtx());
    expect(res.ok && res.stage).toBe("mfa");
    expect(await db.session.count({ where: { userId: admin.id, mfaPending: true } })).toBe(1);
  });

  it("returns the same generic error for wrong password and unknown account", async () => {
    await createAdmin();
    const wrong = await authenticate("founder@example.test", "nope", authCtx());
    const unknown = await authenticate("ghost@example.test", "nope", authCtx());
    expect(wrong).toEqual({ ok: false, error: "Invalid email or password." });
    expect(unknown).toEqual(wrong);
  });

  it("after repeated failures from one network that network is locked out, with the same answer as a wrong password", async () => {
    await createAdmin();
    for (let i = 0; i < 5; i++) await authenticate("founder@example.test", "nope", authCtx("ip-attacker"));
    // Even the correct password is refused from that network, and the answer reveals nothing.
    expect(await authenticate("founder@example.test", "correct-horse-battery-9", authCtx("ip-attacker"))).toEqual({ ok: false, error: "Invalid email or password." });
    // The owner, signing in from somewhere else, is not locked out by the attacker.
    const elsewhere = await authenticate("founder@example.test", "correct-horse-battery-9", authCtx("ip-home"));
    expect(elsewhere.ok && elsewhere.stage).toBe("mfa");
    expect(await db.auditLog.count({ where: { action: "auth.locked" } })).toBe(1);
  });

  it("an unknown address locks in exactly the same way (nothing distinguishes it from a real account)", async () => {
    const answers = [];
    for (let i = 0; i < 7; i++) answers.push(await authenticate("ghost@example.test", "nope", authCtx("ip-x")));
    expect(new Set(answers.map((a) => JSON.stringify(a)))).toEqual(new Set([JSON.stringify({ ok: false, error: "Invalid email or password." })]));
  });

  it("rejects deactivated and suspended accounts", async () => {
    await createAdmin({ status: "DEACTIVATED" });
    expect((await authenticate("founder@example.test", "correct-horse-battery-9", authCtx())).ok).toBe(false);
    await createAdmin({ email: "s@example.test", status: "SUSPENDED" });
    const res = await authenticate("s@example.test", "correct-horse-battery-9", authCtx("ip2"));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/suspended/i);
  });
});

describe("admin authorization", () => {
  it("requireAdmin redirects to login without a session", async () => {
    await expect(requireAdmin()).rejects.toThrow("REDIRECT:/login?next=%2Fadmin");
  });

  it("accepts a valid database session", async () => {
    const admin = await createAdmin();
    await signIn(admin.id, admin.role);
    expect((await requireAdmin()).id).toBe(admin.id);
  });

  it("sends administrators without two-step verification to set it up", async () => {
    const admin = await createAdmin({ totp: false });
    await signIn(admin.id, admin.role);
    await expect(requireAdmin()).rejects.toThrow("REDIRECT:/account/security?required=2fa");
  });

  it("rejects revoked, expired and deactivated sessions", async () => {
    const admin = await createAdmin();
    await signIn(admin.id, admin.role);
    await db.session.updateMany({ data: { revokedAt: new Date() } });
    expect(await getCurrentUser()).toBeNull();

    await signIn(admin.id, admin.role);
    await db.session.updateMany({ where: { revokedAt: null }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await getCurrentUser()).toBeNull();

    await signIn(admin.id, admin.role);
    await db.user.update({ where: { id: admin.id }, data: { status: "DEACTIVATED" } });
    expect(await getCurrentUser()).toBeNull();
  });

  it("rejects a forged cookie", async () => {
    await createAdmin();
    cookieJar.set(SESSION_COOKIE, "eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0.");
    expect(await getCurrentUser()).toBeNull();
  });
});

describe("application management", () => {
  async function seedApplication(email = "ada@example.test", opts: Parameters<typeof submitTestApplication>[0] = {}) {
    return (await submitTestApplication({ email, ...opts })).application;
  }

  it("filters by search, category, skill, experience and hours", async () => {
    await seedApplication("ada@example.test");
    await seedApplication("bob@example.test", {
      fullName: "Bob Builder",
      about: { experienceLevel: "EXPERT" },
      skills: { mainSkills: "React, TypeScript", workCategories: ["TECHNOLOGY"], hoursPerWeek: "20" },
    });
    expect((await listApplications({ q: "bob" })).total).toBe(1);
    expect((await listApplications({ category: "TECHNOLOGY" })).total).toBe(1);
    expect((await listApplications({ skill: "react" })).total).toBe(1);
    expect((await listApplications({ experience: "NONE" })).total).toBe(1);
    expect((await listApplications({ minHours: 10 })).total).toBe(1);
    expect((await listApplications({})).total).toBe(2);
  });

  it("accepting creates exactly one participant and is audited", async () => {
    const admin = await createAdmin();
    const app = await seedApplication();
    await updateApplicationStatus(admin.id, app.id, "UNDER_REVIEW");
    await updateApplicationStatus(admin.id, app.id, "ACCEPTED");
    // Approving twice changes nothing (idempotent).
    expect((await updateApplicationStatus(admin.id, app.id, "ACCEPTED")).ok).toBe(true);
    const participants = await db.participant.findMany();
    expect(participants).toHaveLength(1);
    expect(participants[0]!.hoursPerWeek).toBe(5);
    expect(participants[0]!.preferredCategories.sort()).toEqual(["GENERAL_REMOTE", "RESEARCH"]);
    expect(await db.auditLog.count({ where: { action: "application.status_changed" } })).toBe(2);
    const stats = await getOverviewStats();
    expect(stats.accepted).toBe(1);
    expect(stats.activeParticipants).toBe(1);
  });

  it("adds private notes", async () => {
    const admin = await createAdmin();
    const app = await seedApplication();
    await addApplicationNote(admin.id, app.id, "Strong motivation");
    expect(await db.applicationNote.count({ where: { applicationId: app.id } })).toBe(1);
  });

  it("deletes applicant data on request but refuses for participants", async () => {
    const admin = await createAdmin();
    const a = await seedApplication("a@example.test");
    const b = await seedApplication("b@example.test");
    await updateApplicationStatus(admin.id, b.id, "ACCEPTED");

    expect((await deleteApplicantData(admin.id, a.id)).ok).toBe(true);
    expect(await db.applicant.count({ where: { email: "a@example.test" } })).toBe(0);
    expect(await db.applicantSkill.count({ where: { applicant: { email: "a@example.test" } } })).toBe(0);

    expect((await deleteApplicantData(admin.id, b.id)).ok).toBe(false);
    expect(await db.applicant.count({ where: { email: "b@example.test" } })).toBe(1);
  });
});

describe("projects and public exposure", () => {
  it("publishes only public fields; never participants or compensation", async () => {
    const admin = await createAdmin();
    const { application: app } = await submitTestApplication();
    await updateApplicationStatus(admin.id, app.id, "ACCEPTED");
    const participant = await db.participant.findFirstOrThrow();

    const project = await createProject(admin.id, {
      title: "Market Research",
      summary: "INTERNAL-SECRET summary",
      description: "Customer: ACME internal",
      category: "RESEARCH",
      status: "SEEKING_PARTICIPANTS",
      isPublished: true,
      publicSummary: "Help research a market.",
      startDate: null,
      targetDate: null,
    });
    await addRole(admin.id, { projectId: project.id, title: "Researcher", responsibilities: null, openings: 1, skills: "Online research" });
    const role = await db.projectRole.findFirstOrThrow();
    expect((await addAssignment(admin.id, { projectId: project.id, participantId: participant.id, roleId: role.id, responsibilities: null })).ok).toBe(true);
    expect((await addAssignment(admin.id, { projectId: project.id, participantId: participant.id, roleId: null, responsibilities: null })).ok).toBe(false);
    const assignment = await db.projectAssignment.findFirstOrThrow();
    await saveCompensation(admin.id, {
      assignmentId: assignment.id,
      terms: "SECRET-TERMS",
      basis: "fixed",
      amount: 10000,
      currency: "USD",
      status: "AGREED",
      documentRef: null,
    });
    const comp = await db.compensationAgreement.findFirstOrThrow();
    expect(comp.agreedAt).not.toBeNull();

    const published = await getPublishedOpportunities();
    expect(published).toHaveLength(1);
    const serialized = JSON.stringify(published);
    for (const secret of ["INTERNAL-SECRET", "ACME", "SECRET-TERMS", "Ada", "ada@example.test", "10000"]) {
      expect(serialized).not.toContain(secret);
    }
    expect(published[0]!.roles[0]!.skills).toEqual(["Online research"]);

    // Audit metadata for compensation must not contain the terms or amount.
    const log = await db.auditLog.findFirstOrThrow({ where: { action: "compensation.saved" } });
    expect(JSON.stringify(log.metadata)).not.toMatch(/SECRET|10000/);

    await db.project.update({ where: { id: project.id }, data: { isPublished: false } });
    expect(await getPublishedOpportunities()).toHaveLength(0);
  });
});

describe("site content", () => {
  it("falls back to defaults and applies saved overrides", async () => {
    const admin = await createAdmin();
    const before = await getSiteContent();
    expect(before.company.name).toBe("TestOrg");
    await saveContent("hero", { eyebrow: "", headline: "New headline", subheadline: "Sub" }, admin.id);
    // getSiteContent is request-cached via React cache(); outside React it re-reads.
    const after = await getSiteContent();
    expect(after.hero.headline).toBe("New headline");
  });

  it("ignores invalid stored overrides", async () => {
    await db.siteContent.create({ data: { key: "hero", value: { headline: 123 } } });
    const c = await getSiteContent();
    expect(c.hero.headline).toBe("Together We Innovate, Grow & Opportunity");
  });
});
