/** The one-time publication of the reviewed legal documents, and legal notices from the settings. */
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { resetEnvCache } from "@/lib/env";
import { LEGAL_DOCUMENTS } from "@/content/legal";
import { publishReviewedDocuments } from "@/ops/legal-publish";
import { displayedVersion, ensureLegalDocuments, pendingReacceptance } from "@/server/legal";
import { publicNotices, saveNotices, emptyNotices } from "@/server/legal-notices";
import { registerAccount } from "@/server/onboarding";
import { createMember, createUser, resetDb } from "./helpers";

beforeEach(async () => {
  await resetDb();
});
afterEach(() => {
  for (const k of ["ORG_LEGAL_NAME", "ORG_JURISDICTION", "ORG_CONTACT_EMAIL"]) process.env[k] = "";
  resetEnvCache();
});
afterAll(async () => {
  await db.$disconnect();
});

const NOTE = "Reviewed by Example Law (test) on 2026-11-20; publication confirmed by the owner.";

describe("publishing the reviewed legal documents", () => {
  it("approves and publishes exactly the reviewed texts, records the reviewer, and keeps earlier acceptances valid", async () => {
    const owner = await createUser({ email: "owner@example.test", totp: true });
    // Someone registered while the texts were still pending review.
    expect((await registerAccount({ fullName: "Nora New", email: "nora@example.test", password: "a-long-password-123", confirm: "a-long-password-123", acceptTerms: true, acceptGuidelines: true, ackPrivacy: true }, { ipHash: "ip" })).ok).toBe(true);
    const res = await publishReviewedDocuments(db, { ownerId: owner.id, orgName: process.env.ORG_NAME!, approvalNote: NOTE, effectiveDate: new Date("2026-12-01T00:00:00Z") });
    expect(res.map((r) => r.result)).toEqual(LEGAL_DOCUMENTS.map(() => "published"));
    for (const def of LEGAL_DOCUMENTS) {
      const v = (await displayedVersion(def.key))!.version;
      expect(v).toMatchObject({ status: "PUBLISHED", version: 1, approvalNote: NOTE, approvedById: owner.id });
      expect(v.effectiveDate?.toISOString().slice(0, 10)).toBe("2026-12-01");
    }
    expect(await db.auditLog.count({ where: { action: "legal.status_published" } })).toBe(LEGAL_DOCUMENTS.length);
    // Nora accepted exactly these texts: nothing to accept again.
    const nora = await db.user.findUniqueOrThrow({ where: { email: "nora@example.test" } });
    expect(await pendingReacceptance(nora.id)).toEqual([]);
    // Running it again changes nothing.
    expect((await publishReviewedDocuments(db, { ownerId: owner.id, orgName: process.env.ORG_NAME!, approvalNote: NOTE, effectiveDate: new Date() })).map((r) => r.result)).toEqual(LEGAL_DOCUMENTS.map(() => "already-published"));
  });

  it("leaves a text that differs from the reviewed one untouched", async () => {
    const owner = await createUser({ email: "owner@example.test", totp: true });
    await ensureLegalDocuments();
    await db.legalDocumentVersion.updateMany({ where: { document: { key: "cookies" } }, data: { contentHash: "0".repeat(64) } });
    const res = await publishReviewedDocuments(db, { ownerId: owner.id, orgName: process.env.ORG_NAME!, approvalNote: NOTE, effectiveDate: new Date() });
    expect(res.find((r) => r.key === "cookies")?.result).toBe("text-differs");
    expect((await db.legalDocumentVersion.findFirstOrThrow({ where: { document: { key: "cookies" } } })).status).toBe("PENDING_LEGAL_REVIEW");
  });

  it("only the owner, and only with a reviewer statement", async () => {
    const m = await createMember("Mia");
    await expect(publishReviewedDocuments(db, { ownerId: m.id, orgName: process.env.ORG_NAME!, approvalNote: NOTE, effectiveDate: new Date() })).rejects.toThrow(/owner/);
    const owner = await createUser({ email: "owner@example.test", totp: true });
    await expect(publishReviewedDocuments(db, { ownerId: owner.id, orgName: process.env.ORG_NAME!, approvalNote: "ok", effectiveDate: new Date() })).rejects.toThrow(/who reviewed/);
  });
});

describe("legal notices from the production settings", () => {
  it("shows the operator and contact from the settings; a value confirmed in the admin area wins", async () => {
    Object.assign(process.env, { ORG_LEGAL_NAME: "Twigo", ORG_CONTACT_EMAIL: "contact@twigo.space", ORG_JURISDICTION: "" });
    resetEnvCache();
    const pub = Object.fromEntries((await publicNotices()).map((n) => [n.key, n.value]));
    expect(pub).toMatchObject({ operatorName: "Twigo", contactEmail: "contact@twigo.space", privacyContact: "contact@twigo.space", jurisdiction: null, governingLaw: null });
    const owner = await createUser({ email: "owner@example.test", totp: true });
    await saveNotices(owner.id, { ...emptyNotices(), contactEmail: { value: "hello@twigo.space", confirmed: true } });
    expect((await publicNotices()).find((n) => n.key === "contactEmail")?.value).toBe("hello@twigo.space");
  });
});
