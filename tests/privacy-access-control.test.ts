/**
 * Privacy and access control (24 November 2026):
 *  1. administrators have no standing access to a project group's private information; access needs a
 *     report by a member of that group, an administrator's request and the owner's approval for a scope
 *     and a period; it expires, is revocable and every step is recorded;
 *  2. account and personal-data deletion requests: a server-enforced first stage, the owner's queue, a
 *     reviewed plan, a transactional erasure that keeps shared records, and an honest completion notice;
 *  3. Privacy Policy version 2 added by the release next to the reviewed version 1.
 */
import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { LEGAL_DOCUMENTS, publicationProblem } from "@/content/legal";
import { privacyV2 } from "@/content/legal/privacy-v2";
import { issueStepToken } from "@/lib/security";
import { env } from "@/lib/env";
import { GET as agreementRoute } from "@/app/api/agreements/[id]/route";
import { channelAccess } from "@/realtime/chat-service";
import { authorizeGroupRead, decideGroupAccess, investigationData, requestGroupAccess, revokeGroupAccess } from "@/server/admin/group-access";
import { expireGroupAccess } from "@/ops/housekeeping";
import { groupAccess } from "@/server/community/access";
import { authorizeDownload } from "@/server/community/files";
import { admitMember, joinGroup } from "@/server/community/groups";
import { endorseIdea, createIdea } from "@/server/community/ideas";
import { fileReport } from "@/server/community/reports";
import { createGroupProject, openForAcceptance, saveAgreementDraft, acceptAgreement } from "@/server/community/group-projects";
import { reactivateUser } from "@/server/accounts";
import { DELETION_PHRASE, DELETION_PURPOSE, DELETION_SCOPE, deletionPlan, executeDeletion, stepSubject, submitDeletionRequest, updatePrivacyRequest } from "@/server/privacy-deletion";
import { submitPrivacyRequest } from "@/server/privacy-requests";
import { displayedVersion, ensureLegalDocuments, publicVersion } from "@/server/legal";
import { publishReviewedDocuments } from "@/ops/legal-publish";
import { registerAccount } from "@/server/onboarding";
import { cookieJar, createMember, createUser, resetDb, signIn, submitTestApplication } from "./helpers";
import { fullTerms, groupOfThree, participant } from "./twigo-fixtures";

beforeEach(async () => {
  await resetDb();
  cookieJar.clear();
});
afterAll(async () => {
  await db.$disconnect();
});

const HOUR = 3600_000;

async function setting() {
  const f = await groupOfThree();
  const owner = await createUser({ email: "owner@example.test", role: "OWNER", totp: true });
  const admin = await createUser({ email: "admin@example.test", role: "ADMIN", totp: true });
  return { ...f, owner, admin };
}

async function memberReport(reporterId: string, groupId: string) {
  const r = await fileReport(reporterId, { targetType: "GROUP", targetId: groupId, reason: "HARASSMENT", details: "Someone in this group keeps asking for money." });
  expect(r.ok).toBe(true);
  return db.contentReport.findFirstOrThrow({ where: { reporterId, targetId: groupId } });
}

async function approved(s: Awaited<ReturnType<typeof setting>>, scope: ("CHAT" | "RESEARCH" | "FILES" | "TASKS_DECISIONS" | "PROJECTS")[], hours = 24) {
  const report = await memberReport(s.b.id, s.g.id);
  const req = await requestGroupAccess(s.admin.id, { reportId: report.id, reason: "A member reports repeated requests for money in the chat.", scope, hours });
  if (!req.ok) throw new Error(req.error);
  const now = new Date();
  const d = await decideGroupAccess(s.owner.id, { id: req.id, decision: "approve", scope, startsAt: now, expiresAt: new Date(now.getTime() + hours * HOUR) });
  if (!d.ok) throw new Error(d.error);
  return req.id;
}

