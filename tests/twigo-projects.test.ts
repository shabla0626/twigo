/**
 * Twigo Stage 10: group-led project agreements. Every participant accepts the exact text; versions are
 * immutable; nobody can silently change another person's compensation; withdrawal forfeits nothing;
 * downloads are limited to the group (and the owner).
 */
import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { GET as downloadRoute } from "@/app/api/agreements/[id]/route";
import {
  acceptAgreement,
  activateProject,
  createGroupProject,
  declineAgreement,
  openForAcceptance,
  projectDetail,
  saveAgreementDraft,
  setLegalReview,
  withdrawFromProject,
} from "@/server/community/group-projects";
import { cookieJar, createMember, createUser, resetDb, signIn } from "./helpers";
import { fullTerms, groupOfThree, participant } from "./twigo-fixtures";

beforeEach(async () => {
  await resetDb();
  cookieJar.clear();
});
afterAll(async () => {
  await db.$disconnect();
});

async function openedProject() {
  const f = await groupOfThree();
  const p = await createGroupProject(f.a.id, f.g.id, { name: "Bookkeeping pilot", objective: "Serve three local shops for six months." });
  if (!p.ok) throw new Error(p.error);
  const d = await saveAgreementDraft(f.a.id, p.id, fullTerms(), [participant(f.a.id, "40% of net"), participant(f.b.id, "35% of net"), participant(f.c.id, "25% of net")], "First draft");
  if (!d.ok) throw new Error(d.error);
  expect(await openForAcceptance(f.a.id, d.versionId)).toEqual({ ok: true });
  const v = await db.projectAgreementVersion.findUniqueOrThrow({ where: { id: d.versionId } });
  return { ...f, projectId: p.id, v };
}

async function acceptedProject() {
  const o = await openedProject();
  for (const u of [o.a, o.b, o.c]) expect((await acceptAgreement(u.id, o.v.id, o.v.contentHash)).ok).toBe(true);
  return o;
}

describe("drafting and asking for acceptance", () => {
  it("only an active group member can create a project, and only coordinators can edit the draft", async () => {
    const f = await groupOfThree();
    const outsider = await createMember("Olga");
    await expect(createGroupProject(outsider.id, f.g.id, { name: "Side project", objective: "Something outside the group." })).rejects.toThrow();
    const p = await createGroupProject(f.b.id, f.g.id, { name: "Bob's project", objective: "Bob coordinates this one." });
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    // Bob created it, so Bob is its coordinator; Cara (an ordinary member) cannot edit it.
    expect(await saveAgreementDraft(f.c.id, p.id, fullTerms(), [participant(f.c.id, "everything")], "")).toMatchObject({ ok: false });
    expect((await saveAgreementDraft(f.b.id, p.id, fullTerms(), [participant(f.b.id, "half")], "")).ok).toBe(true);
  });

  it("cannot ask for acceptance while required items are missing", async () => {
    const f = await groupOfThree();
    const p = await createGroupProject(f.a.id, f.g.id, { name: "Bookkeeping pilot", objective: "Serve three local shops for six months." });
    if (!p.ok) throw new Error();
    const d = await saveAgreementDraft(f.a.id, p.id, fullTerms({ contractingModel: "UNDECIDED", disputes: "", paymentRecipient: "" }), [participant(f.a.id, "")], "");
    if (!d.ok) throw new Error();
    const res = await openForAcceptance(f.a.id, d.versionId);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      for (const item of ["Contracting arrangement", "Dispute resolution", "Who receives customer payments", "Responsibilities and compensation for every participant"]) expect(res.error).toContain(item);
    }
  });

  it("only listed participants can accept, with the fingerprint of the text they read", async () => {
    const o = await openedProject();
    const d = await createMember("Dan");
    expect(await acceptAgreement(o.a.id, o.v.id, "0".repeat(64))).toMatchObject({ ok: false });
    await expect(acceptAgreement(d.id, o.v.id, o.v.contentHash)).rejects.toThrow(); // not even a group member
    expect(await acceptAgreement(o.a.id, o.v.id, o.v.contentHash)).toEqual({ ok: true, allAccepted: false });
    const rec = await db.projectAgreementParticipant.findFirstOrThrow({ where: { versionId: o.v.id, userId: o.a.id } });
    expect(rec.acceptedHash).toBe(o.v.contentHash);
    expect(rec.acceptedAt).toBeInstanceOf(Date);
  });

  it("the agreement is in force only when every participant accepted", async () => {
    const o = await openedProject();
    await acceptAgreement(o.a.id, o.v.id, o.v.contentHash);
    await acceptAgreement(o.b.id, o.v.id, o.v.contentHash);
    expect((await db.projectAgreementVersion.findUniqueOrThrow({ where: { id: o.v.id } })).status).toBe("OPEN");
    expect((await activateProject(o.a.id, o.projectId)).ok).toBe(false);
    expect(await acceptAgreement(o.c.id, o.v.id, o.v.contentHash)).toEqual({ ok: true, allAccepted: true });
    expect((await db.projectAgreementVersion.findUniqueOrThrow({ where: { id: o.v.id } })).status).toBe("ACCEPTED");
  });

  it("a declined version stays not in force; the decline is recorded", async () => {
    const o = await openedProject();
    expect(await declineAgreement(o.c.id, o.v.id, "My share is too low.")).toEqual({ ok: true });
    const rec = await db.projectAgreementParticipant.findFirstOrThrow({ where: { versionId: o.v.id, userId: o.c.id } });
    expect(rec.declinedAt).toBeInstanceOf(Date);
    expect(rec.declineNote).toBe("My share is too low.");
    expect((await db.projectAgreementVersion.findUniqueOrThrow({ where: { id: o.v.id } })).status).toBe("OPEN");
  });
});

