import "server-only";
import { z } from "zod";
import { brand } from "@/config/brand";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { deliverTemplate } from "@/lib/email";
import { revokeUserSessions } from "@/lib/auth/session";
import { publishRealtime } from "@/lib/realtime-events";
import { rateLimit } from "@/lib/rate-limit";
import { checkStepToken } from "@/lib/security";
import { REAUTH_MINUTES } from "@/lib/auth/constants";
import { notify } from "@/server/community/notifications";

/**
 * Account and personal-data deletion requests.
 *
 * Nothing is deleted when a member asks. The request passes:
 *   1. the member's choice and the explained consequences (a signed step token, issued by that page);
 *   2. a fresh identity check AFTER that step (password, plus the two-step code where enabled);
 *   3. a separate, explicit final confirmation (a tick and the typed phrase);
 * and only then enters the owner's queue (Admin, Privacy requests). The owner reviews it, marks it
 * "Approved for deletion", sees the exact plan and confirms; the erasure then runs in one transaction.
 *
 * Erasure anonymizes the account row instead of removing it: other members' shared records (group
 * content, project agreements, acceptance records) keep valid links but no longer show the person's
 * name or address. Deactivation (closing an account) is a different thing and never sets `erasedAt`.
 * Backups are not changed: they expire on their own schedule (see backupNote()).
 */

export const DELETION_PURPOSE = "deletion-request";
export const DELETION_SCOPE = "ACCOUNT_AND_PERSONAL_DATA";
export const DELETION_PHRASE = "DELETE MY ACCOUNT";
/** The consequences page's token is valid this long; the identity check must happen after it was issued. */
export const STEP_MAX_AGE_MS = 60 * 60_000;
/** Requests in these states are still being handled (only one at a time per person). */
export const OPEN_DELETION = ["OPEN", "VERIFICATION_REQUIRED", "IN_PROGRESS", "INFO_REQUIRED", "APPROVED_FOR_DELETION", "PROCESSING"] as const;

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const finalSchema = z.object({
  token: z.string().min(10),
  scope: z.literal(DELETION_SCOPE),
  confirm: z.literal(true, { message: "Tick the box to confirm that this is a request to delete your account and personal data." }),
  phrase: z.string().trim(),
  details: z.string().trim().max(2000).default(""),
});

/** True when the final step may be shown: a valid step token and an identity check made after it, recently. */
export function deletionStepVerified(token: string, userId: string, reauthAt: Date | null | undefined, now = Date.now()) {
  const stepAt = checkStepToken(token, DELETION_PURPOSE, `${userId}:${DELETION_SCOPE}`, STEP_MAX_AGE_MS, now);
  return !!stepAt && !!reauthAt && reauthAt.getTime() > stepAt.getTime() && now - reauthAt.getTime() < REAUTH_MINUTES * 60_000;
}

/**
 * Final step. `reauthAt` is the time the current session last confirmed the password (and code); it
 * must be after the consequences page was shown and within the usual window.
 */
export async function submitDeletionRequest(userId: string, session: { reauthAt: Date | null }, raw: unknown, now = Date.now()): Promise<Result<{ id: string }>> {
  const p = finalSchema.safeParse(raw);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Some values are not valid." };
  if (p.data.phrase !== DELETION_PHRASE) return { ok: false, error: `Type ${DELETION_PHRASE} exactly to confirm.` };
  const stepAt = checkStepToken(p.data.token, DELETION_PURPOSE, `${userId}:${p.data.scope}`, STEP_MAX_AGE_MS, now);
  if (!stepAt) return { ok: false, error: "Please start again from Account, Privacy & data, Request deletion: the confirmation step has expired." };
  const r = session.reauthAt;
  if (!r || r.getTime() <= stepAt.getTime() || now - r.getTime() > REAUTH_MINUTES * 60_000)
    return { ok: false, error: "Confirm your identity (password, and your two-step code if you use one) after reading the consequences, then confirm again." };
  if (!rateLimit(`deletion-request:${userId}`, 3, 24 * 3600_000).ok) return { ok: false, error: "Too many attempts today. Please try again tomorrow." };
  const user = await db.user.findUnique({ where: { id: userId }, select: { email: true, totpEnabledAt: true, erasedAt: true } });
  if (!user || user.erasedAt) return { ok: false, error: "Account not found." };
  const existing = await db.privacyRequest.findFirst({ where: { userId, kind: "DELETION", status: { in: [...OPEN_DELETION] } }, select: { id: true } });
  if (existing) return { ok: false, error: "You already have a deletion request in progress. You can follow it under Account, Privacy & data." };
  const created = await db.$transaction(async (tx) => {
    // Re-checked under the transaction against simultaneous submissions.
    const again = await tx.privacyRequest.findFirst({ where: { userId, kind: "DELETION", status: { in: [...OPEN_DELETION] } }, select: { id: true } });
    if (again) return null;
    const req = await tx.privacyRequest.create({
      data: {
        userId,
        email: user.email,
        kind: "DELETION",
        scope: p.data.scope,
        details: p.data.details || "Account and personal data deletion requested through Account, Privacy & data.",
        verifiedAt: r,
        verificationMethod: user.totpEnabledAt ? "password and two-step code" : "password",
      },
    });
    await tx.auditLog.create({ data: { actorId: userId, action: "privacy.deletion_requested", entityType: "PrivacyRequest", entityId: req.id, metadata: { scope: p.data.scope, verification: req.verificationMethod } } });
    return req;
  });
  if (!created) return { ok: false, error: "You already have a deletion request in progress." };
  const owners = (await db.user.findMany({ where: { role: "OWNER", status: "ACTIVE" }, select: { id: true } })).map((u) => u.id);
  await notify(owners, { type: "ADMIN_MESSAGE", title: "A member asked for their account and personal data to be deleted", body: "Review it in Admin, Privacy requests.", link: `/admin/privacy-requests/${created.id}` }, { exclude: userId });
  return { ok: true, id: created.id };
}

