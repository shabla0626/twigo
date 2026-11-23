/**
 * Twigo Stage 10, legal workflow: document versions, fingerprints, acceptance records and timestamps,
 * renewed acceptance after a material change, access to earlier versions, legal notices, audit logging
 * and who may do what.
 */
import { createHash } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { requireMember } from "@/lib/auth/guard";
import { can } from "@/lib/auth/permissions";
import { LEGAL_DOCUMENTS } from "@/content/legal";
import { acceptUpdatedDocumentsAction } from "@/app/(site)/legal/review/actions";
import { legalStatusAction, newDraftAction, saveNoticesAction } from "@/app/admin/actions/twigo";
import {
  changeStatus,
  createDraftVersion,
  displayedVersion,
  editDraft,
  ensureLegalDocuments,
  pendingReacceptance,
  publicHistory,
  publicVersion,
  recordAcceptance,
} from "@/server/legal";
import { NOTICE_KEYS, publicNotices, readNotices } from "@/server/legal-notices";
import { registerAccount } from "@/server/onboarding";
import { cookieJar, createMember, createUser, resetDb, signIn } from "./helpers";

beforeEach(async () => {
  await resetDb();
  cookieJar.clear();
});
afterAll(async () => {
  await db.$disconnect();
});

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const form = (data: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(data)) fd.set(k, v);
  return fd;
};
const redirectOf = async (p: Promise<unknown>) => p.then(() => "").catch((e: Error) => (e.message.startsWith("REDIRECT:") ? e.message.slice(9) : Promise.reject(e)));
const NEW = { fullName: "Nora New", email: "nora@example.test", password: "a-long-password-123", confirm: "a-long-password-123", acceptTerms: true, acceptGuidelines: true, ackPrivacy: true };
const LONG_TEXT = "## Terms of Use\n\nThis is a rewritten test version of the Terms of Use, long enough to be accepted by the editor.\n";

/** A new draft; fails the test when none could be created. */
async function draft(ownerId: string, key: Parameters<typeof createDraftVersion>[1]) {
  const r = await createDraftVersion(ownerId, key);
  if (!r.ok || !r.id) throw new Error(r.ok ? "no id" : r.error);
  return { ok: true as const, id: r.id };
}

/** Takes the Terms through a full new version: draft, edit, review, approval, publication. */
async function publishNewTerms(ownerId: string, opts: { reaccept: boolean }) {
  const d = await createDraftVersion(ownerId, "terms");
  if (!d.ok || !d.id) throw new Error("no draft");
  expect(await editDraft(ownerId, d.id, { content: LONG_TEXT, changeSummary: "Rewritten for the test", materialChange: true, requiresReacceptance: opts.reaccept })).toEqual({ ok: true });
  expect((await changeStatus(ownerId, d.id, "PENDING_LEGAL_REVIEW")).ok).toBe(true);
  expect((await changeStatus(ownerId, d.id, "APPROVED", { approvalNote: "Reviewed by a test reviewer on the test date" })).ok).toBe(true);
  expect((await changeStatus(ownerId, d.id, "PUBLISHED", { effectiveDate: new Date("2027-01-01T00:00:00Z") })).ok).toBe(true);
  return d.id;
}

