/**
 * Final completion (24 November 2026): Privacy Policy version 2 published from the release approval;
 * renewed acknowledgment enforced also on APIs and the live chat; administrators process ordinary
 * deletions while exceptions stay with the owner; the erasure ledger and its replay after a restore;
 * the paged investigation chat; encrypted backup artifacts.
 */
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { resetEnvCache } from "@/lib/env";
import { privacyV2 } from "@/content/legal/privacy-v2";
import { LEGAL_DOCUMENTS } from "@/content/legal";
import { createBackup, decryptBuffer, encryptBuffer, restoreBackup } from "@/ops/backup";
import { ensureLegalState, hasPendingReacceptance } from "@/ops/legal-release";
import { appendLedger, currentLedgerHead, readLedger, reconcileRestore, replayErasures, LEDGER_FILE } from "@/ops/erasure-ledger";
import { createPrismaClient } from "@/lib/db-core";
import { displayedVersion, ensureLegalDocuments, pendingReacceptance, recordAcceptance } from "@/server/legal";
import { channelAccess } from "@/realtime/chat-service";
import { GET as fileRoute } from "@/app/api/files/[id]/route";
import { decideGroupAccess, investigationData, requestGroupAccess, revokeGroupAccess, CHAT_PAGE_SIZE } from "@/server/admin/group-access";
import { fileReport } from "@/server/community/reports";
import { DELETION_PHRASE, DELETION_PURPOSE, DELETION_SCOPE, executeDeletion, setLegalHold, stepSubject, submitDeletionRequest, updatePrivacyRequest } from "@/server/privacy-deletion";
import { issueStepToken } from "@/lib/security";
import { deploy } from "../scripts/migrate";
import { cookieJar, createMember, createUser, resetDb, signIn } from "./helpers";
import { groupOfThree } from "./twigo-fixtures";

const LEDGER = process.env.LEDGER_DIR!;

beforeEach(async () => {
  await resetDb();
  cookieJar.clear();
  rmSync(LEDGER, { recursive: true, force: true });
});
afterEach(() => {
  process.env.ORG_NAME = "TestOrg";
  resetEnvCache();
});
afterAll(async () => {
  await db.$disconnect();
});

const asTwigo = () => {
  process.env.ORG_NAME = "Twigo";
  resetEnvCache();
};

describe("Privacy Policy version 2: published from the release approval", () => {
  it("is approved and published with the founder's recorded confirmation, effective at publication; version 1 stays, superseded, never published", async () => {
    asTwigo();
    await ensureLegalDocuments();
    const versions = await db.legalDocumentVersion.findMany({ where: { document: { key: "privacy" } }, orderBy: { version: "asc" } });
    expect(versions.map((v) => [v.version, v.status])).toEqual([
      [1, "SUPERSEDED"],
      [2, "PUBLISHED"],
    ]);
    const [v1, v2] = versions as [(typeof versions)[0], (typeof versions)[0]];
    expect(v1.publishedAt).toBeNull();
    expect(v2.contentHash).toBe(createHash("sha256").update(privacyV2("Twigo")).digest("hex"));
    expect(v2.contentHash).toBe("047964c1de784fde3b3207a612cafeecff672c146eb990d460ae21ea748645b0");
    expect(v2.approvedById).toBeNull();
    expect(v2.publishedById).toBeNull();
    expect(v2.approvalNote).toMatch(/founder confirmed on 24 November 2026 that a legal professional fully reviewed and approved this exact text/);
    expect(v2.approvalNote).toMatch(/identity was not provided/);
    expect(v2.effectiveDate?.getTime()).toBe(v2.publishedAt?.getTime());
    expect(v2.requiresReacceptance).toBe(true);
    const audit = await db.auditLog.findMany({ where: { entityId: v2.id }, orderBy: { createdAt: "asc" } });
    expect(audit.map((a) => a.action)).toEqual(["legal.release_version_added", "legal.status_approved", "legal.status_published"]);
    expect(audit[1]!.metadata).toMatchObject({ via: "release-approval", confirmedOn: "2026-11-24" });
    expect((await displayedVersion("privacy"))!.version.version).toBe(2);
    // Idempotent: nothing changes the second time.
    const again = await ensureLegalState(db, "Twigo");
    expect(again).toEqual([{ key: "privacy", version: 2, result: "already-published" }]);
    expect(await db.legalDocumentVersion.count({ where: { document: { key: "privacy" } } })).toBe(2);
  });

  it("is never applied to a different text or over a newer version", async () => {
    // A different organization name gives a different text: not the approved one.
    await ensureLegalState(db, "OtherName");
    expect((await db.legalDocumentVersion.findFirstOrThrow({ where: { document: { key: "privacy" }, version: 2 } })).status).toBe("PENDING_LEGAL_REVIEW");
    await resetDb();
    asTwigo();
    await ensureLegalState(db, "Twigo");
    const doc = await db.legalDocument.findUniqueOrThrow({ where: { key: "privacy" } });
    // The owner later published their own version 3: a later run never brings version 2 back.
    await db.legalDocumentVersion.updateMany({ where: { documentId: doc.id, version: 2 }, data: { status: "SUPERSEDED" } });
    await db.legalDocumentVersion.create({ data: { documentId: doc.id, version: 3, status: "PUBLISHED", content: "Owner's own text, long enough here.", contentHash: "b".repeat(64), publishedAt: new Date() } });
    expect(await ensureLegalState(db, "Twigo")).toEqual([{ key: "privacy", version: 2, result: "newer-version-exists" }]);
    expect((await displayedVersion("privacy"))!.version.version).toBe(3);
  });

  it("all eight documents keep their versions; only the Privacy Policy has a second one", async () => {
    asTwigo();
    await ensureLegalDocuments();
    for (const def of LEGAL_DOCUMENTS) {
      const n = await db.legalDocumentVersion.count({ where: { document: { key: def.key } } });
      expect(n, def.key).toBe(def.key === "privacy" ? 2 : 1);
    }
  });
});

