/** The one-time publication of the reviewed legal documents, and legal notices from the settings. */
import { createHash } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { resetEnvCache } from "@/lib/env";
import { LEGAL_DOCUMENTS } from "@/content/legal";
import { publishReviewedDocuments } from "@/ops/legal-publish";
import { changeStatus, displayedVersion, ensureLegalDocuments, pendingReacceptance } from "@/server/legal";
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
    // The Privacy Policy (version 1) says the hosting provider "will be named here before this policy is
    // published": it is not finished, so it is neither approved nor published, and keeps saying it is a draft.
    expect(res.map((r) => r.result)).toEqual(LEGAL_DOCUMENTS.map((d) => (d.key === "privacy" ? "incomplete" : "published")));
    expect(res.find((r) => r.key === "privacy")?.reason).toMatch(/before this policy is published/);
    for (const def of LEGAL_DOCUMENTS) {
      const v = (await displayedVersion(def.key))!.version;
      if (def.key === "privacy") {
        // Version 2, prepared in the release, is shown awaiting review; the script never publishes it.
        expect(v).toMatchObject({ status: "PENDING_LEGAL_REVIEW", version: 2, approvalNote: null, effectiveDate: null });
        continue;
      }
      expect(v).toMatchObject({ status: "PUBLISHED", version: 1, approvalNote: NOTE, approvedById: owner.id });
      expect(v.effectiveDate?.toISOString().slice(0, 10)).toBe("2026-12-01");
      expect(v.changeSummary ?? "").not.toMatch(/not reviewed/i);
    }
    expect(await db.auditLog.count({ where: { action: "legal.status_published" } })).toBe(LEGAL_DOCUMENTS.length - 1);
    // Nora accepted exactly these texts: nothing to accept again.
    const nora = await db.user.findUniqueOrThrow({ where: { email: "nora@example.test" } });
    expect(await pendingReacceptance(nora.id)).toEqual([]);
    // Running it again changes nothing.
    expect((await publishReviewedDocuments(db, { ownerId: owner.id, orgName: process.env.ORG_NAME!, approvalNote: NOTE, effectiveDate: new Date() })).map((r) => r.result)).toEqual(
      LEGAL_DOCUMENTS.map((d) => (d.key === "privacy" ? "incomplete" : "already-published")),
    );
  });

  it("the texts of this release are exactly the version 1 texts the founder reports were reviewed (23 November 2026)", () => {
    // If a text changes, it is no longer the reviewed text: the publication script would then publish an
    // unreviewed text as reviewed. Change these fingerprints only together with a new, reviewed version.
    const REVIEWED: Record<string, string> = {
      terms: "26a10ac490152de5398ab2c4ee8cc804ad63aca776edf37c3cd184bffeb467e1",
      privacy: "95e19ccfabc9f14175fce38149f8d922422622132629e58221c36a8da01ad0f7",
      "community-guidelines": "2252f14d2ac448f68b6836be000341120a6d4585b2753015640b56aeff2ada21",
      "intellectual-property": "d93a56c263ccbdd903739d0c648e7188dd4c2a7f720767699f5fd12af187acce",
      "participation-compensation": "fb1557f6d9df34d8e8e885fa9652f145720b3a2e50f73844d85d26d272590d6d",
      "group-participation": "bc7134b99b96d1ed9e3e2f217b0c60acefe07e72d22ec5e25b394eb344bd402a",
      cookies: "216b112c08e8fc7e510379c99d6fb9452ee89273ea78133ab180eb3b5d0b2d79",
      "community-support": "e993eb2a1c4c7846b0e4fef5c1384ee4f2726b42c7fa74357d9b9dcf8113880b",
    };
    for (const def of LEGAL_DOCUMENTS) expect(createHash("sha256").update(def.text("Twigo")).digest("hex"), def.key).toBe(REVIEWED[def.key]);
  });

  it("an unfinished text cannot be approved or published through the admin area either", async () => {
    const owner = await createUser({ email: "owner@example.test", totp: true });
    await ensureLegalDocuments();
    // Version 1 of the Privacy Policy, as it is in a database where version 2 was not added yet.
    const privacy = await db.legalDocumentVersion.findFirstOrThrow({ where: { document: { key: "privacy" }, version: 1 } });
    await db.legalDocumentVersion.update({ where: { id: privacy.id }, data: { status: "PENDING_LEGAL_REVIEW", supersededAt: null } });
    const res = await changeStatus(owner.id, privacy.id, "APPROVED", { approvalNote: NOTE });
    expect(res).toMatchObject({ ok: false });
    if (!res.ok) expect(res.error).toMatch(/before publication/);
    expect((await db.legalDocumentVersion.findUniqueOrThrow({ where: { id: privacy.id } })).status).toBe("PENDING_LEGAL_REVIEW");
    // A finished text (the Terms) can be approved; its summary no longer claims it was never reviewed.
    const terms = await db.legalDocumentVersion.findFirstOrThrow({ where: { document: { key: "terms" } } });
    // Databases created before 24 November 2026 stored this summary with version 1.
    await db.legalDocumentVersion.update({ where: { id: terms.id }, data: { changeSummary: "First version, prepared for the Twigo community. Not reviewed by a lawyer." } });
    expect((await changeStatus(owner.id, terms.id, "APPROVED", { approvalNote: NOTE })).ok).toBe(true);
    expect((await changeStatus(owner.id, terms.id, "PUBLISHED", { effectiveDate: new Date("2026-12-01T00:00:00Z") })).ok).toBe(true);
    expect((await db.legalDocumentVersion.findUniqueOrThrow({ where: { id: terms.id } })).changeSummary ?? "").not.toMatch(/not reviewed/i);
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
  it("shows the contact and jurisdiction from the settings, never the community name as legal operator or the jurisdiction as governing law; a value confirmed in the admin area wins", async () => {
    Object.assign(process.env, { ORG_LEGAL_NAME: "Twigo", ORG_CONTACT_EMAIL: "contact@twigo.space", ORG_JURISDICTION: "Sacramento, California" });
    resetEnvCache();
    const pub = Object.fromEntries((await publicNotices()).map((n) => [n.key, n.value]));
    // "Twigo" is the community's name, not a confirmed legal operator (Terms section 1), and the governing
    // law is not yet determined (Terms section 21): both stay "Not yet confirmed".
    expect(pub).toMatchObject({ operatorName: null, contactEmail: "contact@twigo.space", privacyContact: "contact@twigo.space", jurisdiction: "Sacramento, California", governingLaw: null });
    const owner = await createUser({ email: "owner@example.test", totp: true });
    await saveNotices(owner.id, { ...emptyNotices(), contactEmail: { value: "hello@twigo.space", confirmed: true } });
    expect((await publicNotices()).find((n) => n.key === "contactEmail")?.value).toBe("hello@twigo.space");
  });
});