describe("administrators have no standing access to a group's private information", () => {
  it("an administrator or owner cannot join a group or support an idea", async () => {
    const s = await setting();
    expect(await joinGroup(s.admin.id, s.g.id)).toMatchObject({ ok: false });
    expect(await admitMember(s.admin.id, s.g.id)).toMatchObject({ ok: false });
    expect(await admitMember(s.owner.id, s.g.id)).toMatchObject({ ok: false });
    const idea = await createIdea(s.a.id, { title: "Another useful idea", summary: "A second idea to check that staff cannot support it.", category: "OTHER", description: null, problem: null, proposal: null, customers: null, revenueModel: null, skillsNeeded: null, timeEstimate: null, links: [] });
    if (!idea.ok) throw new Error(idea.error);
    expect(await endorseIdea(s.admin.id, idea.id)).toMatchObject({ ok: false });
    expect(await db.groupMembership.count({ where: { userId: { in: [s.admin.id, s.owner.id] } } })).toBe(0);
  });

  it("an old membership row gives staff nothing: no member access, no live chat, no files, no agreements", async () => {
    const s = await setting();
    await db.groupMembership.create({ data: { groupId: s.g.id, userId: s.admin.id, role: "MEMBER" } });
    expect((await groupAccess(s.g.id, s.admin.id))?.isMember).toBe(false);
    const channel = await db.groupChannel.findFirstOrThrow({ where: { groupId: s.g.id } });
    expect(await channelAccess(db, s.admin.id, channel.id)).toBeNull();
    expect(await channelAccess(db, s.a.id, channel.id)).not.toBeNull();
    const file = await db.storedFile.create({ data: { ownerId: s.a.id, scope: "GROUP_FILE", groupId: s.g.id, originalName: "plan.pdf", mimeType: "application/pdf", size: 10, sha256: "0".repeat(64), storageKey: "group/2026-11/x" } });
    expect(await authorizeDownload(s.admin.id, file.id)).toBeNull();
    expect(await authorizeDownload(s.a.id, file.id)).not.toBeNull();
  });
});

