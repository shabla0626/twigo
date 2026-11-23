import { afterAll, beforeEach, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { sha256 } from "@/lib/crypto";
import { destinationFor } from "@/lib/auth/destination";
import { requireMember } from "@/lib/auth/guard";
import { authenticate } from "@/lib/auth/service";
import { lookupSession } from "@/lib/auth/session-core";
import { createSession } from "@/lib/auth/session";
import { issueToken } from "@/lib/auth/tokens";
import { channelAccess } from "@/realtime/chat-service";
import { setMembership, suspendUser } from "@/server/accounts";
import { updateApplicationStatus } from "@/server/admin/applications";
import { createIdea, endorseIdea } from "@/server/community/ideas";
import { getMyApplication, saveApplicationStep, submitMyApplication, withdrawMyApplication } from "@/server/membership-application";
import { changeUnverifiedEmail, registerAccount, sendVerificationEmail, verifyEmailToken } from "@/server/onboarding";
import { PASSWORD, applicationAnswers, cookieJar, createApplicantAccount, createLegacyApplication, createMember, createUser, resetDb, signIn, submitTestApplication } from "./helpers";

const NEW = { fullName: "Nora New", email: "nora@example.test", password: "a-long-password-123", confirm: "a-long-password-123", acceptTerms: true, acceptGuidelines: true, ackPrivacy: true };
const ip = (n = "ip-1") => ({ ipHash: n });

/** What the session layer says about a user right now (what every page, API and socket checks). */
async function access(userId: string) {
  const s = await createSession(userId, "MEMBER", {});
  return (await lookupSession(db, s.token))!.user;
}
async function verificationLink(userId: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  return (await issueToken(userId, "VERIFY_EMAIL", { email: user.email })).token;
}

beforeEach(async () => {
  await resetDb();
  cookieJar.clear();
});
afterAll(async () => {
  await db.$disconnect();
});

describe("account registration", () => {
  it("creates one unverified account with a hashed password and recorded consent, and nothing else", async () => {
    const res = await registerAccount(NEW, ip());
    expect(res.ok).toBe(true);
    const user = await db.user.findUniqueOrThrow({ where: { email: "nora@example.test" } });
    expect(user).toMatchObject({ name: "Nora New", role: "MEMBER", status: "ACTIVE", membershipStatus: "NONE", emailVerifiedAt: null });
    expect(user.passwordHash).toBeTruthy();
    expect(user.passwordHash).not.toContain("a-long-password-123");
    expect(user.termsAcceptedAt).not.toBeNull();
    // Registration is not an application and not a membership.
    expect(await db.applicant.count()).toBe(0);
    expect(await db.memberProfile.count()).toBe(0);
    // A verification email was attempted and logged (no provider in tests), with no link stored.
    const mail = await db.emailDelivery.findFirstOrThrow({ where: { templateKey: "account_verification" } });
    expect(mail.body).toBeNull();
    // Only a hash of the link's token is stored.
    const token = await db.accountToken.findFirstOrThrow({ where: { userId: user.id, kind: "VERIFY_EMAIL" } });
    expect(token.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(token.email).toBe("nora@example.test");
  });

  it("rejects invalid input with friendly field errors and creates nothing", async () => {
    const bad = await registerAccount({ ...NEW, email: "not-an-email", confirm: "different-123456", acceptTerms: false }, ip());
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(Object.keys(bad.fieldErrors ?? {})).toEqual(expect.arrayContaining(["email", "confirm", "acceptTerms"]));
    const weak = await registerAccount({ ...NEW, password: "short1", confirm: "short1" }, ip());
    expect(!weak.ok && weak.fieldErrors?.password?.[0]).toMatch(/at least 12/);
    expect(await db.user.count()).toBe(0);
  });

  it("does not create a second account or reveal that an address is already registered", async () => {
    const first = await registerAccount(NEW, ip());
    const again = await registerAccount({ ...NEW, fullName: "Someone Else", email: "  NORA@example.test " }, ip("ip-2"));
    // Same answer both times.
    expect({ ok: again.ok, email: again.ok && again.email }).toEqual({ ok: first.ok, email: first.ok && first.email });
    expect(await db.user.count()).toBe(1);
    expect((await db.user.findFirstOrThrow()).name).toBe("Nora New");
    // The owner of the address is told by email instead.
    expect(await db.emailDelivery.count({ where: { templateKey: "account_exists" } })).toBe(1);
  });

  it("simultaneous sign-ups with the same address create exactly one account", async () => {
    const results = await Promise.all([1, 2, 3, 4, 5].map((n) => registerAccount(NEW, ip(`ip-c${n}`))));
    expect(results.every((r) => r.ok)).toBe(true);
    expect(await db.user.count({ where: { email: "nora@example.test" } })).toBe(1);
  });

  it("limits repeated sign-up attempts from one network", async () => {
    const results = [];
    for (let i = 0; i < 11; i++) results.push(await registerAccount({ ...NEW, email: `p${i}@example.test` }, ip("ip-flood")));
    expect(results.slice(0, 10).every((r) => r.ok)).toBe(true);
    expect(results[10]!.ok).toBe(false);
  });

  it("stores names in any language exactly as typed", async () => {
    for (const [i, fullName] of ["José Núñez", "李小龍", "Олена Шевченко", "محمد علي", "Zoë O’Brien 🙂"].entries()) {
      await registerAccount({ ...NEW, fullName, email: `intl${i}@example.test` }, ip(`ip-i${i}`));
      expect((await db.user.findUniqueOrThrow({ where: { email: `intl${i}@example.test` } })).name).toBe(fullName);
    }
  });
});

describe("email verification", () => {
  it("a valid link verifies the address once; used, expired and invalid links are refused", async () => {
    const user = await createApplicantAccount("nora@example.test", "Nora New", { verified: false });
    const token = await verificationLink(user.id);
    const ok = await verifyEmailToken(token);
    expect(ok.ok && ok.kind).toBe("registration");
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).emailVerifiedAt).not.toBeNull();
    const reused = await verifyEmailToken(token);
    expect(!reused.ok && reused.error).toMatch(/already used/);
    expect((await verifyEmailToken("made-up-token")).ok).toBe(false);

    const other = await createApplicantAccount("late@example.test", "Late", { verified: false });
    const expired = await verificationLink(other.id);
    await db.accountToken.updateMany({ where: { userId: other.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const res = await verifyEmailToken(expired);
    expect(!res.ok && res.error).toMatch(/expired/);
    expect((await db.user.findUniqueOrThrow({ where: { id: other.id } })).emailVerifiedAt).toBeNull();
  });

  it("asking for a new link invalidates the old one and respects the cooldown", async () => {
    const user = await createApplicantAccount("nora@example.test", "Nora New", { verified: false });
    const oldToken = await verificationLink(user.id);
    const tooSoon = await sendVerificationEmail(user.id);
    expect(tooSoon).toMatchObject({ ok: false, reason: "cooldown" });
    await db.accountToken.updateMany({ where: { userId: user.id }, data: { createdAt: new Date(Date.now() - 120_000) } });
    expect((await sendVerificationEmail(user.id)).ok).toBe(true);
    // The earlier link no longer works.
    expect((await verifyEmailToken(oldToken)).ok).toBe(false);
    expect(await db.accountToken.count({ where: { userId: user.id, kind: "VERIFY_EMAIL", usedAt: null } })).toBe(1);
  });

  it("a link is bound to the address it was sent to: correcting a typo makes the old link useless", async () => {
    const user = await createApplicantAccount("typo@example.test", "Nora New", { verified: false });
    const oldToken = await verificationLink(user.id);
    await createApplicantAccount("taken@example.test", "Other");
    expect((await changeUnverifiedEmail(user.id, "taken@example.test")).ok).toBe(false);
    expect((await changeUnverifiedEmail(user.id, "not an email")).ok).toBe(false);
    expect((await changeUnverifiedEmail(user.id, "right@example.test")).ok).toBe(true);
    expect((await verifyEmailToken(oldToken)).ok).toBe(false);
    const fresh = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(fresh).toMatchObject({ email: "right@example.test", emailVerifiedAt: null });
    const newToken = await verificationLink(user.id);
    expect((await verifyEmailToken(newToken)).ok).toBe(true);
    // Once verified, the address can only be changed through account settings.
    expect((await changeUnverifiedEmail(user.id, "third@example.test")).ok).toBe(false);
  });

  it("an unverified account can sign in but is only ever sent to the verification page", async () => {
    await registerAccount(NEW, ip());
    const login = await authenticate("nora@example.test", "a-long-password-123", ip());
    expect(login.ok).toBe(true);
    const user = await db.user.findUniqueOrThrow({ where: { email: "nora@example.test" } });
    const a = await access(user.id);
    expect(a).toMatchObject({ emailVerified: false, communityAccess: false });
    expect(await destinationFor(a)).toBe("/verify-email");
    expect(await saveApplicationStep(user.id, 1, applicationAnswers().about)).toMatchObject({ ok: false, redirectTo: "/verify-email" });
    await signIn(user.id);
    await expect(requireMember()).rejects.toThrow("REDIRECT:/verify-email");
  });
});

describe("membership application", () => {
  it("saves a draft step by step, resumes it, and uses the account's name and email", async () => {
    const user = await createApplicantAccount();
    expect(await destinationFor(await access(user.id))).toBe("/apply");
    const answers = applicationAnswers();
    expect(await saveApplicationStep(user.id, 1, answers.about)).toEqual({ ok: true, nextStep: 2 });
    let app = (await getMyApplication(user.id))!;
    expect(app).toMatchObject({ status: "DRAFT", draftStep: 2 });
    expect(app.applicant).toMatchObject({ userId: user.id, email: "ada@example.test", fullName: "Ada Example", country: "Testland" });
    expect(await destinationFor(await access(user.id))).toBe("/apply");
    // Saving a step again updates the same draft.
    await saveApplicationStep(user.id, 1, { ...answers.about, occupation: "Nurse" });
    await saveApplicationStep(user.id, 2, answers.skills);
    await saveApplicationStep(user.id, 3, answers.motivation);
    app = (await getMyApplication(user.id))!;
    expect(app.applicant.occupation).toBe("Nurse");
    expect(app.workPreferences.map((w) => w.category).sort()).toEqual(["GENERAL_REMOTE", "RESEARCH"]);
    expect(app.availability?.hoursPerWeek).toBe(5);
    expect(await db.application.count()).toBe(1);
    expect(await db.applicant.count()).toBe(1);
  });

  it("cannot be submitted incomplete or without the confirmation", async () => {
    const user = await createApplicantAccount();
    await saveApplicationStep(user.id, 1, applicationAnswers().about);
    const incomplete = await submitMyApplication(user.id, { confirm: true });
    expect(!incomplete.ok && incomplete.error).toMatch(/Skills and time/);
    await saveApplicationStep(user.id, 2, applicationAnswers().skills);
    await saveApplicationStep(user.id, 3, applicationAnswers().motivation);
    expect((await submitMyApplication(user.id, { confirm: false })).ok).toBe(false);
    expect((await getMyApplication(user.id))!.status).toBe("DRAFT");
    const invalid = await saveApplicationStep(user.id, 3, { motivation: "short", contribution: "" });
    expect(invalid.ok).toBe(false);
  });

  it("submits exactly once, even with repeated and simultaneous clicks, and survives an email failure", async () => {
    const { user, application } = await submitTestApplication();
    expect(application).toMatchObject({ status: "SUBMITTED" });
    expect(application.submittedAt).not.toBeNull();
    // No email provider is configured in tests: the application is saved anyway.
    expect(application.confirmationSentAt).toBeNull();
    expect((await db.emailDelivery.findFirstOrThrow({ where: { templateKey: "application_received" } })).status).toBe("NOT_CONFIGURED");
    const again = await Promise.all([1, 2, 3, 4, 5].map(() => submitMyApplication(user.id, { confirm: true })));
    expect(again.every((r) => r.ok && r.alreadySubmitted)).toBe(true);
    expect(await db.application.count()).toBe(1);
    expect(await db.auditLog.count({ where: { action: "application.submitted" } })).toBe(1);
    expect(await db.emailDelivery.count({ where: { templateKey: "application_received" } })).toBe(1);
    // A submitted application cannot be edited through the form any more.
    expect(await saveApplicationStep(user.id, 1, applicationAnswers().about)).toMatchObject({ ok: false, redirectTo: "/application" });
    expect(await destinationFor(await access(user.id))).toBe("/application");
  });

  it("simultaneous first submissions of a draft produce one submitted application", async () => {
    const user = await createApplicantAccount();
    const a = applicationAnswers();
    await saveApplicationStep(user.id, 1, a.about);
    await saveApplicationStep(user.id, 2, a.skills);
    await saveApplicationStep(user.id, 3, a.motivation);
    const results = await Promise.all([1, 2, 3, 4, 5, 6].map(() => submitMyApplication(user.id, { confirm: true })));
    expect(results.every((r) => r.ok)).toBe(true);
    expect(results.filter((r) => r.ok && !r.alreadySubmitted)).toHaveLength(1);
    expect(await db.application.count({ where: { status: "SUBMITTED" } })).toBe(1);
    expect(await db.auditLog.count({ where: { action: "application.submitted" } })).toBe(1);
  });

  it("the database refuses a second open application for the same person", async () => {
    const { application } = await submitTestApplication();
    await expect(db.application.create({ data: { applicantId: application.applicantId, status: "DRAFT" } })).rejects.toThrow();
  });

  it("can be withdrawn by the applicant, and a new one can be started after a withdrawal or decline", async () => {
    const admin = await createUser({ email: "admin@example.test", totp: true });
    const { user } = await submitTestApplication();
    expect((await withdrawMyApplication(user.id)).ok).toBe(true);
    expect((await getMyApplication(user.id))!.status).toBe("WITHDRAWN");
    expect((await withdrawMyApplication(user.id)).ok).toBe(false);
    // Start again: a new draft, pre-filled from the same applicant record.
    await saveApplicationStep(user.id, 1, applicationAnswers().about);
    await saveApplicationStep(user.id, 2, applicationAnswers().skills);
    await saveApplicationStep(user.id, 3, applicationAnswers().motivation);
    const second = await submitMyApplication(user.id, { confirm: true });
    expect(second.ok && !second.alreadySubmitted).toBe(true);
    expect(await db.application.count()).toBe(2);
    expect(await db.applicant.count()).toBe(1);
    if (second.ok) await updateApplicationStatus(admin.id, second.applicationId, "DECLINED");
    expect(await destinationFor(await access(user.id))).toBe("/application");
    expect((await saveApplicationStep(user.id, 1, applicationAnswers().about)).ok).toBe(true);
    expect(await db.application.count()).toBe(3);
  });
});

describe("review, approval and community access", () => {
  it("approval upgrades the SAME account: membership, one participant, one profile, decision recorded", async () => {
    const admin = await createUser({ email: "admin@example.test", totp: true });
    const { user, application } = await submitTestApplication({ fullName: "Ada Example" });
    const hashBefore = (await db.user.findUniqueOrThrow({ where: { id: user.id } })).passwordHash;
    expect((await access(user.id)).communityAccess).toBe(false);

    await updateApplicationStatus(admin.id, application.id, "UNDER_REVIEW");
    const res = await updateApplicationStatus(admin.id, application.id, "ACCEPTED", { notify: true });
    expect(res).toMatchObject({ ok: true, status: "ACCEPTED", membership: "granted" });
    // The email could not be sent (no provider in tests), but the approval stands.
    expect(res.ok && res.email?.status).toBe("not_configured");

    const after = await db.user.findUniqueOrThrow({ where: { id: user.id }, include: { profile: true, participant: true } });
    expect(after).toMatchObject({ membershipStatus: "ACTIVE", membershipChangedById: admin.id });
    expect(after.passwordHash).toBe(hashBefore); // same password, no second activation
    expect(after.profile?.displayName).toBe("Ada Example");
    expect(after.participant?.applicationId).toBe(application.id);
    const app = await db.application.findUniqueOrThrow({ where: { id: application.id } });
    expect(app).toMatchObject({ status: "ACCEPTED", decidedById: admin.id });
    expect(app.decidedAt).not.toBeNull();

    // Approving again changes nothing and creates no duplicates.
    expect(await updateApplicationStatus(admin.id, application.id, "ACCEPTED")).toMatchObject({ ok: true, membership: "already" });
    expect([await db.user.count({ where: { role: "MEMBER" } }), await db.participant.count(), await db.memberProfile.count()]).toEqual([1, 1, 1]);
    expect(await db.auditLog.count({ where: { action: "membership.granted" } })).toBe(1);

    // The same email and password now open the community.
    expect((await authenticate("ada@example.test", PASSWORD, ip())).ok).toBe(true);
    const a = await access(user.id);
    expect(a.communityAccess).toBe(true);
    expect(await destinationFor(a)).toBe("/community");
    await signIn(user.id);
    expect((await requireMember()).id).toBe(user.id);
  });

  it("only allows sensible status changes", async () => {
    const admin = await createUser({ email: "admin@example.test", totp: true });
    const { application } = await submitTestApplication();
    const draftOwner = await createApplicantAccount("draft@example.test", "Draft Person");
    await saveApplicationStep(draftOwner.id, 1, applicationAnswers().about);
    const draft = (await getMyApplication(draftOwner.id))!;
    // A draft belongs to the applicant: it cannot be accepted or declined.
    expect((await updateApplicationStatus(admin.id, draft.id, "ACCEPTED")).ok).toBe(false);
    expect((await updateApplicationStatus(admin.id, application.id, "INTERVIEW_REQUESTED", { interviewDetails: "Tuesday 5pm or Thursday 6pm" })).ok).toBe(true);
    expect((await db.application.findUniqueOrThrow({ where: { id: application.id } })).interviewDetails).toBe("Tuesday 5pm or Thursday 6pm");
    expect((await updateApplicationStatus(admin.id, application.id, "WAITLISTED")).ok).toBe(true);
    expect((await updateApplicationStatus(admin.id, application.id, "DECLINED")).ok).toBe(true);
    expect((await updateApplicationStatus(admin.id, application.id, "ACCEPTED")).ok).toBe(false); // must be reopened first
    expect((await updateApplicationStatus(admin.id, application.id, "UNDER_REVIEW")).ok).toBe(true);
    expect((await updateApplicationStatus(admin.id, application.id, "ACCEPTED")).ok).toBe(true);
    expect((await updateApplicationStatus(admin.id, application.id, "DECLINED")).ok).toBe(false); // accepted is final here
    expect((await updateApplicationStatus(admin.id, "missing", "DECLINED")).ok).toBe(false);
  });

  it("pending, waitlisted and declined applicants can sign in and see their status, but never enter the community", async () => {
    const admin = await createUser({ email: "admin@example.test", totp: true });
    const author = await createMember("Maya");
    const supporter = await createMember("Luis");
    const idea = await createIdea(author.id, { title: "Community garden boxes", summary: "Sell simple raised garden boxes to neighbors.", category: "LOCAL_SERVICES", links: [] } as never);
    if (!idea.ok) throw new Error("idea");
    for (const status of ["SUBMITTED", "UNDER_REVIEW", "INTERVIEW_REQUESTED", "WAITLISTED", "DECLINED"] as const) {
      const { user, application } = await submitTestApplication({ email: `${status.toLowerCase()}@example.test` });
      if (status !== "SUBMITTED") expect((await updateApplicationStatus(admin.id, application.id, status)).ok, status).toBe(true);
      expect((await authenticate(user.email, PASSWORD, ip(`ip-${status}`))).ok, status).toBe(true);
      const a = await access(user.id);
      expect(a.communityAccess, status).toBe(false);
      expect(await destinationFor(a), status).toBe("/application");
      cookieJar.clear();
      await signIn(user.id);
      // Private pages and actions send them to their status page, never to a bare error.
      await expect(requireMember(), status).rejects.toThrow("REDIRECT:/application");
      // Server functions used by actions refuse too.
      expect((await endorseIdea(user.id, idea.id)).ok, status).toBe(false);
    }
    expect(await db.ideaEndorsement.count()).toBe(0);
    expect(supporter.id).toBeTruthy();
  });

  it("pausing or removing membership ends community access everywhere, without closing the account", async () => {
    const admin = await createUser({ email: "admin@example.test", totp: true });
    const member = await createMember("Dana");
    const other = await createMember("Eli");
    const group = await db.researchGroup.create({
      data: { slug: "g", name: "G", memberCount: 2, channels: { create: { name: "general", isDefault: true } }, memberships: { create: [{ userId: member.id }, { userId: other.id }] } },
      include: { channels: true },
    });
    const channel = group.channels[0]!.id;
    expect(await channelAccess(db, member.id, channel)).not.toBeNull();

    // Membership can only be granted by approving an application.
    const applicant = await createApplicantAccount("app@example.test", "App");
    expect((await setMembership(admin.id, applicant.id, "ACTIVE")).ok).toBe(false);

    expect((await setMembership(admin.id, member.id, "SUSPENDED")).ok).toBe(true);
    const a = await access(member.id);
    expect(a).toMatchObject({ communityAccess: false, membership: "SUSPENDED", status: "ACTIVE" });
    expect(await channelAccess(db, member.id, channel)).toBeNull(); // chat (and the realtime server) refuse
    expect(await destinationFor(a)).toBe("/application");
    expect((await authenticate(member.email, PASSWORD, ip())).ok).toBe(true); // can still sign in to see why
    await signIn(member.id);
    await expect(requireMember()).rejects.toThrow("REDIRECT:/application");

    expect((await setMembership(admin.id, member.id, "ACTIVE")).ok).toBe(true);
    expect((await access(member.id)).communityAccess).toBe(true);
    expect((await setMembership(admin.id, member.id, "REVOKED")).ok).toBe(true);
    expect((await access(member.id)).communityAccess).toBe(false);
    expect(await db.auditLog.count({ where: { action: { startsWith: "membership." }, entityId: member.id } })).toBe(3);

    // A suspended ACCOUNT cannot sign in at all, and existing sessions stop working.
    const s = await createSession(other.id, "MEMBER", {});
    await suspendUser(admin.id, other.id, "test");
    expect((await authenticate(other.email, PASSWORD, ip("ip-x"))).ok).toBe(false);
    expect(await lookupSession(db, s.token)).toBeNull();
  });

  it("administrators are sent to the admin area and are not treated as applicants", async () => {
    const admin = await createUser({ email: "admin@example.test", totp: true });
    const a = await access(admin.id);
    expect(await destinationFor({ ...a, role: "OWNER" })).toBe("/admin");
  });
});

describe("applications from before accounts existed", () => {
  it("are never exposed by typing the email address: only after the address is proven", async () => {
    const { application } = await createLegacyApplication("old@example.test", "Old Applicant", "SUBMITTED");
    await registerAccount({ ...NEW, fullName: "Impostor Or Owner", email: "old@example.test" }, ip());
    const user = await db.user.findUniqueOrThrow({ where: { email: "old@example.test" } });
    // Registered but not verified: nothing is linked, nothing is visible.
    expect(await getMyApplication(user.id)).toBeNull();
    expect((await db.applicant.findUniqueOrThrow({ where: { email: "old@example.test" } })).userId).toBeNull();
    // After opening the emailed link, the existing application belongs to the account.
    expect((await verifyEmailToken(await verificationLink(user.id))).ok).toBe(true);
    const mine = await getMyApplication(user.id);
    expect(mine?.id).toBe(application.id);
    expect(await db.applicant.count()).toBe(1);
    const a = await access(user.id);
    expect(a.communityAccess).toBe(false);
    expect(await destinationFor(a)).toBe("/application");
  });

  it("an application that was already accepted gives membership once its owner verifies the address", async () => {
    const admin = await createUser({ email: "admin@example.test", totp: true });
    const { application } = await createLegacyApplication("accepted@example.test", "Accepted Earlier", "SUBMITTED");
    const res = await updateApplicationStatus(admin.id, application.id, "ACCEPTED");
    expect(res).toMatchObject({ ok: true, membership: "pending_account" });
    expect(await db.participant.count()).toBe(1);

    await registerAccount({ ...NEW, fullName: "Accepted Earlier", email: "accepted@example.test" }, ip());
    const user = await db.user.findUniqueOrThrow({ where: { email: "accepted@example.test" } });
    expect((await access(user.id)).communityAccess).toBe(false);
    const verified = await verifyEmailToken(await verificationLink(user.id));
    expect(verified.ok && verified.kind === "registration" && verified.membershipGranted).toBe(true);
    const after = await db.user.findUniqueOrThrow({ where: { id: user.id }, include: { profile: true } });
    expect(after.membershipStatus).toBe("ACTIVE");
    expect(after.participantId).not.toBeNull();
    expect(after.profile?.displayName).toBe("Accepted Earlier");
    expect([await db.participant.count(), await db.applicant.count(), await db.user.count({ where: { role: "MEMBER" } })]).toEqual([1, 1, 1]);
    expect(await destinationFor(await access(user.id))).toBe("/community");
  });

  it("a different person cannot claim someone else's application", async () => {
    await createLegacyApplication("victim@example.test", "Victim", "ACCEPTED");
    await registerAccount({ ...NEW, email: "attacker@example.test" }, ip());
    const attacker = await db.user.findUniqueOrThrow({ where: { email: "attacker@example.test" } });
    await verifyEmailToken(await verificationLink(attacker.id));
    expect(await getMyApplication(attacker.id)).toBeNull();
    expect((await access(attacker.id)).communityAccess).toBe(false);
    // The typo-correction route does not help either: the address is already verified, and unverified accounts only get a link sent TO the address.
    expect((await changeUnverifiedEmail(attacker.id, "victim@example.test")).ok).toBe(false);
  });
});

describe("tokens are stored safely", () => {
  it("never stores a raw token", async () => {
    const user = await createApplicantAccount("nora@example.test", "Nora", { verified: false });
    const raw = await verificationLink(user.id);
    const rows = await db.accountToken.findMany();
    expect(rows.some((r) => r.tokenHash === raw)).toBe(false);
    expect(rows.some((r) => r.tokenHash === sha256(raw))).toBe(true);
  });
});

describe("password hashing", () => {
  it("accepts passwords stored with the old scheme and upgrades them at sign-in", async () => {
    const user = await createApplicantAccount("old@example.test", "Old Hash");
    await db.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(PASSWORD, 10) } });
    expect((await authenticate("old@example.test", "wrong-password-123", ip())).ok).toBe(false);
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).passwordHash).toMatch(/^\$2/); // unchanged after a failure
    expect((await authenticate("old@example.test", PASSWORD, ip("ip-2"))).ok).toBe(true);
    const upgraded = (await db.user.findUniqueOrThrow({ where: { id: user.id } })).passwordHash!;
    expect(upgraded).toMatch(/^scrypt\$32768\$8\$1\$/);
    expect((await authenticate("old@example.test", PASSWORD, ip("ip-3"))).ok).toBe(true);
  });
});