describe("changes create new versions", () => {
  it("a coordinator's change to someone's compensation needs everyone's acceptance again; until then the old version stays in force, unchanged", async () => {
    const o = await acceptedProject();
    const d2 = await saveAgreementDraft(o.a.id, o.projectId, fullTerms(), [participant(o.a.id, "60% of net"), participant(o.b.id, "25% of net"), participant(o.c.id, "15% of net")], "New split");
    if (!d2.ok) throw new Error();
    expect(d2.versionId).not.toBe(o.v.id);
    await openForAcceptance(o.a.id, d2.versionId);
    const v2 = await db.projectAgreementVersion.findUniqueOrThrow({ where: { id: d2.versionId } });
    expect(v2.version).toBe(2);
    // Version 1 is untouched and still in force.
    const v1 = await db.projectAgreementVersion.findUniqueOrThrow({ where: { id: o.v.id }, include: { participants: true } });
    expect(v1.status).toBe("ACCEPTED");
    expect(v1.content).toBe(o.v.content);
    expect(v1.contentHash).toBe(o.v.contentHash);
    expect(v1.participants.find((p) => p.userId === o.c.id)!.compensation).toBe("25% of net");
    // Cara declines; nothing changes for her.
    await acceptAgreement(o.a.id, v2.id, v2.contentHash);
    await declineAgreement(o.c.id, v2.id, "I do not agree.");
    expect((await projectDetail(o.projectId, o.c.id)).inForce?.id).toBe(o.v.id);
    // When everyone accepts, version 2 replaces version 1, which is kept as history.
    await acceptAgreement(o.b.id, v2.id, v2.contentHash);
    await acceptAgreement(o.c.id, v2.id, v2.contentHash);
    expect((await db.projectAgreementVersion.findUniqueOrThrow({ where: { id: o.v.id } })).status).toBe("SUPERSEDED");
    expect((await db.projectAgreementVersion.findUniqueOrThrow({ where: { id: v2.id } })).status).toBe("ACCEPTED");
    expect(await db.projectAgreementVersion.count({ where: { projectId: o.projectId } })).toBe(2);
  });

  it("an opened or accepted version can never be edited in place", async () => {
    const o = await acceptedProject();
    const before = await db.projectAgreementVersion.findUniqueOrThrow({ where: { id: o.v.id } });
    await saveAgreementDraft(o.a.id, o.projectId, fullTerms({ scope: "Changed scope." }), [participant(o.a.id, "all of it")], "");
    const after = await db.projectAgreementVersion.findUniqueOrThrow({ where: { id: o.v.id } });
    expect(after.content).toBe(before.content);
    expect(after.contentHash).toBe(before.contentHash);
  });
});