describe("member report, request, owner approval, scope, expiry and audit", () => {
  it("only a report by a member of that group can start a request; an unrelated member's report cannot", async () => {
    const s = await setting();
    const outsider = await createMember("Olga");
    const r = await fileReport(outsider.id, { targetType: "GROUP", targetId: s.g.id, reason: "SPAM", details: null });
    expect(r.ok).toBe(true);
    const outsiderReport = await db.contentReport.findFirstOrThrow({ where: { reporterId: outsider.id } });
    expect(outsiderReport.reporterGroupMember).toBe(false);
    expect(await requestGroupAccess(s.admin.id, { reportId: outsiderReport.id, reason: "Looking into the report from outside the group.", scope: ["CHAT"], hours: 4 })).toMatchObject({ ok: false });
    const member = await memberReport(s.b.id, s.g.id);
    expect(member.reporterGroupMember).toBe(true);
    expect((await requestGroupAccess(s.admin.id, { reportId: member.id, reason: "A member reports repeated requests for money.", scope: ["CHAT"], hours: 4 })).ok).toBe(true);
  });

  it("nothing is visible before the owner approves; only the owner can approve; approval needs an explicit end of at most 30 days", async () => {
    const s = await setting();
    const report = await memberReport(s.b.id, s.g.id);
    const req = await requestGroupAccess(s.admin.id, { reportId: report.id, reason: "A member reports repeated requests for money.", scope: ["CHAT", "FILES"], hours: 48 });
    if (!req.ok) throw new Error(req.error);
    expect(await authorizeGroupRead(s.admin.id, { groupId: s.g.id, scope: "CHAT", what: "test" })).toBeNull();
    expect(await investigationData(s.admin.id, req.id, "CHAT")).toBeNull();
    const now = new Date();
    expect(await decideGroupAccess(s.admin.id, { id: req.id, decision: "approve", scope: ["CHAT"], startsAt: now, expiresAt: new Date(now.getTime() + HOUR) })).toMatchObject({ ok: false });
    expect(await decideGroupAccess(s.owner.id, { id: req.id, decision: "approve", scope: ["CHAT"], startsAt: now })).toMatchObject({ ok: false });
    expect(await decideGroupAccess(s.owner.id, { id: req.id, decision: "approve", scope: ["CHAT"], startsAt: now, expiresAt: new Date(now.getTime() + 31 * 24 * HOUR) })).toMatchObject({ ok: false });
    expect(await decideGroupAccess(s.owner.id, { id: req.id, decision: "approve", scope: ["PROJECTS"], startsAt: now, expiresAt: new Date(now.getTime() + HOUR) })).toMatchObject({ ok: false });
    expect((await decideGroupAccess(s.owner.id, { id: req.id, decision: "approve", scope: ["CHAT"], startsAt: now, expiresAt: new Date(now.getTime() + HOUR) })).ok).toBe(true);
  });

  it("only the approved administrator, group and information, and only inside the period", async () => {
    const s = await setting();
    const id = await approved(s, ["CHAT"], 2);
    const other = await createUser({ email: "admin2@example.test", role: "ADMIN", totp: true });
    expect(await authorizeGroupRead(s.admin.id, { groupId: s.g.id, scope: "CHAT", what: "test" })).not.toBeNull();
    expect(await investigationData(s.admin.id, id, "CHAT")).toMatchObject({ scope: "CHAT" });
    expect(await authorizeGroupRead(s.admin.id, { groupId: s.g.id, scope: "FILES", what: "test" })).toBeNull();
    expect(await investigationData(s.admin.id, id, "RESEARCH")).toBeNull();
    expect(await authorizeGroupRead(other.id, { groupId: s.g.id, scope: "CHAT", what: "test" })).toBeNull();
    const f2 = await groupOfThreeElsewhere();
    expect(await authorizeGroupRead(s.admin.id, { groupId: f2.id, scope: "CHAT", what: "test" })).toBeNull();
    // After the end: refused, even before the hourly job recorded the expiry.
    expect(await authorizeGroupRead(s.admin.id, { groupId: s.g.id, scope: "CHAT", what: "test", now: new Date(Date.now() + 3 * HOUR) })).toBeNull();
    expect(await expireGroupAccess(db, Date.now() + 3 * HOUR)).toBe(1);
    expect((await db.groupAccessRequest.findUniqueOrThrow({ where: { id } })).status).toBe("EXPIRED");
    expect(await authorizeGroupRead(s.admin.id, { groupId: s.g.id, scope: "CHAT", what: "test" })).toBeNull();
  });

  it("the owner can end access early; direct file and agreement requests follow the same rule", async () => {
    const s = await setting();
    const file = await db.storedFile.create({ data: { ownerId: s.a.id, scope: "GROUP_FILE", groupId: s.g.id, originalName: "plan.pdf", mimeType: "application/pdf", size: 10, sha256: "0".repeat(64), storageKey: "group/2026-11/y" } });
    const p = await createGroupProject(s.a.id, s.g.id, { name: "Bookkeeping pilot", objective: "Serve three local shops for six months." });
    if (!p.ok) throw new Error(p.error);
    const d = await saveAgreementDraft(s.a.id, p.id, fullTerms(), [participant(s.a.id, "50%"), participant(s.b.id, "50%")], "");
    if (!d.ok) throw new Error(d.error);
    expect((await openForAcceptance(s.a.id, d.versionId)).ok).toBe(true);
    const download = async () => {
      await signIn(s.admin.id, "ADMIN");
      return (await agreementRoute(new NextRequest(`http://localhost/api/agreements/${d.versionId}`), { params: Promise.resolve({ id: d.versionId }) })).status;
    };
    expect(await download()).toBe(404);
    expect(await authorizeDownload(s.admin.id, file.id)).toBeNull();
    const id = await approved(s, ["FILES", "PROJECTS"]);
    expect(await authorizeDownload(s.admin.id, file.id)).not.toBeNull();
    expect(await download()).toBe(200);
    expect((await revokeGroupAccess(s.admin.id, id)).ok).toBe(false); // only the owner
    expect((await revokeGroupAccess(s.owner.id, id)).ok).toBe(true);
    expect(await authorizeDownload(s.admin.id, file.id)).toBeNull();
    expect(await download()).toBe(404);
  });

  it("the live chat never admits staff, even with an active approval", async () => {
    const s = await setting();
    await approved(s, ["CHAT"]);
    const channel = await db.groupChannel.findFirstOrThrow({ where: { groupId: s.g.id } });
    expect(await channelAccess(db, s.admin.id, channel.id)).toBeNull();
  });

  it("the whole history is recorded and the owner can read it", async () => {
    const s = await setting();
    const id = await approved(s, ["CHAT"], 1);
    await investigationData(s.admin.id, id, "CHAT");
    await authorizeGroupRead(s.admin.id, { groupId: s.g.id, scope: "FILES", what: "test" });
    await revokeGroupAccess(s.owner.id, id);
    const actions = (await db.auditLog.findMany({ where: { entityType: "GroupAccessRequest", entityId: id }, orderBy: { createdAt: "asc" } })).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(["group_access.requested", "group_access.approved", "group_access.viewed", "group_access.denied", "group_access.revoked"]));
    expect(await db.auditLog.count({ where: { action: "report.filed" } })).toBeGreaterThan(0);
  });
});

