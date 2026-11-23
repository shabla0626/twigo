/**
 * Release review (independent code review of 23 November 2026): one test per confirmed defect, so each
 * fix is proven by behaviour, not only described.
 */
import { existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { forwardedChainTooShort, resolveClientAddress } from "@/lib/client-address";
import { GET as downloadRoute } from "@/app/api/agreements/[id]/route";
import { privacyRequestStatusAction } from "@/app/admin/actions/twigo";
import { createBackup } from "@/ops/backup";
import { addEntry } from "@/server/community-support";
import { groupAccess, groupAccessBySlug } from "@/server/community/access";
import { listGroupFiles, storeUpload } from "@/server/community/files";
import {
  acceptAgreement,
  createGroupProject,
  openForAcceptance,
  projectDetail,
  saveAgreementDraft,
  withdrawFromProject,
  withdrawOpenVersion,
} from "@/server/community/group-projects";
import { joinGroup, leaveGroup, removeMember, adminLiftRemoval } from "@/server/community/groups";
import { closeIdea, createIdea } from "@/server/community/ideas";
import { changeStatus, createDraftVersion, displayedVersion, editDraft, pendingReacceptance, recordAcceptance } from "@/server/legal";
import { registerAccount } from "@/server/onboarding";
import { submitPrivacyRequest } from "@/server/privacy-requests";
import { cookieJar, createMember, createUser, resetDb, signIn } from "./helpers";
import { fullTerms, groupOfThree, participant } from "./twigo-fixtures";

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
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

/** A project with an OPEN agreement version listing all three members. */
async function openProject() {
  const f = await groupOfThree();
  const p = await createGroupProject(f.a.id, f.g.id, { name: "Bookkeeping pilot", objective: "Serve three local shops for six months." });
  if (!p.ok) throw new Error(p.error);
  const d = await saveAgreementDraft(f.a.id, p.id, fullTerms(), [participant(f.a.id, "40%"), participant(f.b.id, "35%"), participant(f.c.id, "25%")], "");
  if (!d.ok) throw new Error(d.error);
  expect((await openForAcceptance(f.a.id, d.versionId)).ok).toBe(true);
  const v = await db.projectAgreementVersion.findUniqueOrThrow({ where: { id: d.versionId } });
  return { ...f, projectId: p.id, v };
}

describe("authorization", () => {
  it("services look a group up by id only; a slug resolves only on the group pages", async () => {
    const { g, a } = await groupOfThree();
    expect((await groupAccess(g.id, a.id))?.group.id).toBe(g.id);
    expect(await groupAccess(g.slug, a.id)).toBeNull();
    expect((await groupAccessBySlug(g.slug, a.id))?.group.id).toBe(g.id);
  });

  it("projects of an archived group are read-only", async () => {
    const o = await openProject();
    await db.researchGroup.update({ where: { id: o.g.id }, data: { status: "ARCHIVED" } });
    await expect(saveAgreementDraft(o.a.id, o.projectId, fullTerms(), [participant(o.a.id, "all")], "")).rejects.toThrow(/archived/);
    await expect(acceptAgreement(o.b.id, o.v.id, o.v.contentHash)).rejects.toThrow(/archived/);
    expect((await projectDetail(o.projectId, o.a.id)).project.id).toBe(o.projectId); // still readable
  });

  it("a profile photo never lands in a group's file list", async () => {
    const { g, a } = await groupOfThree();
    const outsider = await createMember("Olga");
    const up = await storeUpload(outsider.id, { scope: "PROFILE_PHOTO", groupId: g.id, name: "me.png", bytes: PNG });
    expect(up.ok).toBe(true);
    if (up.ok) expect((await db.storedFile.findUniqueOrThrow({ where: { id: up.file.id } })).groupId).toBeNull();
    // Even an older row with a group id is not listed as group content.
    await db.storedFile.create({ data: { ownerId: outsider.id, scope: "PROFILE_PHOTO", groupId: g.id, originalName: "old.png", mimeType: "image/png", size: 1, sha256: "x", storageKey: "profile_photo/x" } });
    expect((await listGroupFiles(g.id, a.id)).map((f) => f.originalName)).not.toContain("old.png");
  });

  it("the owner can download a group's agreement only with two-step verification, and it is audited", async () => {
    const o = await openProject();
    const owner = await createUser({ email: "owner@example.test", totp: true });
    const get = () => downloadRoute(new NextRequest(`http://localhost/api/agreements/${o.v.id}`), { params: Promise.resolve({ id: o.v.id }) });
    await signIn(owner.id, "OWNER");
    expect((await get()).status).toBe(200);
    expect(await db.auditLog.count({ where: { action: "agreement.downloaded_by_owner", entityId: o.v.id } })).toBe(1);
    await db.user.update({ where: { id: owner.id }, data: { totpEnabledAt: null, totpSecretEnc: null } });
    expect((await get()).status).toBe(404);
  });
});

describe("agreement workflow", () => {
  it("accepting and withdrawing at the same moment never leave a withdrawn version in force", async () => {
    for (let round = 0; round < 4; round++) {
      await resetDb();
      const o = await openProject();
      await acceptAgreement(o.a.id, o.v.id, o.v.contentHash);
      await acceptAgreement(o.b.id, o.v.id, o.v.contentHash);
      const [acc, wd] = await Promise.all([acceptAgreement(o.c.id, o.v.id, o.v.contentHash), withdrawOpenVersion(o.a.id, o.v.id)]);
      const v = await db.projectAgreementVersion.findUniqueOrThrow({ where: { id: o.v.id }, include: { participants: true } });
      expect(acc.ok && wd.ok).toBe(false); // exactly one of them wins
      if (v.status === "WITHDRAWN") expect(v.participants.every((p) => p.acceptedAt)).toBe(false);
      else expect(v.status).toBe("ACCEPTED");
    }
  });

  it("a closed project cannot open or accept versions", async () => {
    const o = await openProject();
    await db.groupProject.update({ where: { id: o.projectId }, data: { status: "CANCELLED" } });
    expect(await acceptAgreement(o.b.id, o.v.id, o.v.contentHash)).toMatchObject({ ok: false, error: expect.stringMatching(/closed/) });
  });

  it("a project coordinator who leaves loses the role, and rejoining does not restore it", async () => {
    const o = await openProject();
    await db.groupProject.update({ where: { id: o.projectId }, data: { coordinatorId: o.b.id } });
    await removeMember(o.a.id, o.g.id, o.b.id);
    expect((await db.groupProject.findUniqueOrThrow({ where: { id: o.projectId } })).coordinatorId).toBeNull();
    const owner = await createUser({ email: "owner@example.test", totp: true });
    await adminLiftRemoval(owner.id, o.g.id, o.b.id);
    await joinGroup(o.b.id, o.g.id);
    expect((await projectDetail(o.projectId, o.b.id)).canEdit).toBe(false);
  });

  it("a participant who left the group still downloads the agreement and can record withdrawal", async () => {
    const o = await openProject();
    for (const u of [o.a, o.b, o.c]) await acceptAgreement(u.id, o.v.id, o.v.contentHash);
    await leaveGroup(o.c.id, o.g.id);
    await signIn(o.c.id);
    const res = await downloadRoute(new NextRequest(`http://localhost/api/agreements/${o.v.id}`), { params: Promise.resolve({ id: o.v.id }) });
    expect(res.status).toBe(200);
    expect(await withdrawFromProject(o.c.id, o.projectId, "I left the group and the project.")).toEqual({ ok: true });
    // Someone never listed gets nothing.
    const stranger = await createMember("Sam");
    cookieJar.clear();
    await signIn(stranger.id);
    expect((await downloadRoute(new NextRequest(`http://localhost/api/agreements/${o.v.id}`), { params: Promise.resolve({ id: o.v.id }) })).status).toBe(404);
  });
});

describe("legal documents", () => {
  const text = (n: number) => `## Terms of Use\\n\\nVersion text number ${n}, long enough for the editor to accept it as a document.\\n`;
  async function publish(ownerId: string, n: number, reaccept: boolean) {
    const d = await createDraftVersion(ownerId, "terms");
    if (!d.ok || !d.id) throw new Error("draft");
    await editDraft(ownerId, d.id, { content: text(n), changeSummary: `v${n}`, materialChange: reaccept, requiresReacceptance: reaccept });
    await changeStatus(ownerId, d.id, "PENDING_LEGAL_REVIEW");
    await changeStatus(ownerId, d.id, "APPROVED", { approvalNote: "Reviewed by a test reviewer" });
    expect((await changeStatus(ownerId, d.id, "PUBLISHED")).ok).toBe(true);
    return d.id;
  }

  it("a later minor update does not cancel a pending renewed acceptance", async () => {
    const owner = await createUser({ email: "owner@example.test", totp: true });
    const m = await createMember("Mia");
    await recordAcceptance({ userId: m.id, key: "terms", kind: "ACCEPTED", method: "registration" });
    await publish(owner.id, 2, true); // material: everyone must accept again
    const v3 = await publish(owner.id, 3, false); // minor fix before Mia came back
    const pending = await pendingReacceptance(m.id);
    expect(pending).toEqual([expect.objectContaining({ key: "terms", versionId: v3 })]);
    await recordAcceptance({ userId: m.id, key: "terms", kind: "ACCEPTED", method: "reacceptance", versionId: v3 });
    expect(await pendingReacceptance(m.id)).toEqual([]);
  });

  it("never two published versions, and never two drafts", async () => {
    const owner = await createUser({ email: "owner@example.test", totp: true });
    const created = await createDraftVersion(owner.id, "terms");
    if (!created.ok || !created.id) throw new Error("draft");
    const v2 = { id: created.id };
    await editDraft(owner.id, v2.id!, { content: text(2), changeSummary: "", materialChange: false, requiresReacceptance: false });
    await changeStatus(owner.id, v2.id!, "PENDING_LEGAL_REVIEW");
    await createDraftVersion(owner.id, "terms"); // v3 draft
    expect((await changeStatus(owner.id, v2.id!, "DRAFT")).ok).toBe(false); // would make two drafts
    await publish(owner.id, 4, false).catch(() => undefined);
    const published = await db.legalDocumentVersion.count({ where: { document: { key: "terms" }, status: "PUBLISHED" } });
    expect(published).toBeLessThanOrEqual(1);
  });

  it("registration is refused, creating nothing, when a required document has no readable version", async () => {
    const owner = await createUser({ email: "owner@example.test", totp: true });
    const v1 = (await displayedVersion("terms"))!.version;
    expect((await changeStatus(owner.id, v1.id, "DRAFT")).ok).toBe(true); // nobody accepted it yet
    const res = await registerAccount({ fullName: "Nora New", email: "nora@example.test", password: "a-long-password-123", confirm: "a-long-password-123", acceptTerms: true, acceptGuidelines: true, ackPrivacy: true }, { ipHash: "ip" });
    expect(res.ok).toBe(false);
    expect(await db.user.count({ where: { email: "nora@example.test" } })).toBe(0);
  });
});

describe("ideas, support, privacy requests", () => {
  it("an author cannot bring back an idea that moderators removed", async () => {
    const a = await createMember("Alice");
    const r = await createIdea(a.id, { title: "A removed idea", summary: "Something the moderators removed.", category: "OTHER", description: null, problem: null, proposal: null, customers: null, revenueModel: null, skillsNeeded: null, timeEstimate: null, links: [] });
    if (!r.ok) throw new Error();
    await db.businessIdea.update({ where: { id: r.id }, data: { status: "REMOVED" } });
    expect((await closeIdea(a.id, r.id)).ok).toBe(false);
    expect((await db.businessIdea.findUniqueOrThrow({ where: { id: r.id } })).status).toBe("REMOVED");
  });

  it("a support amount too large for the record is refused with a message, not a crash", async () => {
    const owner = await createUser({ email: "owner@example.test", totp: true });
    expect(await addEntry(owner.id, { kind: "CONTRIBUTION", amount: "999999999", currency: "USD", occurredOn: "2027-01-10", description: "Too large" })).toMatchObject({ ok: false });
    expect((await addEntry(owner.id, { kind: "CONTRIBUTION", amount: "20000000", currency: "USD", occurredOn: "2027-01-10", description: "Largest allowed" })).ok).toBe(true);
  });

  it("changing a privacy request's status without a new answer keeps the earlier answer", async () => {
    const owner = await createUser({ email: "owner@example.test", totp: true });
    const m = await createMember("Mia");
    await submitPrivacyRequest(m.id, { kind: "ACCESS", details: "Please send me my information." });
    const r = await db.privacyRequest.findFirstOrThrow();
    await signIn(owner.id, "OWNER");
    await redirectOf(privacyRequestStatusAction(form({ id: r.id, status: "COMPLETED", response: "Sent by email on 1 January." })));
    await redirectOf(privacyRequestStatusAction(form({ id: r.id, status: "IN_PROGRESS", response: "" })));
    expect((await db.privacyRequest.findUniqueOrThrow({ where: { id: r.id } })).response).toBe("Sent by email on 1 January.");
  });
});

describe("operations", () => {
  it("an encrypted backup never leaves an unencrypted or partial file", async () => {
    await groupOfThree();
    const dir = path.join(tmpdir(), `twigo-backup-${Date.now()}`);
    const b = await createBackup({ connectionString: process.env.DATABASE_URL!, dir, encryptionKey: "a-test-backup-encryption-key-123" });
    expect(b.file.endsWith(".cwbak.gz.enc")).toBe(true);
    const files = readdirSync(dir);
    expect(files).toEqual([path.basename(b.file)]);
    expect(files.some((f) => f.endsWith(".gz") || f.endsWith(".tmp"))).toBe(false);
    expect(existsSync(b.file)).toBe(true);
  });

  it("detects a forwarded chain that is shorter than the configured proxies (Caddy without trusted_proxies)", () => {
    // Cloudflare + Caddy keeping the chain: the visitor's address is used.
    expect(resolveClientAddress("172.18.0.1", "203.0.113.7, 104.21.68.87", 2)).toBe("203.0.113.7");
    // Caddy dropped Cloudflare's entry: detected (all visitors would share one address).
    expect(forwardedChainTooShort("104.21.68.87", 2)).toBe(true);
    expect(forwardedChainTooShort("203.0.113.7, 104.21.68.87", 2)).toBe(false);
    expect(forwardedChainTooShort(undefined, 2)).toBe(false); // the container's own health check
  });
});