describe("renewed acknowledgment of version 2", () => {
  async function existingMember() {
    // A member who acknowledged version 1 before version 2 was published.
    await ensureLegalState(db, "OtherName"); // version 1 and an unapproved version 2 under another name
    const m = await createMember("Maya");
    const v1 = await db.legalDocumentVersion.findFirstOrThrow({ where: { document: { key: "privacy" }, version: 1 } });
    await db.legalAcceptance.create({ data: { userId: m.id, versionId: v1.id, documentKey: "privacy", version: 1, contentHash: v1.contentHash, kind: "ACKNOWLEDGED", method: "registration" } });
    return m;
  }

  it("an existing member must acknowledge version 2 once; pages, APIs and the live chat wait for it; old records stay", async () => {
    const f = await groupOfThree();
    const m = await existingMember();
    await db.groupMembership.create({ data: { groupId: f.g.id, userId: m.id } });
    // Version 2 published (as the production start would do with the approved text).
    const doc = await db.legalDocument.findUniqueOrThrow({ where: { key: "privacy" } });
    await db.legalDocumentVersion.updateMany({ where: { documentId: doc.id, version: 1 }, data: { status: "SUPERSEDED" } });
    await db.legalDocumentVersion.updateMany({ where: { documentId: doc.id, version: 2 }, data: { status: "PUBLISHED", publishedAt: new Date(), effectiveDate: new Date() } });
    expect(await pendingReacceptance(m.id)).toEqual([expect.objectContaining({ key: "privacy", version: 2, kind: "ACKNOWLEDGED" })]);
    expect(await hasPendingReacceptance(db, m.id)).toBe(true);
    const channel = await db.groupChannel.findFirstOrThrow({ where: { groupId: f.g.id } });
    expect(await channelAccess(db, m.id, channel.id)).toBeNull();
    const file = await db.storedFile.create({ data: { ownerId: f.a.id, scope: "GROUP_FILE", groupId: f.g.id, originalName: "plan.pdf", mimeType: "application/pdf", size: 3, sha256: "0".repeat(64), storageKey: "group/2026-11/p" } });
    await signIn(m.id);
    expect((await fileRoute(new NextRequest(`http://localhost/api/files/${file.id}`), { params: Promise.resolve({ id: file.id }) })).status).toBe(403);
    // Acknowledging version 2 (exact version and fingerprint recorded) lifts every gate.
    const v2 = await db.legalDocumentVersion.findFirstOrThrow({ where: { documentId: doc.id, version: 2 } });
    const rec = await recordAcceptance({ userId: m.id, key: "privacy", kind: "ACKNOWLEDGED", method: "reacceptance", versionId: v2.id });
    expect(rec).toMatchObject({ version: 2, contentHash: v2.contentHash });
    expect(await pendingReacceptance(m.id)).toEqual([]);
    expect(await channelAccess(db, m.id, channel.id)).not.toBeNull();
    expect(await db.legalAcceptance.count({ where: { userId: m.id, documentKey: "privacy" } })).toBe(2); // version 1 record kept
  });
});