describe("document versions and fingerprints", () => {
  it("every document starts as version 1, awaiting legal review, never approved automatically", async () => {
    await ensureLegalDocuments();
    const versions = await db.legalDocumentVersion.findMany({ include: { document: true } });
    expect(versions).toHaveLength(LEGAL_DOCUMENTS.length);
    for (const v of versions) {
      expect(v.version).toBe(1);
      expect(v.status).toBe("PENDING_LEGAL_REVIEW");
      expect(v.approvedAt).toBeNull();
      expect(v.contentHash).toBe(sha(v.content));
      // No unfinished bracketed placeholder such as "[Company Name]" in any text.
      expect(v.content).not.toMatch(/\[[A-Z][^\]\n]{2,60}\](?!\()/);
    }
  });

  it("a draft's fingerprint follows its text; a frozen version cannot be edited", async () => {
    const owner = await createUser({ email: "owner@example.test", totp: true });
    const d = await draft(owner.id, "privacy");
    expect(d.ok).toBe(true);
    expect((await createDraftVersion(owner.id, "privacy")).ok).toBe(false); // one draft at a time
    await editDraft(owner.id, d.id!, { content: LONG_TEXT, changeSummary: "x", materialChange: false, requiresReacceptance: true });
    const v = await db.legalDocumentVersion.findUniqueOrThrow({ where: { id: d.id! } });
    expect(v.contentHash).toBe(sha(v.content));
    expect(v.requiresReacceptance).toBe(false); // only a material change can ask for renewed acceptance
    await changeStatus(owner.id, d.id!, "PENDING_LEGAL_REVIEW");
    expect(await editDraft(owner.id, d.id!, { content: LONG_TEXT + "more", changeSummary: "", materialChange: false, requiresReacceptance: false })).toMatchObject({ ok: false });
  });

  it("refuses bracketed placeholders in a draft", async () => {
    const owner = await createUser({ email: "owner@example.test", totp: true });
    const d = await draft(owner.id, "terms");
    const res = await editDraft(owner.id, d.id!, { content: `${LONG_TEXT}\nOperated by [Company Name].`, changeSummary: "", materialChange: false, requiresReacceptance: false });
    expect(res).toMatchObject({ ok: false });
    // A real link is not a placeholder.
    expect((await editDraft(owner.id, d.id!, { content: `${LONG_TEXT}\nSee the [Privacy Policy](/legal/privacy).`, changeSummary: "", materialChange: false, requiresReacceptance: false })).ok).toBe(true);
  });

  it("states move only in order, and approval needs a statement of who reviewed the text", async () => {
    const owner = await createUser({ email: "owner@example.test", totp: true });
    const d = await draft(owner.id, "cookies");
    expect((await changeStatus(owner.id, d.id!, "APPROVED", { approvalNote: "Reviewed by a test reviewer" })).ok).toBe(false); // a draft cannot be approved
    expect((await changeStatus(owner.id, d.id!, "PUBLISHED")).ok).toBe(false);
    await changeStatus(owner.id, d.id!, "PENDING_LEGAL_REVIEW");
    expect((await changeStatus(owner.id, d.id!, "PUBLISHED")).ok).toBe(false); // not approved yet
    expect((await changeStatus(owner.id, d.id!, "APPROVED", { approvalNote: "ok" })).ok).toBe(false); // note too short
    expect((await changeStatus(owner.id, d.id!, "APPROVED", { approvalNote: "Reviewed by a test reviewer" })).ok).toBe(true);
  });

  it("the approval form also requires ticking that a lawyer reviewed this exact version", async () => {
    const owner = await createUser({ email: "owner@example.test", totp: true });
    await signIn(owner.id, "OWNER");
    const d = await draft(owner.id, "cookies");
    await changeStatus(owner.id, d.id!, "PENDING_LEGAL_REVIEW");
    await redirectOf(legalStatusAction(form({ key: "cookies", versionId: d.id!, to: "APPROVED", approvalNote: "Reviewed by a test reviewer" })));
    expect((await db.legalDocumentVersion.findUniqueOrThrow({ where: { id: d.id! } })).status).toBe("PENDING_LEGAL_REVIEW");
    await redirectOf(legalStatusAction(form({ key: "cookies", versionId: d.id!, to: "APPROVED", reviewed: "on", approvalNote: "Reviewed by a test reviewer" })));
    expect((await db.legalDocumentVersion.findUniqueOrThrow({ where: { id: d.id! } })).status).toBe("APPROVED");
  });
});

