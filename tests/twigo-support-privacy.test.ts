/** Twigo Stage 10: community support records and reports, privacy requests, the idea form and group acknowledgment. */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { can } from "@/lib/auth/permissions";
import { addSupportEntryAction, privacyRequestStatusAction, publishSupportReportAction } from "@/app/admin/actions/twigo";
import { privacyRequestAction } from "@/app/account/actions";
import { createIdeaAction, endorseAction } from "@/app/community/actions";
import { addEntry, createReport, publishReport, publishedReports } from "@/server/community-support";
import { exportUserData } from "@/server/privacy";
import { MAX_OPEN_REQUESTS, submitPrivacyRequest } from "@/server/privacy-requests";
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
const redirectOf = async (p: Promise<unknown>) => p.then(() => "").catch((e: Error) => (e.message.startsWith("REDIRECT:") ? e.message.slice(9) : Promise.reject(e)));

describe("community support", () => {
  it("published report totals are frozen; later entries do not change them", async () => {
    const owner = await createUser({ email: "owner@example.test", totp: true });
    await addEntry(owner.id, { kind: "CONTRIBUTION", amount: "100", currency: "USD", occurredOn: "2027-01-10", description: "Test contribution", contributorName: "Test Person" });
    await addEntry(owner.id, { kind: "OPERATING_EXPENSE", amount: "30.50", currency: "USD", occurredOn: "2027-01-20", description: "Test hosting" });
    expect((await createReport(owner.id, { title: "January 2027", periodStart: "2027-01-01", periodEnd: "2027-01-31", currency: "USD", note: "" })).ok).toBe(true);
    expect(await publishedReports()).toEqual([]); // not public before publication
    const r = await db.supportReport.findFirstOrThrow();
    expect((await publishReport(owner.id, r.id)).ok).toBe(true);
    expect((await publishReport(owner.id, r.id)).ok).toBe(false);
    await addEntry(owner.id, { kind: "CONTRIBUTION", amount: "999", currency: "USD", occurredOn: "2027-01-15", description: "Late entry" });
    const [pub] = await publishedReports();
    expect(pub!.totals).toEqual({ contributions: 10000, operating: 3050, development: 0, other: 0, balance: 6950 });
    // The public report has totals only: no names.
    expect(JSON.stringify(pub)).not.toContain("Test Person");
  });

  it("the audit log records support entries without amounts or names", async () => {
    const owner = await createUser({ email: "owner@example.test", totp: true });
    await addEntry(owner.id, { kind: "CONTRIBUTION", amount: "42", currency: "USD", occurredOn: "2027-01-10", description: "Test", contributorName: "Secret Name" });
    const log = await db.auditLog.findFirstOrThrow({ where: { action: "support.entry_added" } });
    expect(JSON.stringify(log.metadata)).not.toMatch(/42|Secret/);
  });

  it("invalid amounts are refused", async () => {
    const owner = await createUser({ email: "owner@example.test", totp: true });
    for (const amount of ["-5", "abc", "1.234", ""]) {
      expect((await addEntry(owner.id, { kind: "CONTRIBUTION", amount, currency: "USD", occurredOn: "2027-01-10", description: "Test" })).ok).toBe(false);
    }
  });

  it("only the owner manages support records", async () => {
    expect(can("ADMIN", "support.manage")).toBe(false);
    await createUser({ email: "owner@example.test", totp: true });
    const admin = await createUser({ email: "admin@example.test", role: "ADMIN", totp: true });
    await signIn(admin.id, "ADMIN");
    expect(await redirectOf(addSupportEntryAction(undefined, form({ kind: "CONTRIBUTION", amount: "5", currency: "USD", occurredOn: "2027-01-10", description: "Test" })))).toBe("/admin/no-access");
    expect(await redirectOf(publishSupportReportAction(form({ id: "x", confirm: "on" })))).toBe("/admin/no-access");
    expect(await db.supportLedgerEntry.count()).toBe(0);
  });
});