async function groupOfThreeElsewhere() {
  const [x, y, z] = [await createMember("Xena"), await createMember("Yuri"), await createMember("Zoe")];
  const idea = await createIdea(x.id, { title: "Community garden planning", summary: "Help neighborhoods plan and run small shared gardens.", category: "OTHER", description: null, problem: null, proposal: null, customers: null, revenueModel: null, skillsNeeded: null, timeEstimate: null, links: [] });
  if (!idea.ok) throw new Error(idea.error);
  await endorseIdea(y.id, idea.id);
  await endorseIdea(z.id, idea.id);
  return db.researchGroup.findUniqueOrThrow({ where: { ideaId: idea.id } });
}

describe("deletion requests: the first stage cannot be bypassed", () => {
  const token = (userId: string, at = Date.now()) => issueStepToken(DELETION_PURPOSE, stepSubject(userId, { removeIdeas: false, removeComments: false, removeChat: false }), at);
  const input = (t: string, over: Record<string, unknown> = {}) => ({ token: t, scope: DELETION_SCOPE, confirm: true, phrase: DELETION_PHRASE, ...over });

  it("needs the step token, an identity check made after it, the tick and the phrase; then reaches the queue once", async () => {
    const m = await createMember("Maya");
    const t = token(m.id, Date.now() - 60_000);
    expect(await submitDeletionRequest(m.id, { reauthAt: new Date() }, input("forged.token"))).toMatchObject({ ok: false });
    expect(await submitDeletionRequest(m.id, { reauthAt: null }, input(t))).toMatchObject({ ok: false });
    expect(await submitDeletionRequest(m.id, { reauthAt: new Date(Date.now() - 120_000) }, input(t))).toMatchObject({ ok: false }); // checked before the step
    expect(await submitDeletionRequest(m.id, { reauthAt: new Date() }, input(t, { confirm: false }))).toMatchObject({ ok: false });
    expect(await submitDeletionRequest(m.id, { reauthAt: new Date() }, input(t, { phrase: "delete" }))).toMatchObject({ ok: false });
    const other = await createMember("Omar");
    expect(await submitDeletionRequest(other.id, { reauthAt: new Date() }, input(t))).toMatchObject({ ok: false }); // token of someone else
    expect(await db.privacyRequest.count()).toBe(0);
    const ok = await submitDeletionRequest(m.id, { reauthAt: new Date() }, input(t));
    expect(ok.ok).toBe(true);
    expect(await submitDeletionRequest(m.id, { reauthAt: new Date() }, input(token(m.id, Date.now() - 1000)))).toMatchObject({ ok: false }); // duplicate
    const r = await db.privacyRequest.findFirstOrThrow({ where: { userId: m.id } });
    expect(r).toMatchObject({ kind: "DELETION", status: "OPEN", scope: DELETION_SCOPE, verificationMethod: "password" });
    expect(r.verifiedAt).not.toBeNull();
    expect((await db.user.findUniqueOrThrow({ where: { id: m.id } })).erasedAt).toBeNull(); // nothing deleted yet
    expect(await db.auditLog.count({ where: { action: "privacy.deletion_requested" } })).toBe(1);
  });

  it("the free-text request form cannot be used for deletion", async () => {
    const m = await createMember("Maya");
    expect(await submitPrivacyRequest(m.id, { kind: "DELETION", details: "Please delete everything about me." })).toMatchObject({ ok: false });
  });
});