/** What happens to each category of the person's data. Counts only; shown to the owner before execution. */
export type PlanItem = { category: string; count: number; action: "delete" | "anonymize" | "end" | "retain" | "retain-temporarily" | "founder-decision"; explanation: string };

export function backupNote() {
  const keep = env().BACKUP_KEEP;
  return `Backups made before the deletion are not changed. The ${keep} most recent daily backups are kept and older ones are deleted automatically, so a copy can remain for about ${keep} days. Copies made before a software update are kept until the operator deletes them.`;
}

export async function deletionPlan(userId: string): Promise<PlanItem[]> {
  const u = await db.user.findUnique({ where: { id: userId }, select: { id: true, email: true, participantId: true } });
  if (!u) return [];
  const applicant = await db.applicant.findFirst({ where: { userId }, select: { id: true, _count: { select: { applications: true } }, participant: { select: { id: true, _count: { select: { assignments: true } } } } } });
  const [sessions, tokens, codes, profile, photo, notes, prefs, readStates, attendance, ideasOpen, ideasGrouped, comments, discussions, chat, groupFiles, research, tasks, decisions, links, memberships, agreements, acceptances, requests, reportsFiled, emails, audits, inquiries] = await Promise.all([
    db.session.count({ where: { userId } }),
    db.accountToken.count({ where: { userId } }),
    db.recoveryCode.count({ where: { userId } }),
    db.memberProfile.count({ where: { userId } }),
    db.storedFile.count({ where: { ownerId: userId, scope: "PROFILE_PHOTO", deletedAt: null } }),
    db.notification.count({ where: { userId } }),
    db.notificationPreference.count({ where: { userId } }),
    db.channelReadState.count({ where: { userId } }),
    db.meetingAttendance.count({ where: { userId } }),
    db.businessIdea.count({ where: { authorId: userId, group: null, status: { not: "REMOVED" } } }),
    db.businessIdea.count({ where: { authorId: userId, group: { isNot: null } } }),
    db.comment.count({ where: { authorId: userId, deletedAt: null } }),
    db.groupDiscussion.count({ where: { authorId: userId, deletedAt: null } }),
    db.chatMessage.count({ where: { authorId: userId, deletedAt: null, kind: "USER" } }),
    db.storedFile.count({ where: { ownerId: userId, scope: "GROUP_FILE", deletedAt: null } }),
    db.researchNote.count({ where: { authorId: userId } }),
    db.researchTask.count({ where: { createdById: userId } }),
    db.groupDecision.count({ where: { recordedById: userId } }),
    db.groupLink.count({ where: { addedById: userId } }),
    db.groupMembership.count({ where: { userId, status: "ACTIVE" } }),
    db.projectAgreementParticipant.count({ where: { userId } }),
    db.legalAcceptance.count({ where: { userId } }),
    db.privacyRequest.count({ where: { userId } }),
    db.contentReport.count({ where: { reporterId: userId } }),
    db.emailDelivery.count({ where: { to: u.email } }),
    db.auditLog.count({ where: { OR: [{ actorId: userId }, { entityId: userId }] } }),
    db.contactInquiry.count({ where: { email: u.email } }),
  ]);
  const compensation = applicant?.participant?._count.assignments ?? 0;
  const appAction: PlanItem["action"] = !applicant ? "delete" : compensation > 0 ? "founder-decision" : "delete";
  return [
    { category: "Account record", count: 1, action: "anonymize", explanation: "Name and email address removed, password and two-step settings removed, sign-in impossible. The row stays as an anonymous placeholder so shared records keep valid links." },
    { category: "Sessions, sign-in links and recovery codes", count: sessions + tokens + codes, action: "delete", explanation: "All signed-in sessions end." },
    { category: "Profile and profile photo", count: profile + photo, action: "delete", explanation: "The photo file is removed from storage." },
    {
      category: "Application (and internal participant record)",
      count: applicant ? applicant._count.applications : 0,
      action: appAction,
      explanation:
        appAction === "founder-decision"
          ? `Linked to ${compensation} assignment(s) in the earlier administrator-run project records, which may carry compensation records. Not deleted automatically: decide separately (Admin, Earlier project records).`
          : "Deleted, with the internal participant record.",
    },
    { category: "Notifications, preferences, chat read markers, meeting attendance", count: notes + prefs + readStates + attendance, action: "delete", explanation: "Personal records with no value to others." },
    { category: "Group memberships", count: memberships, action: "end", explanation: "The person leaves every group (shown in each group's chat as for any leave). Coordinator roles pass on." },
    { category: "Ideas without a group", count: ideasOpen, action: "founder-decision", explanation: "Optional: remove them (hidden now, permanently deleted by the regular clean-up after the deleted-content period). Otherwise kept, shown without the name." },
    { category: "Comments and group discussions", count: comments + discussions, action: "founder-decision", explanation: "Optional: remove them (same clean-up). Otherwise kept, shown without the name." },
    { category: "Chat messages", count: chat, action: "founder-decision", explanation: "Optional: remove them (same clean-up). Other members' replies stay. Otherwise kept, shown without the name." },
    { category: "Ideas that formed a group; research notes, tasks, decisions, links and group files", count: ideasGrouped + research + tasks + decisions + links + groupFiles, action: "retain", explanation: "Shared group records other members depend on. Not deleted; shown without the name." },
    { category: "Project agreements (participations)", count: agreements, action: "retain", explanation: "Evidence of what the participants agreed. The agreement text and its fingerprint cannot change; the participant name in it stays." },
    { category: "Records of accepted policies", count: acceptances, action: "retain", explanation: "Kept as evidence of what was agreed (Privacy Policy, acceptance records)." },
    { category: "Privacy requests (including this one) and reports the person filed", count: requests + reportsFiled, action: "retain", explanation: "Evidence that requests and reports were handled." },
    { category: "Email delivery log", count: emails, action: "retain", explanation: "Kept until the email-log retention period ends (Admin, Settings), then deleted by the regular clean-up." },
    { category: "Audit log entries", count: audits, action: "retain", explanation: "Kept; the audit log has no automatic deletion (Privacy Policy)." },
    { category: "Contact form messages from the same address", count: inquiries, action: "retain", explanation: "Not linked to the account; deleted by the regular clean-up after they are closed." },
    { category: "Backups", count: 0, action: "retain-temporarily", explanation: backupNote() },
  ];
}

