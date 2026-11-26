/**
 * Regression tests for the corrective implementation plan, Stage 2 (second part).
 * P2-3: access for accepted people; P2-6: reopening an empty group.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { issueToken } from "@/lib/auth/tokens";
import { lookupSession } from "@/lib/auth/session-core";
import { createSession } from "@/lib/auth/session";
import { reactivateUser, setMembership, suspendUser } from "@/server/accounts";
import { updateApplicationStatus } from "@/server/admin/applications";
import { adminSetGroupState, admitMember, leaveGroup } from "@/server/community/groups";
import { createIdea, endorseIdea } from "@/server/community/ideas";
import { APPROVAL_MESSAGE, accessState } from "@/server/membership-grant";
import { verifyEmailToken } from "@/server/onboarding";
import { cookieJar, createLegacyApplication, createMember, createUser, resetDb, submitTestApplication } from "./helpers";

beforeEach(async () => {
  await resetDb();
  cookieJar.clear();
});
afterAll(async () => {
  await db.$disconnect();
});

const membership = async (userId: string) => (await db.user.findUniqueOrThrow({ where: { id: userId } })).membershipStatus;
async function canEnter(userId: string) {
  const s = await createSession(userId, "MEMBER", { mfaVerified: true });
  return (await lookupSession(db, s.token))!.user.communityAccess;
}

describe("P2-3: an accepted person always ends up with access, and the administrator is told the truth", () => {
  it("accepted while the account was suspended: told so, and access starts when the account is reactivated", async () => {
    const owner = await createUser({ totp: true });
    const { user, application } = await submitTestApplication();
    await suspendUser(owner.id, user.id, "test");
    const res = await updateApplicationStatus(owner.id, application.id, "ACCEPTED");
    expect(res).toMatchObject({ ok: true, membership: "pending_account", access: "account_inactive" });
    expect(APPROVAL_MESSAGE[res.ok ? res.access : "can_enter"]).toContain("suspended or deactivated");
    expect(await membership(user.id)).toBe("NONE");

    await reactivateUser(owner.id, user.id);
    expect(await membership(user.id)).toBe("ACTIVE");
    expect(await canEnter(user.id)).toBe(true);
    expect(await db.memberProfile.count({ where: { userId: user.id } })).toBe(1);
    expect(await db.auditLog.count({ where: { action: "membership.granted", entityId: user.id } })).toBe(1);
  });

  it("approving again gives access when it was missing, and says what really happened", async () => {
    const owner = await createUser({ totp: true });
    const { user, application } = await submitTestApplication();
    // Reproduce the stuck state the audit described: accepted, account active, but no membership.
    await updateApplicationStatus(owner.id, application.id, "ACCEPTED");
    await db.user.update({ where: { id: user.id }, data: { membershipStatus: "NONE" } });

    const again = await updateApplicationStatus(owner.id, application.id, "ACCEPTED");
    expect(again).toMatchObject({ ok: true, membership: "granted", access: "can_enter" });
    expect(await membership(user.id)).toBe("ACTIVE");
    // And once more: nothing changes, still truthful.
    expect(await updateApplicationStatus(owner.id, application.id, "ACCEPTED")).toMatchObject({ ok: true, membership: "already", access: "can_enter" });
    expect(await db.participant.count()).toBe(1);
  });

  it("never restores access that an administrator paused or removed", async () => {
    const owner = await createUser({ totp: true });
    const { user, application } = await submitTestApplication();
    await updateApplicationStatus(owner.id, application.id, "ACCEPTED");
    await setMembership(owner.id, user.id, "REVOKED");
    const again = await updateApplicationStatus(owner.id, application.id, "ACCEPTED");
    expect(again).toMatchObject({ ok: true, membership: "already", access: "access_removed" });
    expect(await membership(user.id)).toBe("REVOKED");
    await suspendUser(owner.id, user.id, "test");
    await reactivateUser(owner.id, user.id);
    expect(await membership(user.id)).toBe("REVOKED");
  });

  it("accepted before the email address was confirmed: access starts when it is confirmed", async () => {
    const owner = await createUser({ totp: true });
    const { user, application } = await submitTestApplication({ email: "late@example.test" });
    await db.user.update({ where: { id: user.id }, data: { emailVerifiedAt: null } });
    const res = await updateApplicationStatus(owner.id, application.id, "ACCEPTED");
    expect(res).toMatchObject({ ok: true, membership: "pending_account", access: "email_unconfirmed" });
    const { token } = await issueToken(user.id, "VERIFY_EMAIL", { email: "late@example.test" });
    expect(await verifyEmailToken(token)).toMatchObject({ ok: true, membershipGranted: true });
    expect(await membership(user.id)).toBe("ACTIVE");
  });

  it("an earlier accepted application without an account still gives access once its owner confirms the address", async () => {
    await createLegacyApplication("legacy@example.test", "Lena Legacy", "ACCEPTED");
    const user = await db.user.create({ data: { email: "legacy@example.test", name: "Lena Legacy", role: "MEMBER", status: "ACTIVE" } });
    const { token } = await issueToken(user.id, "VERIFY_EMAIL", { email: "legacy@example.test" });
    expect(await verifyEmailToken(token)).toMatchObject({ ok: true, membershipGranted: true });
    expect(await membership(user.id)).toBe("ACTIVE");
  });

  it("every situation has its own message for the administrator", () => {
    expect(accessState(null)).toBe("no_account");
    expect(accessState({ status: "SUSPENDED", emailVerifiedAt: new Date(), membershipStatus: "NONE" })).toBe("account_inactive");
    expect(accessState({ status: "ACTIVE", emailVerifiedAt: null, membershipStatus: "NONE" })).toBe("email_unconfirmed");
    expect(accessState({ status: "ACTIVE", emailVerifiedAt: new Date(), membershipStatus: "SUSPENDED" })).toBe("access_paused");
    expect(accessState({ status: "ACTIVE", emailVerifiedAt: new Date(), membershipStatus: "ACTIVE" })).toBe("can_enter");
    const texts = Object.values(APPROVAL_MESSAGE);
    expect(new Set(texts).size).toBe(texts.length);
    // Only the real "can enter" state says so.
    expect(texts.filter((t) => t.includes("can now enter"))).toHaveLength(1);
  });
});

describe("P2-6: a group that everyone left can be brought back", () => {
  it("reopening keeps it open; the first eligible person who joins becomes coordinator", async () => {
    const owner = await createUser({ totp: true });
    const [a, b, c] = [await createMember("Alice"), await createMember("Bob"), await createMember("Cara")];
    const res = await createIdea(a.id, {
      title: "Neighborhood bookkeeping service", summary: "Small local shops need simple, affordable monthly bookkeeping help.", category: "ONLINE_SERVICES",
      description: null, problem: null, proposal: null, customers: null, revenueModel: null, skillsNeeded: null, timeEstimate: null, links: [],
    });
    if (!res.ok) throw new Error(res.error);
    await endorseIdea(b.id, res.id);
    await endorseIdea(c.id, res.id);
    const g = await db.researchGroup.findUniqueOrThrow({ where: { ideaId: res.id }, include: { channels: true } });
    for (const u of [a, b, c]) await leaveGroup(u.id, g.id);
    expect(await db.researchGroup.findUniqueOrThrow({ where: { id: g.id } })).toMatchObject({ status: "ARCHIVED", adminManaged: true, memberCount: 0 });
    // While archived nobody can join.
    const dora = await createMember("Dora");
    expect((await admitMember(dora.id, g.id)).ok).toBe(false);

    expect((await adminSetGroupState(owner.id, g.id, "reopen")).ok).toBe(true);
    expect(await db.researchGroup.findUniqueOrThrow({ where: { id: g.id } })).toMatchObject({ status: "FORMING", adminManaged: true, archivedAt: null });

    expect((await admitMember(dora.id, g.id)).ok).toBe(true);
    const after = await db.researchGroup.findUniqueOrThrow({ where: { id: g.id }, include: { memberships: { where: { status: "ACTIVE" } } } });
    expect(after).toMatchObject({ status: "FORMING", adminManaged: false, memberCount: 1 });
    expect(after.memberships.map((m) => [m.userId, m.role])).toEqual([[dora.id, "COORDINATOR"]]);
    expect(await db.notification.count({ where: { userId: dora.id, type: "COORDINATOR_ASSIGNED" } })).toBe(1);
    const lines = (await db.chatMessage.findMany({ where: { channelId: g.channels[0]!.id, kind: "SYSTEM" }, orderBy: { createdAt: "asc" } })).map((m) => m.body);
    expect(lines.slice(-2)).toEqual(["Dora joined the group", "Dora is now the coordinator"]);

    // A second person joins as an ordinary member; the coordinator stays.
    const eve = await createMember("Eve");
    await admitMember(eve.id, g.id);
    const roles = await db.groupMembership.findMany({ where: { groupId: g.id, status: "ACTIVE" }, orderBy: { joinedAt: "asc" } });
    expect(roles.map((m) => m.role)).toEqual(["COORDINATOR", "MEMBER"]);
  });
});