describe("deletion: review, plan, execution, retention and notice", () => {
  async function requested() {
    const s = await setting();
    const p = await createGroupProject(s.a.id, s.g.id, { name: "Bookkeeping pilot", objective: "Serve three local shops for six months." });
    if (!p.ok) throw new Error(p.error);
    const d = await saveAgreementDraft(s.a.id, p.id, fullTerms(), [participant(s.a.id, "50%"), participant(s.b.id, "50%")], "");
    if (!d.ok) throw new Error(d.error);
    expect((await openForAcceptance(s.a.id, d.versionId)).ok).toBe(true);
    const v = await db.projectAgreementVersion.findUniqueOrThrow({ where: { id: d.versionId } });
    for (const u of [s.a, s.b]) expect((await acceptAgreement(u.id, v.id, v.contentHash)).ok).toBe(true);
    await db.applicant.create({ data: { userId: s.b.id, email: s.b.email, fullName: "Bob Example", country: "United States" } });
    await db.notification.create({ data: { userId: s.b.id, type: "ADMIN_MESSAGE", title: "Hello" } });
    await signIn(s.b.id);
    // The member chose to have their chat messages removed too.
    const choices = { removeIdeas: false, removeComments: false, removeChat: true };
    const t = issueStepToken(DELETION_PURPOSE, stepSubject(s.b.id, choices), Date.now() - 60_000);
    const res = await submitDeletionRequest(s.b.id, { reauthAt: new Date() }, { token: t, scope: DELETION_SCOPE, confirm: true, phrase: DELETION_PHRASE, ...choices });
    if (!res.ok) throw new Error(res.error);
    return { ...s, requestId: res.id, versionId: v.id };
  }

  it("the plan names every category and how it is handled; backups are never reported as erased", async () => {
    const s = await requested();
    const plan = await deletionPlan(s.b.id, { removeIdeas: false, removeComments: false, removeChat: true });
    const by = Object.fromEntries(plan.map((p) => [p.category, p]));
    expect(by["Account record"]!.action).toBe("anonymize");
    expect(by["Profile and profile photo"]!.action).toBe("delete");
    expect(by["Group memberships"]).toMatchObject({ action: "end", count: 1 });
    expect(by["Project agreements (participations)"]).toMatchObject({ action: "keep", count: 1 });
    expect(by["Records of accepted policies"]!.action).toBe("keep");
    expect(by["Audit log entries"]!.action).toBe("keep");
    // No open choice for the person carrying it out: the member's own choice decides.
    expect(by["Chat messages"]!.action).toBe("remove");
    expect(by["Comments, group discussions, field notes, discussion pieces, project channels and cultural installments"]!.action).toBe("keep");
    expect(plan.every((p) => ["delete", "anonymize", "end", "remove", "keep", "keep-necessary", "backup-expiry"].includes(p.action))).toBe(true);
    expect(by["Backups"]!.action).toBe("backup-expiry");
    expect(by["Backups"]!.explanation).toContain(`The ${env().BACKUP_KEEP} most recent daily backups`);
  });

  it("only after approval, with a fresh identity check and the typed confirmation; an administrator processes an ordinary request; erasure anonymizes and keeps shared records", async () => {
    const s = await requested();
    const fresh = { reauthAt: new Date() };
    expect(await executeDeletion(s.admin.id, { id: s.requestId, phrase: "ERASE" }, fresh)).toMatchObject({ ok: false }); // not approved yet
    expect((await updatePrivacyRequest(s.admin.id, { id: s.requestId, status: "APPROVED_FOR_DELETION", response: "" })).ok).toBe(true);
    const member = await createMember("Mona");
    expect(await executeDeletion(member.id, { id: s.requestId, phrase: "ERASE" }, fresh)).toMatchObject({ ok: false }); // not staff
    expect(await executeDeletion(s.admin.id, { id: s.requestId, phrase: "ERASE" }, { reauthAt: null })).toMatchObject({ ok: false }); // no fresh identity check
    expect(await executeDeletion(s.admin.id, { id: s.requestId, phrase: "ERASE" }, { reauthAt: new Date(Date.now() - 11 * 60_000) })).toMatchObject({ ok: false });
    expect(await executeDeletion(s.admin.id, { id: s.requestId, phrase: "erase" }, fresh)).toMatchObject({ ok: false });
    const acceptancesBefore = await db.legalAcceptance.count({ where: { userId: s.b.id } });
    const channel = await db.groupChannel.findFirstOrThrow({ where: { groupId: s.g.id } });
    await db.chatMessage.create({ data: { channelId: channel.id, authorId: s.b.id, body: "a message from Bob" } });
    const res = await executeDeletion(s.admin.id, { id: s.requestId, phrase: "ERASE" }, fresh);
    expect(res.ok).toBe(true);
    expect(await db.chatMessage.count({ where: { authorId: s.b.id, deletedAt: null, kind: "USER" } })).toBe(0); // the member's choice
    const u = await db.user.findUniqueOrThrow({ where: { id: s.b.id } });
    expect(u).toMatchObject({ name: "Erased account", passwordHash: null, totpSecretEnc: null, status: "DEACTIVATED", membershipStatus: "REVOKED" });
    expect(u.email).not.toBe("bob@example.test");
    expect(u.erasedAt).not.toBeNull();
    expect(await db.memberProfile.count({ where: { userId: s.b.id } })).toBe(0);
    expect(await db.applicant.count({ where: { userId: s.b.id } })).toBe(0);
    expect(await db.session.count({ where: { userId: s.b.id } })).toBe(0);
    expect(await db.notification.count({ where: { userId: s.b.id } })).toBe(0);
    expect(await db.groupMembership.count({ where: { userId: s.b.id, status: "ACTIVE" } })).toBe(0);
    // Shared records stay, with valid links: the agreement participation and the acceptance records.
    expect(await db.projectAgreementParticipant.count({ where: { userId: s.b.id } })).toBe(1);
    expect(await db.legalAcceptance.count({ where: { userId: s.b.id } })).toBe(acceptancesBefore);
    expect((await db.projectAgreementVersion.findUniqueOrThrow({ where: { id: s.versionId } })).status).toBe("ACCEPTED");
    const r = await db.privacyRequest.findUniqueOrThrow({ where: { id: s.requestId } });
    expect(r.status).toBe("COMPLETED");
    expect(r.completedAt).not.toBeNull();
    // Running it twice is refused; an erased account cannot be reactivated.
    expect(await executeDeletion(s.owner.id, { id: s.requestId, phrase: "ERASE" }, fresh)).toMatchObject({ ok: false });
    expect(await reactivateUser(s.owner.id, s.b.id)).toMatchObject({ ok: false });
    // Deactivation is not erasure: other accounts are untouched.
    expect((await db.user.findUniqueOrThrow({ where: { id: s.a.id } })).erasedAt).toBeNull();
  });

  it("the completion notice goes to the confirmed address and its real outcome is recorded (no email set up here: not sent)", async () => {
    const s = await requested();
    await updatePrivacyRequest(s.owner.id, { id: s.requestId, status: "APPROVED_FOR_DELETION", response: "" });
    const res = await executeDeletion(s.owner.id, { id: s.requestId, phrase: "ERASE" }, { reauthAt: new Date() });
    if (!res.ok) throw new Error(res.error);
    expect(res.email?.status).toBe("not_configured");
    const r = await db.privacyRequest.findUniqueOrThrow({ where: { id: s.requestId } });
    const mail = await db.emailDelivery.findUniqueOrThrow({ where: { id: r.completionEmailId! } });
    expect(mail).toMatchObject({ templateKey: "account_deletion_completed", to: "bob@example.test", status: "NOT_CONFIGURED" });
    expect(mail.body ?? "").toContain("Backups made before the deletion are not changed");
    expect(mail.body ?? "").not.toMatch(/immediately|permanently erased from all/i);
    expect(await db.auditLog.count({ where: { action: "privacy.erasure_notice" } })).toBe(1);
  });
});