describe("privacy requests", () => {
  it("a member sends a request, sees it, and the owner answers it; every step is audited", async () => {
    const owner = await createUser({ email: "owner@example.test", totp: true });
    const m = await createMember("Mia");
    await signIn(m.id);
    expect(await privacyRequestAction(undefined, form({ kind: "CORRECTION", details: "short" }))).toMatchObject({ error: expect.any(String) });
    // Deletion has its own verified path since 24 November 2026 (tests/privacy-access-control.test.ts).
    expect(await privacyRequestAction(undefined, form({ kind: "DELETION", details: "Please delete my profile and my comments." }))).toMatchObject({ error: expect.any(String) });
    expect(await privacyRequestAction(undefined, form({ kind: "CORRECTION", details: "Please correct my country to Canada." }))).toMatchObject({ ok: expect.any(String) });
    const r = await db.privacyRequest.findFirstOrThrow();
    expect(r).toMatchObject({ userId: m.id, email: m.email, kind: "CORRECTION", status: "OPEN" });

    cookieJar.clear();
    await signIn(owner.id, "OWNER");
    // Closing without saying what was done is refused.
    await redirectOf(privacyRequestStatusAction(form({ id: r.id, status: "COMPLETED", response: "" })));
    expect((await db.privacyRequest.findUniqueOrThrow({ where: { id: r.id } })).status).toBe("OPEN");
    await redirectOf(privacyRequestStatusAction(form({ id: r.id, status: "COMPLETED", response: "Country corrected." })));
    expect(await db.privacyRequest.findUniqueOrThrow({ where: { id: r.id } })).toMatchObject({ status: "COMPLETED", response: "Country corrected.", handledById: owner.id });
    const actions = (await db.auditLog.findMany()).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(["privacy.request_submitted", "privacy.request_updated"]));
    // The member's data export contains the request and its answer.
    const exp = await exportUserData(m.id);
    expect(exp.privacyRequests).toEqual([expect.objectContaining({ kind: "CORRECTION", status: "COMPLETED", response: "Country corrected." })]);
    // The member is told in the app.
    expect(await db.notification.count({ where: { userId: m.id, title: "Your privacy request was updated" } })).toBe(1);
  });

  it("limits open requests per person", async () => {
    const m = await createMember("Mia");
    for (let i = 0; i < MAX_OPEN_REQUESTS; i++) expect((await submitPrivacyRequest(m.id, { kind: "ACCESS", details: `Request number ${i} with details.` })).ok).toBe(true);
    expect((await submitPrivacyRequest(m.id, { kind: "ACCESS", details: "One request too many here." })).ok).toBe(false);
  });

  it("administrators (the management team) handle privacy requests; members cannot (decision of 24 November 2026)", async () => {
    expect(can("ADMIN", "privacy.requests")).toBe(true);
    expect(can("MEMBER", "privacy.requests")).toBe(false);
    await createUser({ email: "owner@example.test", totp: true });
    const m = await createMember("Mia");
    await submitPrivacyRequest(m.id, { kind: "ACCESS", details: "Please send me my information." });
    const r = await db.privacyRequest.findFirstOrThrow();
    const other = await createMember("Nia");
    await signIn(other.id);
    expect(await redirectOf(privacyRequestStatusAction(form({ id: r.id, status: "REJECTED", response: "No reason at all" })))).not.toBe("");
    expect((await db.privacyRequest.findUniqueOrThrow({ where: { id: r.id } })).status).toBe("OPEN");
    const admin = await createUser({ email: "admin@example.test", role: "ADMIN", totp: true });
    await signIn(admin.id, "ADMIN");
    await redirectOf(privacyRequestStatusAction(form({ id: r.id, status: "IN_PROGRESS", response: "" })));
    expect((await db.privacyRequest.findUniqueOrThrow({ where: { id: r.id } })).status).toBe("IN_PROGRESS");
  });
});

describe("ideas and group participation", () => {
  const IDEA = {
    title: "Neighborhood bookkeeping service",
    summary: "Small local shops need simple, affordable monthly bookkeeping help.",
    category: "ONLINE_SERVICES",
    expectedActivities: "Monthly ledgers",
    objectives: "Three paying shops in six months",
    collaborationApproach: "Weekly call, shared notes",
  };

  it("publishing an idea requires acknowledging who can see it and who owns it; the new fields are stored", async () => {
    const a = await createMember("Alice");
    await signIn(a.id);
    const without = await createIdeaAction(undefined, form(IDEA)).catch((e: Error) => e);
    expect(without).not.toBeInstanceOf(Error);
    expect(await db.businessIdea.count()).toBe(0);
    const res = await redirectOf(createIdeaAction(undefined, form({ ...IDEA, visibilityAck: "on" })));
    expect(res).toMatch(/^\/community\/ideas\//);
    const idea = await db.businessIdea.findFirstOrThrow();
    expect(idea).toMatchObject({ expectedActivities: "Monthly ledgers", objectives: "Three paying shops in six months", collaborationApproach: "Weekly call, shared notes" });
  });

  it("supporting an idea records the Group Participation Agreement acknowledgment", async () => {
    const [a, b] = [await createMember("Alice"), await createMember("Bob")];
    await signIn(a.id);
    await redirectOf(createIdeaAction(undefined, form({ ...IDEA, visibilityAck: "on" })));
    const idea = await db.businessIdea.findFirstOrThrow();
    cookieJar.clear();
    await signIn(b.id);
    await redirectOf(endorseAction(form({ id: idea.id })));
    const rec = await db.legalAcceptance.findFirst({ where: { userId: b.id, documentKey: "group-participation" } });
    expect(rec).toMatchObject({ method: "idea-support", context: idea.id, kind: "ACCEPTED" });
  });
});