const execSchema = z.object({
  id: z.string().min(1),
  phrase: z.string().trim(),
  removeIdeas: z.boolean().default(false),
  removeComments: z.boolean().default(false),
  removeChat: z.boolean().default(false),
});

/**
 * Carries out an approved request. Owner only (the caller checks the permission; this re-checks the role).
 * Returns the result of the completion notice; a failed email never undoes the erasure and stays visible.
 */
export async function executeDeletion(ownerId: string, raw: unknown, now = new Date()): Promise<Result<{ email: { status: string; deliveryId: string } | null }>> {
  const p = execSchema.safeParse(raw);
  if (!p.success) return { ok: false, error: "Some values are not valid." };
  if (p.data.phrase !== "ERASE") return { ok: false, error: "Type ERASE to confirm." };
  const owner = await db.user.findUnique({ where: { id: ownerId }, select: { role: true } });
  if (owner?.role !== "OWNER") return { ok: false, error: "Only the owner can carry out a deletion." };
  const req = await db.privacyRequest.findUnique({ where: { id: p.data.id } });
  if (!req || req.kind !== "DELETION") return { ok: false, error: "Request not found." };
  if (req.status !== "APPROVED_FOR_DELETION") return { ok: false, error: "Only a request marked “Approved for deletion” can be carried out." };
  if (!req.userId) return { ok: false, error: "This request is no longer linked to an account." };
  const userId = req.userId;
  if (userId === ownerId) return { ok: false, error: "An owner cannot erase their own account here." };
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, email: true, name: true, role: true, erasedAt: true, emailVerifiedAt: true } });
  if (!user || user.erasedAt) return { ok: false, error: "The account was already erased." };
  if (user.role !== "MEMBER") return { ok: false, error: "Change this person's role to member first (staff accounts are not erased here)." };
  const plan = await deletionPlan(userId);
  const app = plan.find((x) => x.category.startsWith("Application"));
  // Moves to PROCESSING first, so that two clicks cannot run it twice.
  const claimed = await db.privacyRequest.updateMany({ where: { id: req.id, status: "APPROVED_FOR_DELETION" }, data: { status: "PROCESSING", handledById: ownerId, handledAt: now } });
  if (!claimed.count) return { ok: false, error: "This request is already being processed." };
  await db.auditLog.create({ data: { actorId: ownerId, action: "privacy.erasure_started", entityType: "PrivacyRequest", entityId: req.id, metadata: { removeIdeas: p.data.removeIdeas, removeComments: p.data.removeComments, removeChat: p.data.removeChat } } });

  // Steps that have their own locking and notices run first: leaving groups (coordinator succession,
  // chat lines) and ending sessions (live connections are closed).
  const { leaveAllGroups } = await import("@/server/community/groups");
  await leaveAllGroups(userId);
  await revokeUserSessions(userId);
  await publishRealtime(db, { t: "user.revoked", userId });

  const photoKeys: string[] = [];
  const outcome = await db.$transaction(async (tx) => {
    const counts: Record<string, number> = {};
    counts.sessions = (await tx.session.deleteMany({ where: { userId } })).count;
    counts.tokens = (await tx.accountToken.deleteMany({ where: { userId } })).count;
    counts.recoveryCodes = (await tx.recoveryCode.deleteMany({ where: { userId } })).count;
    const photos = await tx.storedFile.findMany({ where: { ownerId: userId, scope: "PROFILE_PHOTO" }, select: { id: true, storageKey: true } });
    photoKeys.push(...photos.map((f) => f.storageKey));
    counts.profile = (await tx.memberProfile.deleteMany({ where: { userId } })).count;
    counts.profilePhotos = (await tx.storedFile.deleteMany({ where: { id: { in: photos.map((f) => f.id) } } })).count;
    counts.notifications = (await tx.notification.deleteMany({ where: { userId } })).count;
    counts.notificationPreferences = (await tx.notificationPreference.deleteMany({ where: { userId } })).count;
    counts.chatReadMarkers = (await tx.channelReadState.deleteMany({ where: { userId } })).count;
    counts.meetingAttendance = (await tx.meetingAttendance.deleteMany({ where: { userId } })).count;
    if (app?.action === "delete") counts.applicant = (await tx.applicant.deleteMany({ where: { userId } })).count;
    else counts.applicantRetained = 1;
    if (p.data.removeIdeas) counts.ideasRemoved = (await tx.businessIdea.updateMany({ where: { authorId: userId, group: null, status: { not: "REMOVED" } }, data: { status: "REMOVED", removedAt: now } })).count;
    if (p.data.removeComments) {
      counts.commentsRemoved = (await tx.comment.updateMany({ where: { authorId: userId, deletedAt: null }, data: { deletedAt: now } })).count;
      counts.discussionsRemoved = (await tx.groupDiscussion.updateMany({ where: { authorId: userId, deletedAt: null }, data: { deletedAt: now } })).count;
    }
    if (p.data.removeChat) {
      const msgs = await tx.chatMessage.findMany({ where: { authorId: userId, deletedAt: null, kind: "USER" }, select: { id: true } });
      counts.chatMessagesRemoved = (await tx.chatMessage.updateMany({ where: { id: { in: msgs.map((m) => m.id) } }, data: { deletedAt: now } })).count;
      await tx.storedFile.updateMany({ where: { messageId: { in: msgs.map((m) => m.id) }, deletedAt: null }, data: { deletedAt: now } });
    }
    await tx.user.update({
      where: { id: userId },
      data: {
        email: `erased-${userId}@erased.invalid`,
        name: "Erased account",
        passwordHash: null,
        totpSecretEnc: null,
        totpPendingEnc: null,
        totpEnabledAt: null,
        status: "DEACTIVATED",
        membershipStatus: "REVOKED",
        erasedAt: now,
      },
    });
    await tx.privacyRequest.update({ where: { id: req.id }, data: { status: "COMPLETED", completedAt: now, outcome: counts, response: req.response ?? "Your account and personal data were deleted as described in the completion notice." } });
    await tx.auditLog.create({ data: { actorId: ownerId, action: "privacy.erasure_completed", entityType: "PrivacyRequest", entityId: req.id, metadata: counts } });
    return counts;
  });
  // Bytes of the deleted profile photos (after the database change committed).
  const { deleteStoredFile } = await import("@/server/community/files");
  for (const storageKey of photoKeys) await deleteStoredFile({ storageKey }).catch(() => {});
  const { reevaluateIdeas } = await import("@/server/community/ideas");
  await reevaluateIdeas(userId).catch(() => {});

  // The notice goes to the address that was confirmed on the account (captured before anonymization).
  let email: { status: string; deliveryId: string } | null = null;
  if (user.emailVerifiedAt) {
    const removed = [outcome.ideasRemoved ? "your ideas without a group" : "", outcome.commentsRemoved || outcome.discussionsRemoved ? "your comments and discussions" : "", outcome.chatMessagesRemoved ? "your chat messages" : ""].filter(Boolean);
    const b = brand();
    const res = await deliverTemplate(
      "account_deletion_completed",
      user.email,
      {
        name: user.name,
        orgName: b.name,
        completedAt: now.toISOString().replace("T", " ").slice(0, 16),
        removedContent: removed.length ? `Also removed: ${removed.join(", ")} (hidden now, permanently deleted by the regular clean-up).` : "",
        retainedNote:
          "records other members depend on or that show what was agreed: contributions in shared group areas (shown without your name), project agreements you accepted, the record of the policies you accepted, this request, and the log of administrative actions." +
          (outcome.applicantRetained ? " Your application is kept for now because it is linked to earlier project records; it will be reviewed separately." : ""),
        backupNote: backupNote(),
        contactEmail: b.contactEmail || "the contact page",
      },
      { userId },
    );
    email = { status: res.status, deliveryId: res.deliveryId };
    await db.privacyRequest.update({ where: { id: req.id }, data: { completionEmailId: res.deliveryId } });
    await db.auditLog.create({ data: { actorId: ownerId, action: "privacy.erasure_notice", entityType: "PrivacyRequest", entityId: req.id, metadata: { emailStatus: res.status, deliveryId: res.deliveryId } } });
  }
  return { ok: true, email };
}

