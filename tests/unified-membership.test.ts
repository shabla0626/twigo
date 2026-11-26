/**
 * Unified membership: no Senior/Starter grade, and group discussions are open
 * to every approved active member. Private group areas stay members-only.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { AccessError } from "@/server/community/access";
import { addComment, createDiscussion } from "@/server/community/comments";
import { authorizeDownload, storeUpload } from "@/server/community/files";
import { createGroupProject, openForAcceptance, saveAgreementDraft } from "@/server/community/group-projects";
import { admitMember, transferCoordinator } from "@/server/community/groups";
import { acceptInvitation, inviteToGroup } from "@/server/community/invitations";
import { getWorkspace } from "@/server/community/research";
import { channelAccess } from "@/realtime/chat-service";
import { cookieJar, createMember, createUser, resetDb } from "./helpers";
import { fullTerms, groupOfThree, participant } from "./twigo-fixtures";

beforeEach(async () => {
  await resetDb();
  cookieJar.clear();
});

afterAll(async () => {
  await db.$disconnect();
});

describe("unified community membership", () => {
  it("lets any approved group member create a project and be named in an agreement", async () => {
    const { a, g } = await groupOfThree();
    const dana = await createMember("Dana");
    expect((await admitMember(dana.id, g.id)).ok).toBe(true);
    const before = await db.user.findUniqueOrThrow({ where: { id: dana.id }, select: { membershipStatus: true, status: true } });

    const project = await createGroupProject(dana.id, g.id, { name: "Shared pilot", objective: "A concrete piece of work for a customer." });
    expect(project.ok).toBe(true);
    if (!project.ok) return;
    const draft = await saveAgreementDraft(dana.id, project.id, fullTerms(), [participant(dana.id, "the share the group writes")], "Dana is a full member");
    expect(draft.ok).toBe(true);
    if (!draft.ok) return;
    expect(await openForAcceptance(dana.id, draft.versionId)).toEqual({ ok: true });

    const after = await db.user.findUniqueOrThrow({ where: { id: dana.id }, select: { membershipStatus: true, status: true } });
    expect(after).toEqual(before);
    const membership = await db.groupMembership.findUniqueOrThrow({ where: { groupId_userId: { groupId: g.id, userId: dana.id } } });
    expect(membership.status).toBe("ACTIVE");
    expect(membership.role).toBe("MEMBER");
  });

  it("keeps community membership unchanged when the coordinator role moves", async () => {
    const { a, b, g } = await groupOfThree();
    const before = await db.user.findUniqueOrThrow({ where: { id: b.id }, select: { membershipStatus: true, status: true } });
    expect((await transferCoordinator(a.id, g.id, b.id)).ok).toBe(true);
    const after = await db.user.findUniqueOrThrow({ where: { id: b.id }, select: { membershipStatus: true, status: true } });
    expect(after).toEqual(before);
    const rows = await db.groupMembership.findMany({ where: { groupId: g.id }, select: { userId: true, role: true, status: true } });
    expect(rows).toHaveLength(3);
    expect(rows.find((r) => r.userId === b.id)?.role).toBe("COORDINATOR");
    expect(rows.find((r) => r.userId === a.id)?.role).toBe("MEMBER");
    expect(rows.every((r) => r.status === "ACTIVE")).toBe(true);
  });

  it("sends a group invitation only to an approved member and does not grant membership by itself", async () => {
    const { a, g } = await groupOfThree();
    const pending = await createUser({ email: "pending@example.test", role: "MEMBER", name: "Pending", profile: true, membership: "NONE" });
    expect((await inviteToGroup(a.id, g.id, pending.id)).ok).toBe(false);

    const guest = await createMember("Guest");
    const sent = await inviteToGroup(a.id, g.id, guest.id);
    expect(sent.ok).toBe(true);
    const row = await db.groupInvitation.findFirstOrThrow({ where: { inviteeId: guest.id, groupId: g.id } });
    expect(row.status).toBe("PENDING");
    expect(await db.groupMembership.findUnique({ where: { groupId_userId: { groupId: g.id, userId: guest.id } } })).toBeNull();

    expect((await acceptInvitation(guest.id, row.id)).ok).toBe(true);
    const joined = await db.groupMembership.findUniqueOrThrow({ where: { groupId_userId: { groupId: g.id, userId: guest.id } } });
    expect(joined.status).toBe("ACTIVE");
    expect(joined.role).toBe("MEMBER");
    expect((await db.user.findUniqueOrThrow({ where: { id: guest.id } })).membershipStatus).toBe("ACTIVE");
  });
});

describe("group discussions are open to approved members", () => {
  it("lets an approved member who is not in the group read, post, and reply", async () => {
    const { g } = await groupOfThree();
    const reader = await createMember("Reader");
    const created = await createDiscussion(reader.id, g.id, { title: "A question from outside the group", body: "Approved members can start this." });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const reply = await addComment(reader.id, { discussionId: created.id }, { body: "And they can reply.", parentId: null });
    expect(reply.ok).toBe(true);
    const stored = await db.groupDiscussion.findUniqueOrThrow({ where: { id: created.id }, include: { comments: true } });
    expect(stored.title).toBe("A question from outside the group");
    expect(stored.comments).toHaveLength(1);
  });

  it("refuses discussions from a pending applicant and a suspended member", async () => {
    const { g } = await groupOfThree();
    const pending = await createUser({ email: "applicant@example.test", role: "MEMBER", name: "Applicant", profile: true, membership: "NONE" });
    const suspended = await createMember("Paused");
    await db.user.update({ where: { id: suspended.id }, data: { membershipStatus: "SUSPENDED" } });
    expect((await createDiscussion(pending.id, g.id, { title: "No", body: "A pending applicant must not post." })).ok).toBe(false);
    expect((await createDiscussion(suspended.id, g.id, { title: "No", body: "A suspended member must not post." })).ok).toBe(false);
    const existing = await createDiscussion((await createMember("Host")).id, g.id, { title: "Visible thread", body: "Only approved members reply." });
    expect(existing.ok).toBe(true);
    if (!existing.ok) return;
    expect((await addComment(pending.id, { discussionId: existing.id }, { body: "no", parentId: null })).ok).toBe(false);
    expect((await addComment(suspended.id, { discussionId: existing.id }, { body: "no", parentId: null })).ok).toBe(false);
  });

  it("keeps chat, research, and group files limited to group members", async () => {
    const { a, g } = await groupOfThree();
    const outsider = await createMember("Outsider");
    const channel = await db.groupChannel.findFirstOrThrow({ where: { groupId: g.id } });
    expect(await channelAccess(db, outsider.id, channel.id)).toBeNull();
    expect(await channelAccess(db, a.id, channel.id)).not.toBeNull();
    await expect(getWorkspace(g.id, outsider.id)).rejects.toBeInstanceOf(AccessError);
    const upload = await storeUpload(a.id, { name: "notes.txt", bytes: Buffer.from("Market notes"), scope: "GROUP_FILE", groupId: g.id });
    expect(upload.ok).toBe(true);
    if (!upload.ok) return;
    expect(await authorizeDownload(outsider.id, upload.file.id)).toBeNull();
    expect(await authorizeDownload(a.id, upload.file.id)).not.toBeNull();
  });
});