describe("activation, legal review and withdrawal", () => {
  it("activation needs the accepted version and a recorded legal-review outcome when one was flagged", async () => {
    const o = await acceptedProject();
    await setLegalReview(o.a.id, o.projectId, true, "Check tax treatment first.");
    expect((await activateProject(o.a.id, o.projectId)).ok).toBe(false);
    expect((await setLegalReview(o.a.id, o.projectId, false, "short")).ok).toBe(false);
    await setLegalReview(o.a.id, o.projectId, false, "An accountant confirmed the arrangement (test).");
    expect(await activateProject(o.a.id, o.projectId)).toEqual({ ok: true });
    expect((await db.groupProject.findUniqueOrThrow({ where: { id: o.projectId } })).status).toBe("ACTIVE");
  });

  it("leaving a project is recorded, forfeits nothing, and the others are told", async () => {
    const o = await acceptedProject();
    expect((await withdrawFromProject(o.c.id, o.projectId, "short")).ok).toBe(false);
    expect(await withdrawFromProject(o.c.id, o.projectId, "Moving to another city.")).toEqual({ ok: true });
    const rec = await db.projectAgreementParticipant.findFirstOrThrow({ where: { versionId: o.v.id, userId: o.c.id } });
    expect(rec.withdrewAt).toBeInstanceOf(Date);
    expect(rec.acceptedAt).toBeInstanceOf(Date); // the acceptance and the compensation terms stay on record
    expect(rec.compensation).toBe("25% of net");
    expect(o.v.content).toContain("does not by itself forfeit compensation already earned");
    expect(await db.notification.count({ where: { userId: { in: [o.a.id, o.b.id] }, type: "PROJECT_AGREEMENT", title: { contains: "leaving" } } })).toBe(2);
  });
});

describe("downloads", () => {
  const get = (id: string) => downloadRoute(new NextRequest(`http://localhost/api/agreements/${id}`), { params: Promise.resolve({ id }) });

  it("a group member downloads the exact text with its fingerprint and the acceptances", async () => {
    const o = await acceptedProject();
    await signIn(o.b.id);
    const res = await get(o.v.id);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toContain("attachment");
    const body = await res.text();
    expect(body).toContain(o.v.contentHash);
    expect(body).toContain(o.v.content);
    expect(body.match(/accepted \d{4}-/g)).toHaveLength(3);
  });

  it("people outside the group and signed-out visitors get nothing; drafts are never downloadable", async () => {
    const o = await acceptedProject();
    const outsider = await createMember("Olga");
    await signIn(outsider.id);
    expect((await get(o.v.id)).status).toBe(404);
    cookieJar.clear();
    expect((await get(o.v.id)).status).toBe(404);
    const d2 = await saveAgreementDraft(o.a.id, o.projectId, fullTerms(), [participant(o.a.id, "half")], "");
    if (!d2.ok) throw new Error();
    await signIn(o.a.id);
    expect((await get(d2.versionId)).status).toBe(404);
  });

  it("an administrator who is not the owner cannot download the financial terms", async () => {
    const o = await acceptedProject();
    await createUser({ email: "owner@example.test", totp: true });
    const admin = await createUser({ email: "admin@example.test", role: "ADMIN", totp: true, profile: true, membership: "ACTIVE" });
    await signIn(admin.id, "ADMIN");
    expect((await get(o.v.id)).status).toBe(404);
  });
});