describe("deletion by administrators; exceptions stay with the owner", () => {
  async function request(userId: string, choices = { removeIdeas: false, removeComments: false, removeChat: false }) {
    const t = issueStepToken(DELETION_PURPOSE, stepSubject(userId, choices), Date.now() - 60_000);
    const r = await submitDeletionRequest(userId, { reauthAt: new Date() }, { token: t, scope: DELETION_SCOPE, confirm: true, phrase: DELETION_PHRASE, ...choices });
    if (!r.ok) throw new Error(r.error);
    return r.id;
  }
  const fresh = () => ({ reauthAt: new Date() });

  it("an administrator cannot erase staff, and cannot carry out requests with a legal hold or compensation records; the owner can (except a legal hold)", async () => {
    const owner = await createUser({ email: "owner@example.test", role: "OWNER", totp: true });
    const admin = await createUser({ email: "admin@example.test", role: "ADMIN", totp: true });
    const admin2 = await createUser({ email: "admin2@example.test", role: "ADMIN", totp: true });
    // A staff account's request: refused for everyone here (the role must first be changed by the owner);
    // an administrator cannot even decide it.
    const staffReq = await request(admin2.id);
    expect(await updatePrivacyRequest(admin.id, { id: staffReq, status: "APPROVED_FOR_DELETION", response: "" })).toMatchObject({ ok: false, error: expect.stringMatching(/needs the owner/) });
    await updatePrivacyRequest(owner.id, { id: staffReq, status: "APPROVED_FOR_DELETION", response: "" });
    expect(await executeDeletion(admin.id, { id: staffReq, phrase: "ERASE" }, fresh())).toMatchObject({ ok: false });
    expect(await executeDeletion(owner.id, { id: staffReq, phrase: "ERASE" }, fresh())).toMatchObject({ ok: false });
    // Legal hold: nobody until the owner clears it; administrators cannot set or clear it.
    const m = await createMember("Mia");
    const holdReq = await request(m.id);
    expect((await setLegalHold(admin.id, holdReq, true, "pending dispute")).ok).toBe(false);
    expect((await setLegalHold(owner.id, holdReq, true, "pending dispute")).ok).toBe(true);
    expect(await updatePrivacyRequest(admin.id, { id: holdReq, status: "REJECTED", response: "Refused by an administrator." })).toMatchObject({ ok: false }); // decided by the owner
    await updatePrivacyRequest(owner.id, { id: holdReq, status: "APPROVED_FOR_DELETION", response: "" });
    expect(await executeDeletion(owner.id, { id: holdReq, phrase: "ERASE" }, fresh())).toMatchObject({ ok: false });
    expect((await setLegalHold(owner.id, holdReq, false, "")).ok).toBe(true);
    expect((await executeDeletion(admin.id, { id: holdReq, phrase: "ERASE" }, fresh())).ok).toBe(true);
    // Compensation records (earlier administrator-run projects): owner only; only what is necessary is kept.
    const p = await createMember("Pat");
    const applicant = await db.applicant.create({ data: { userId: p.id, email: p.email, fullName: "Pat Example", country: "United States", occupation: "Bookkeeper" } });
    const app = await db.application.create({ data: { applicantId: applicant.id, status: "ACCEPTED", motivation: "x".repeat(30), contribution: "y".repeat(30) } });
    const participant = await db.participant.create({ data: { applicantId: applicant.id, applicationId: app.id } });
    const project = await db.project.create({ data: { title: "Earlier project", slug: "earlier-project", summary: "An earlier administrator-run project." } });
    const assignment = await db.projectAssignment.create({ data: { projectId: project.id, participantId: participant.id } });
    await db.compensationAgreement.create({ data: { assignmentId: assignment.id, terms: "Fixed fee", basis: "fixed", status: "AGREED" } });
    const compReq = await request(p.id);
    expect((await updatePrivacyRequest(admin.id, { id: compReq, status: "APPROVED_FOR_DELETION", response: "" })).ok).toBe(false);
    await updatePrivacyRequest(owner.id, { id: compReq, status: "APPROVED_FOR_DELETION", response: "" });
    expect(await executeDeletion(admin.id, { id: compReq, phrase: "ERASE" }, fresh())).toMatchObject({ ok: false, error: expect.stringMatching(/needs the owner/) });
    expect((await executeDeletion(owner.id, { id: compReq, phrase: "ERASE" }, fresh())).ok).toBe(true);
    const a = await db.applicant.findUniqueOrThrow({ where: { id: applicant.id } });
    expect(a).toMatchObject({ fullName: "Erased account", country: null, occupation: null });
    expect(await db.application.count({ where: { applicantId: applicant.id } })).toBe(0);
    expect(await db.compensationAgreement.count({ where: { assignmentId: assignment.id } })).toBe(1);
  });

  it("every erasure is written to the encrypted ledger first; no names or addresses in it; tampering is detected", async () => {
    const admin = await createUser({ email: "admin@example.test", role: "ADMIN", totp: true });
    const m = await createMember("Mia");
    const id = await request(m.id, { removeIdeas: true, removeComments: false, removeChat: true });
    await updatePrivacyRequest(admin.id, { id, status: "APPROVED_FOR_DELETION", response: "" });
    expect((await executeDeletion(admin.id, { id, phrase: "ERASE" }, fresh())).ok).toBe(true);
    const raw = readFileSync(path.join(LEDGER, LEDGER_FILE), "utf8");
    expect(raw).not.toMatch(/mia@example\.test|Mia/);
    expect(raw).not.toContain(m.id); // the account id is inside the encrypted data
    const entries = readLedger(LEDGER, process.env.ENCRYPTION_KEY!);
    expect(entries).toEqual([expect.objectContaining({ userId: m.id, requestId: id, op: "erasure/1", choices: { removeIdeas: true, removeComments: false, removeChat: true } })]);
    expect(() => readLedger(LEDGER, "a-different-key-that-is-long-enough")).toThrow(/chain is broken|cannot be decrypted/); // the chain is keyed, so a wrong key fails at once
    writeFileSync(path.join(LEDGER, LEDGER_FILE), raw.replace(/"seq":1/, '"seq":2'));
    expect(() => readLedger(LEDGER, process.env.ENCRYPTION_KEY!)).toThrow(/chain is broken/);
    // The chain is keyed: a line whose hash is recomputed without the key (plain SHA-256) is refused.
    const line = JSON.parse(raw.trim()) as { seq: number; prev: string; data: string; hash: string };
    const forged = { ...line, hash: createHash("sha256").update(`${line.seq}\n${line.prev}\n${line.data}`).digest("hex") };
    writeFileSync(path.join(LEDGER, LEDGER_FILE), JSON.stringify(forged) + "\n");
    expect(() => readLedger(LEDGER, process.env.ENCRYPTION_KEY!)).toThrow(/chain is broken/);
    // A deletion is refused when the ledger cannot be written or verified: nothing is changed.
    const n = await createMember("Nia");
    const id2 = await request(n.id);
    await updatePrivacyRequest(admin.id, { id: id2, status: "APPROVED_FOR_DELETION", response: "" });
    expect(await executeDeletion(admin.id, { id: id2, phrase: "ERASE" }, fresh())).toMatchObject({ ok: false, error: expect.stringMatching(/erasure record could not be written/) });
    expect((await db.user.findUniqueOrThrow({ where: { id: n.id } })).erasedAt).toBeNull();
    expect((await db.privacyRequest.findUniqueOrThrow({ where: { id: id2 } })).status).toBe("APPROVED_FOR_DELETION");
  });

  it("restoring a backup made before an erasure re-applies it, and fails when the ledger cannot be verified", async () => {
    const admin = await createUser({ email: "admin@example.test", role: "ADMIN", totp: true });
    const m = await createMember("Mia");
    const dir = mkdtempSync(path.join(tmpdir(), "cowork-ledger-backup-"));
    const url = process.env.DATABASE_URL!;
    // An earlier erasure, so that the ledger has a head when the backup is made.
    const early = await createMember("Eli");
    const earlyId = await request(early.id);
    await updatePrivacyRequest(admin.id, { id: earlyId, status: "APPROVED_FOR_DELETION", response: "" });
    expect((await executeDeletion(admin.id, { id: earlyId, phrase: "ERASE" }, fresh())).ok).toBe(true);
    const olderLedger = readFileSync(path.join(LEDGER, LEDGER_FILE), "utf8");
    const b = await createBackup({ connectionString: url, dir, encryptionKey: "backup-key-for-the-test-1234", ledgerHead: () => currentLedgerHead() });
    expect(b.manifest.ledger).toMatchObject({ seq: 1 });
    const id = await request(m.id, { removeIdeas: false, removeComments: false, removeChat: false });
    await updatePrivacyRequest(admin.id, { id, status: "APPROVED_FOR_DELETION", response: "" });
    expect((await executeDeletion(admin.id, { id, phrase: "ERASE" }, fresh())).ok).toBe(true);
    const reconcile = async (cs: string, manifest: Parameters<typeof reconcileRestore>[1]) => {
      const restored = createPrismaClient(cs);
      try {
        return await reconcileRestore(restored, manifest, { dir: LEDGER, key: process.env.ENCRYPTION_KEY! });
      } finally {
        await restored.$disconnect();
      }
    };
    const restore = () => restoreBackup({ file: b.file, serverConnectionString: url, targetDb: "cowork_restore_ledger_test", protectedDbs: ["cowork_test"], replaceExisting: true, encryptionKey: "backup-key-for-the-test-1234", migrate: (cs) => deploy(cs, () => {}), reconcile });
    const res = await restore();
    expect(res.ok).toBe(true);
    expect(res.reconciliation?.detail).toMatchObject({ entries: 2, applied: [{ userId: early.id, changed: false }, { userId: m.id, changed: true }], problems: [] });
    const restored = createPrismaClient(url.replace("/cowork_test", "/cowork_restore_ledger_test"));
    try {
      const u = await restored.user.findUniqueOrThrow({ where: { id: m.id } });
      expect(u).toMatchObject({ name: "Erased account", passwordHash: null, status: "DEACTIVATED" });
      expect(await restored.memberProfile.count({ where: { userId: m.id } })).toBe(0);
      expect(await restored.auditLog.count({ where: { action: "privacy.erasure_ledger_replayed" } })).toBe(1);
      // Replaying again changes nothing.
      const again = await replayErasures(restored, readLedger(LEDGER, process.env.ENCRYPTION_KEY!), {});
      expect(again.report.applied).toEqual([{ userId: early.id, changed: false }, { userId: m.id, changed: false }]);
    } finally {
      await restored.$disconnect();
    }
    const current = readFileSync(path.join(LEDGER, LEDGER_FILE), "utf8");
    // A ledger that does not verify: the restore is not reported as successful.
    writeFileSync(path.join(LEDGER, LEDGER_FILE), "not a ledger\n");
    const bad = await restore();
    expect(bad.ok).toBe(false);
    expect(bad.reconciliation?.ok).toBe(false);
    // A missing ledger (lost, or the restore run where the ledger is not): refused.
    rmSync(path.join(LEDGER, LEDGER_FILE));
    const missing = await restore();
    expect(missing).toMatchObject({ ok: false, reconciliation: { ok: false, detail: expect.stringMatching(/does not exist/) } });
    // An older ledger put back (here: the empty ledger from before the first erasure, shorter than the
    // one the backup recorded): refused.
    writeFileSync(path.join(LEDGER, LEDGER_FILE), "");
    const older = await restore();
    expect(older).toMatchObject({ ok: false, reconciliation: { ok: false, detail: expect.stringMatching(/older than, or different from/) } });
    // The ledger as it was when the backup was made is accepted (it contains the recorded head).
    writeFileSync(path.join(LEDGER, LEDGER_FILE), olderLedger);
    expect((await restore()).ok).toBe(true);
    writeFileSync(path.join(LEDGER, LEDGER_FILE), current);
    rmSync(dir, { recursive: true, force: true });
  }, 240_000);

  it("the automatic chat lines naming the erased member say \"a former member\" afterwards; other members' names stay", async () => {
    const admin = await createUser({ email: "admin@example.test", role: "ADMIN", totp: true });
    const f = await groupOfThree();
    const name = (await db.memberProfile.findUniqueOrThrow({ where: { userId: f.c.id } })).displayName;
    const other = (await db.memberProfile.findUniqueOrThrow({ where: { userId: f.a.id } })).displayName;
    const channel = await db.groupChannel.findFirstOrThrow({ where: { groupId: f.g.id } });
    await db.chatMessage.create({ data: { channelId: channel.id, kind: "SYSTEM", body: `${name} is now the coordinator (handed over by ${other})` } });
    const id = await request(f.c.id);
    await updatePrivacyRequest(admin.id, { id, status: "APPROVED_FOR_DELETION", response: "" });
    expect((await executeDeletion(admin.id, { id, phrase: "ERASE" }, fresh())).ok).toBe(true);
    const lines = await db.chatMessage.findMany({ where: { channelId: channel.id, kind: "SYSTEM" }, select: { body: true } });
    expect(lines.some((l) => l.body.includes(name))).toBe(false);
    expect(lines.map((l) => l.body)).toEqual(expect.arrayContaining([`A former member is now the coordinator (handed over by ${other})`, "A former member left the group"]));
  });

  it("two simultaneous deletion requests from one account create one request", async () => {
    const m = await createMember("Mia");
    const choices = { removeIdeas: false, removeComments: false, removeChat: false };
    const t = issueStepToken(DELETION_PURPOSE, stepSubject(m.id, choices), Date.now() - 60_000);
    const input = { token: t, scope: DELETION_SCOPE, confirm: true, phrase: DELETION_PHRASE, ...choices };
    const rs = await Promise.all([submitDeletionRequest(m.id, { reauthAt: new Date() }, input), submitDeletionRequest(m.id, { reauthAt: new Date() }, input)]);
    expect(rs.filter((r) => r.ok)).toHaveLength(1);
    expect(await db.privacyRequest.count({ where: { userId: m.id, kind: "DELETION" } })).toBe(1);
  });

  it("a legal hold cannot be set while the deletion runs, and a hold set before the claim stops it", async () => {
    const owner = await createUser({ email: "owner@example.test", role: "OWNER", totp: true });
    const admin = await createUser({ email: "admin@example.test", role: "ADMIN", totp: true });
    const m = await createMember("Mia");
    const id = await request(m.id);
    await updatePrivacyRequest(admin.id, { id, status: "APPROVED_FOR_DELETION", response: "" });
    await db.privacyRequest.update({ where: { id }, data: { status: "PROCESSING" } });
    expect((await setLegalHold(owner.id, id, true, "dispute opened")).ok).toBe(false);
    await db.privacyRequest.update({ where: { id }, data: { status: "APPROVED_FOR_DELETION", legalHold: true } });
    expect(await executeDeletion(admin.id, { id, phrase: "ERASE" }, fresh())).toMatchObject({ ok: false });
    expect((await db.user.findUniqueOrThrow({ where: { id: m.id } })).erasedAt).toBeNull();
  });

  it("ledger appends keep a valid chain", async () => {
    const key = process.env.ENCRYPTION_KEY!;
    for (let i = 0; i < 3; i++) appendLedger(LEDGER, key, { userId: `u${i}`, requestId: null, at: new Date().toISOString(), op: "erasure/1", choices: { removeIdeas: false, removeComments: false, removeChat: false }, retainApplicant: false });
    expect(readLedger(LEDGER, key).map((e) => e.userId)).toEqual(["u0", "u1", "u2"]);
  });
});