describe("acceptance records", () => {
  it("registration records Terms and Guidelines as accepted and the Privacy Policy as acknowledged, with version, fingerprint and time", async () => {
    const before = Date.now();
    expect((await registerAccount(NEW, { ipHash: "ip-1" })).ok).toBe(true);
    const user = await db.user.findUniqueOrThrow({ where: { email: NEW.email } });
    const recs = await db.legalAcceptance.findMany({ where: { userId: user.id }, include: { legalVersion: true } });
    const byKey = Object.fromEntries(recs.map((r) => [r.documentKey, r]));
    expect(Object.keys(byKey).sort()).toEqual(["community-guidelines", "privacy", "terms"]);
    expect(byKey.terms!.kind).toBe("ACCEPTED");
    expect(byKey["community-guidelines"]!.kind).toBe("ACCEPTED");
    expect(byKey.privacy!.kind).toBe("ACKNOWLEDGED");
    for (const r of recs) {
      expect(r.method).toBe("registration");
      expect(r.version).toBe(r.legalVersion.version);
      expect(r.contentHash).toBe(r.legalVersion.contentHash);
      expect(r.acceptedAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
      expect(r.acceptedAt.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
    }
  });

  it("each consent is separate: missing any one of the three stops registration and creates nothing", async () => {
    for (const missing of ["acceptTerms", "acceptGuidelines", "ackPrivacy"]) {
      const res = await registerAccount({ ...NEW, [missing]: false }, { ipHash: `ip-${missing}` });
      expect(res.ok).toBe(false);
    }
    expect(await db.user.count()).toBe(0);
    expect(await db.legalAcceptance.count()).toBe(0);
  });

  it("a form showing an older version cannot record acceptance of a newer text", async () => {
    const owner = await createUser({ email: "owner@example.test", totp: true });
    const shownBefore = (await displayedVersion("terms"))!.version.id;
    await publishNewTerms(owner.id, { reaccept: false });
    const res = await registerAccount({ ...NEW, legalVersions: [shownBefore] }, { ipHash: "ip-2" });
    expect(res.ok).toBe(false);
    expect(await db.user.count({ where: { email: NEW.email } })).toBe(0);
  });
});

describe("renewed acceptance after a material change", () => {
  it("existing members must accept the published new Terms before continuing; the record names the new version", async () => {
    const owner = await createUser({ email: "owner@example.test", totp: true });
    const m = await createMember("Mia");
    await recordAcceptance({ userId: m.id, key: "terms", kind: "ACCEPTED", method: "registration" });
    expect(await pendingReacceptance(m.id)).toEqual([]);

    const v2 = await publishNewTerms(owner.id, { reaccept: true });
    const pending = await pendingReacceptance(m.id);
    expect(pending).toEqual([expect.objectContaining({ key: "terms", version: 2, versionId: v2, kind: "ACCEPTED" })]);

    await signIn(m.id);
    expect(await redirectOf(requireMember())).toBe("/legal/review");
    // Not ticking the box is refused.
    expect(await acceptUpdatedDocumentsAction(undefined, form({}))).toMatchObject({ error: expect.any(String) });
    expect(await redirectOf(acceptUpdatedDocumentsAction(undefined, form({ versionId: v2 })))).toBe("/continue");
    expect(await pendingReacceptance(m.id)).toEqual([]);
    const rec = await db.legalAcceptance.findFirstOrThrow({ where: { userId: m.id, versionId: v2 } });
    expect(rec).toMatchObject({ method: "reacceptance", version: 2, documentKey: "terms" });
    expect(await redirectOf(requireMember())).toBe("");
  });

  it("a change published without asking for renewed acceptance does not block anyone", async () => {
    const owner = await createUser({ email: "owner@example.test", totp: true });
    const m = await createMember("Mia");
    await publishNewTerms(owner.id, { reaccept: false });
    expect(await pendingReacceptance(m.id)).toEqual([]);
  });
});

describe("earlier versions stay readable", () => {
  it("after publishing version 2, version 1 is superseded but still public; drafts never are", async () => {
    const owner = await createUser({ email: "owner@example.test", totp: true });
    await publishNewTerms(owner.id, { reaccept: false });
    expect((await displayedVersion("terms"))!.version.version).toBe(2);
    const v1 = await publicVersion("terms", 1);
    expect(v1?.version.status).toBe("SUPERSEDED");
    expect(v1?.version.content.length).toBeGreaterThan(500);
    const d3 = await draft(owner.id, "terms");
    expect(d3.ok).toBe(true);
    expect(await publicVersion("terms", 3)).toBeNull();
    expect((await publicHistory("terms")).map((h) => [h.version, h.status])).toEqual([
      [2, "PUBLISHED"],
      [1, "SUPERSEDED"],
    ]);
  });

  it("a version someone accepted can no longer be sent back to draft", async () => {
    const owner = await createUser({ email: "owner@example.test", totp: true });
    const m = await createMember("Mia");
    await recordAcceptance({ userId: m.id, key: "terms", kind: "ACCEPTED", method: "registration" });
    const v1 = (await displayedVersion("terms"))!.version;
    expect(await changeStatus(owner.id, v1.id, "DRAFT")).toMatchObject({ ok: false });
  });
});

describe("audit and authorization", () => {
  it("every state change is in the audit log", async () => {
    const owner = await createUser({ email: "owner@example.test", totp: true });
    await publishNewTerms(owner.id, { reaccept: false });
    const actions = (await db.auditLog.findMany({ where: { actorId: owner.id }, orderBy: { createdAt: "asc" } })).map((a) => a.action);
    for (const a of ["legal.draft_created", "legal.draft_edited", "legal.status_pending_legal_review", "legal.status_approved", "legal.status_published"]) expect(actions).toContain(a);
  });

  it("only the owner manages legal documents and notices", async () => {
    expect(can("OWNER", "legal.manage")).toBe(true);
    expect(can("ADMIN", "legal.manage")).toBe(false);
    expect(can("MEMBER", "legal.manage")).toBe(false);
    await createUser({ email: "owner@example.test", totp: true });
    const admin = await createUser({ email: "admin@example.test", role: "ADMIN", totp: true });
    await signIn(admin.id, "ADMIN");
    expect(await redirectOf(newDraftAction(form({ key: "terms" })))).toBe("/admin/no-access");
    expect(await redirectOf(saveNoticesAction(undefined, form({ operatorName_value: "Someone", operatorName_confirmed: "on" })))).toBe("/admin/no-access");
    expect(await db.legalDocumentVersion.count({ where: { status: "DRAFT" } })).toBe(0);
  });

  it("legal notices stay private until confirmed", async () => {
    const owner = await createUser({ email: "owner@example.test", totp: true });
    await signIn(owner.id, "OWNER");
    const fd = form({ operatorName_value: "Test Operator", jurisdiction_value: "Test Land", jurisdiction_confirmed: "on" });
    expect(await saveNoticesAction(undefined, fd)).toMatchObject({ ok: expect.any(String) });
    const pub = Object.fromEntries((await publicNotices()).map((n) => [n.key, n.value]));
    expect(pub.operatorName).toBeNull(); // entered, not confirmed
    expect(pub.jurisdiction).toBe("Test Land");
    expect((await readNotices()).operatorName).toEqual({ value: "Test Operator", confirmed: false });
    expect(NOTICE_KEYS.length).toBeGreaterThanOrEqual(9);
  });
});