describe("Privacy Policy version 2", () => {
  it("is added next to the reviewed version 1, pending review; version 1 stays readable with its fingerprint", async () => {
    await ensureLegalDocuments();
    const versions = await db.legalDocumentVersion.findMany({ where: { document: { key: "privacy" } }, orderBy: { version: "asc" } });
    expect(versions.map((v) => [v.version, v.status])).toEqual([
      [1, "SUPERSEDED"],
      [2, "PENDING_LEGAL_REVIEW"],
    ]);
    const v1 = LEGAL_DOCUMENTS.find((d) => d.key === "privacy")!.text(process.env.ORG_NAME!);
    expect(versions[0]!.contentHash).toBe(createHash("sha256").update(v1).digest("hex"));
    expect(versions[0]!.publishedAt).toBeNull();
    expect((await displayedVersion("privacy"))!.version.version).toBe(2);
    expect((await publicVersion("privacy", 1))?.version.status).toBe("SUPERSEDED");
    expect(publicationProblem(versions[1]!.content)).toBeNull();
    // The one-time publication of reviewed texts never publishes version 2.
    const owner = await createUser({ email: "owner@example.test", totp: true });
    const res = await publishReviewedDocuments(db, { ownerId: owner.id, orgName: process.env.ORG_NAME!, approvalNote: "Reviewed by Example Law (test) on 2026-11-20.", effectiveDate: new Date() });
    expect(res.find((r) => r.key === "privacy")?.result).toBe("incomplete");
    expect((await displayedVersion("privacy"))!.version.status).toBe("PENDING_LEGAL_REVIEW");
  });

  it("an owner's own version is never numbered over", async () => {
    await db.legalDocument.create({ data: { key: "privacy", title: "Privacy Policy", summary: "x", versions: { create: [{ version: 1, status: "PUBLISHED", content: "Owner text, long enough to be a document here.", contentHash: "a".repeat(64), publishedAt: new Date() }] } } });
    await ensureLegalDocuments();
    expect(await db.legalDocumentVersion.count({ where: { document: { key: "privacy" } } })).toBe(1);
  });

  it("says what the software does: hosting in general terms, Cloudflare, Resend, backups, investigations, deletion", () => {
    const t = privacyV2("Twigo");
    for (const s of ["does not identify the precise physical server location", "Cloudflare", "Resend", "Google Meet", "Administrator accounts cannot join groups", "the owner of Twigo explicitly approved", "at most 30 days", "Request deletion", "Backups are not changed", "currently 14"]) expect(t).toContain(s);
    expect(env().BACKUP_KEEP).toBe(14);
    expect(t).not.toMatch(/Administrators do not browse them|full deletion is done on request|before publication|before this policy is published/);
  });

  it("registration and the application record the Privacy Policy version actually shown (version 2)", async () => {
    const reg = await registerAccount({ fullName: "Nora New", email: "nora@example.test", password: "a-long-password-123", confirm: "a-long-password-123", acceptTerms: true, acceptGuidelines: true, ackPrivacy: true }, { ipHash: "ip" });
    expect(reg.ok).toBe(true);
    const nora = await db.user.findUniqueOrThrow({ where: { email: "nora@example.test" } });
    expect(await db.legalAcceptance.findFirst({ where: { userId: nora.id, documentKey: "privacy" }, select: { version: true, kind: true } })).toEqual({ version: 2, kind: "ACKNOWLEDGED" });
    const { application } = await submitTestApplication({ email: "ada@example.test" });
    expect(application.privacyNoticeVersion).toMatch(/^privacy v2 \(pending legal review\) [0-9a-f]{16}$/);
  });
});