/** Status changes for any privacy request, with a notice to the member (in the app; by email if they kept email on). */
const statusSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["OPEN", "VERIFICATION_REQUIRED", "IN_PROGRESS", "INFO_REQUIRED", "APPROVED_FOR_DELETION", "COMPLETED", "REJECTED"]),
  response: z.string().trim().max(2000).default(""),
  adminNotes: z.string().trim().max(4000).optional(),
});

export async function updatePrivacyRequest(ownerId: string, raw: unknown, now = new Date()): Promise<Result> {
  const p = statusSchema.safeParse(raw);
  if (!p.success) return { ok: false, error: "Some values are not valid." };
  const req = await db.privacyRequest.findUnique({ where: { id: p.data.id } });
  if (!req) return { ok: false, error: "Request not found." };
  if (req.status === "COMPLETED" || req.status === "PROCESSING") return { ok: false, error: "This request is finished or being processed; it cannot be changed." };
  const s = p.data.status;
  if (req.kind === "DELETION" && s === "COMPLETED") return { ok: false, error: "A deletion request is completed only by carrying out the deletion." };
  if (req.kind !== "DELETION" && s === "APPROVED_FOR_DELETION") return { ok: false, error: "Only deletion requests can be approved for deletion." };
  if ((s === "COMPLETED" || s === "REJECTED" || s === "INFO_REQUIRED" || s === "VERIFICATION_REQUIRED") && p.data.response.length < 5)
    return { ok: false, error: "Write a message to the member (what was done, why it is refused, or what is needed)." };
  await db.privacyRequest.update({
    where: { id: req.id },
    data: { status: s, ...(p.data.response ? { response: p.data.response } : {}), ...(p.data.adminNotes !== undefined ? { adminNotes: p.data.adminNotes || null } : {}), handledById: ownerId, handledAt: now, ...(s === "COMPLETED" ? { completedAt: now } : {}) },
  });
  await db.auditLog.create({ data: { actorId: ownerId, action: "privacy.request_updated", entityType: "PrivacyRequest", entityId: req.id, metadata: { from: req.status, to: s } } });
  if (req.userId && s !== req.status)
    await notify([req.userId], { type: "ADMIN_MESSAGE", title: "Your privacy request was updated", body: p.data.response || undefined, link: "/account/data" });
  return { ok: true };
}