describe("investigation chat: pages of 100, older and newer, date range, every page recorded", () => {
  it("walks the whole history without gaps or repeats, honours the date range and stops at revocation", async () => {
    const f = await groupOfThree();
    const owner = await createUser({ email: "owner@example.test", role: "OWNER", totp: true });
    const admin = await createUser({ email: "admin@example.test", role: "ADMIN", totp: true });
    const channel = await db.groupChannel.findFirstOrThrow({ where: { groupId: f.g.id } });
    const base = Date.UTC(2026, 10, 1);
    // 250 messages, several sharing the same second (ties are broken by id).
    await db.chatMessage.createMany({ data: Array.from({ length: 250 }, (_, i) => ({ channelId: channel.id, authorId: f.a.id, body: `m${i}`, createdAt: new Date(base + Math.floor(i / 3) * 1000) })) });
    expect((await fileReport(f.b.id, { targetType: "GROUP", targetId: f.g.id, reason: "HARASSMENT", details: null })).ok).toBe(true);
    const report = await db.contentReport.findFirstOrThrow();
    const req = await requestGroupAccess(admin.id, { reportId: report.id, reason: "A member reports harassment in this group's chat.", scope: ["CHAT"], hours: 2 });
    if (!req.ok) throw new Error(req.error);
    const now = new Date();
    expect((await decideGroupAccess(owner.id, { id: req.id, decision: "approve", scope: ["CHAT"], startsAt: now, expiresAt: new Date(now.getTime() + 3600_000) })).ok).toBe(true);
    const page = async (q = {}) => {
      const d = await investigationData(admin.id, req.id, "CHAT", q);
      if (!d || d.scope !== "CHAT") throw new Error("no page");
      return d;
    };
    const latest = await page();
    const system = await db.chatMessage.count({ where: { channelId: channel.id } });
    expect(latest.messages).toHaveLength(CHAT_PAGE_SIZE);
    expect(latest.hasNewer).toBe(false);
    expect(latest.hasOlder).toBe(true);
    // Walk back to the beginning.
    const seen: string[] = [...latest.messages.map((m) => m.id)];
    let cur = latest;
    while (cur.hasOlder) {
      cur = await page({ before: cur.messages[0]!.id });
      seen.unshift(...cur.messages.map((m) => m.id));
    }
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen).toHaveLength(system);
    const all = await db.chatMessage.findMany({ where: { channelId: channel.id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true } });
    expect(seen).toEqual(all.map((m) => m.id));
    // And forward again from the first page.
    const forward = await page({ after: cur.messages.at(-1)!.id });
    expect(forward.messages[0]!.id).toBe(all[cur.messages.length]!.id);
    // Date range (inclusive start, exclusive end): seconds 10..19 → messages 30..59.
    const ranged = await page({ from: new Date(base + 10_000), to: new Date(base + 20_000) });
    expect(ranged.messages.map((m) => m.body)).toEqual(Array.from({ length: 30 }, (_, i) => `m${30 + i}`));
    const pages = await db.auditLog.count({ where: { action: "group_access.viewed", entityId: req.id } });
    expect(pages).toBeGreaterThanOrEqual(5);
    // Revoked: the next page is refused at once and the attempt is recorded.
    await revokeGroupAccess(owner.id, req.id);
    expect(await investigationData(admin.id, req.id, "CHAT", { before: latest.messages[0]!.id })).toBeNull();
    expect(await db.auditLog.count({ where: { action: "group_access.denied", entityId: req.id } })).toBe(1);
  });
});

describe("backup artifacts are encrypted with the existing format", () => {
  it("round-trips, detects changes and refuses the wrong key", () => {
    const plain = Buffer.from("SETTING=value\nOTHER=1\n");
    const enc = encryptBuffer(plain, "a-backup-key-long-enough");
    expect(enc.subarray(0, 6).toString()).toBe("CWBAK1");
    expect(enc.includes(Buffer.from("SETTING=value"))).toBe(false);
    expect(decryptBuffer(enc, "a-backup-key-long-enough").equals(plain)).toBe(true);
    expect(() => decryptBuffer(enc, "another-key-long-enough")).toThrow();
    const changed = Buffer.from(enc);
    changed[changed.length - 1] ^= 1;
    expect(() => decryptBuffer(changed, "a-backup-key-long-enough")).toThrow();
  });
});
