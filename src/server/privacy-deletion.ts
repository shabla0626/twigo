import "server-only";
import path from "node:path";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { brand } from "@/config/brand";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { deliverTemplate } from "@/lib/email";
import { revokeUserSessions } from "@/lib/auth/session";
import { publishRealtime } from "@/lib/realtime-events";
import { rateLimit } from "@/lib/rate-limit";
import { checkStepToken } from "@/lib/security";
import { REAUTH_MINUTES } from "@/lib/auth/constants";
import { can } from "@/lib/auth/permissions";
import { ERASURE_OP_VERSION, eraseAccountData, type ErasureChoices } from "@/ops/erasure";
import { appendLedger, ledgerKey } from "@/ops/erasure-ledger";
import { notify } from "@/server/community/notifications";

/**
 * Account and personal-data deletion requests (Privacy Policy version 2, section 7).
 *
 * Nothing is deleted when a member asks. The request passes:
 *   1. the member's choice (including whether their ideas, comments and discussions, and chat messages
 *      should be removed too) and the explained consequences (a signed step token bound to the choice);
 *   2. a fresh identity check AFTER that step (password, plus the two-step code where enabled);
 *   3. a separate, explicit final confirmation (a tick and the typed phrase);
 * and only then enters the queue (Admin, Privacy requests). Administrators process ordinary requests;
 * the owner handles exceptions (staff accounts, a legal hold, compensation records of earlier projects,
 * open disputes). Carrying out a request needs a fresh identity check of the person doing it, the plan
 * on screen and the typed word ERASE; the erasure is first written to the erasure ledger (outside the
 * database and its backups), then applied in one transaction (src/ops/erasure.ts).
 *
 * Erasure anonymizes the account row instead of removing it: shared records (group content, project
 * agreements, acceptance records) keep valid links but no longer show the person's name or address.
 * Deactivation (closing an account) is a different thing and never sets `erasedAt`.
 */

export const DELETION_PURPOSE = "deletion-request";
export const DELETION_SCOPE = "ACCOUNT_AND_PERSONAL_DATA";
export const DELETION_PHRASE = "DELETE MY ACCOUNT";
/** The consequences page's token is valid this long; the identity check must happen after it was issued. */
export const STEP_MAX_AGE_MS = 60 * 60_000;
/** Requests in these states are still being handled (only one at a time per person). */
export const OPEN_DELETION = ["OPEN", "VERIFICATION_REQUIRED", "IN_PROGRESS", "INFO_REQUIRED", "APPROVED_FOR_DELETION", "PROCESSING"] as const;

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/** The member's choices, as part of what the step token signs (so they cannot be changed afterwards). */
export const choiceKey = (c: ErasureChoices) => `i${c.removeIdeas ? 1 : 0}c${c.removeComments ? 1 : 0}m${c.removeChat ? 1 : 0}`;
export const stepSubject = (userId: string, c: ErasureChoices) => `${userId}:${DELETION_SCOPE}:${choiceKey(c)}`;

const finalSchema = z.object({
  token: z.string().min(10),
  scope: z.literal(DELETION_SCOPE),
  confirm: z.literal(true, { message: "Tick the box to confirm that this is a request to delete your account and personal data." }),
  phrase: z.string().trim(),
  details: z.string().trim().max(2000).default(""),
  removeIdeas: z.boolean().default(false),
  removeComments: z.boolean().default(false),
  removeChat: z.boolean().default(false),
});

/** True when the final step may be shown: a valid step token and an identity check made after it, recently. */
export function deletionStepVerified(token: string, userId: string, choices: ErasureChoices, reauthAt: Date | null | undefined, now = Date.now()) {
  const stepAt = checkStepToken(token, DELETION_PURPOSE, stepSubject(userId, choices), STEP_MAX_AGE_MS, now);
  return !!stepAt && !!reauthAt && reauthAt.getTime() > stepAt.getTime() && now - reauthAt.getTime() < REAUTH_MINUTES * 60_000;
}

/** Final step of the member's request. `reauthAt`: the session's last identity check (password, and code). */
export async function submitDeletionRequest(userId: string, session: { reauthAt: Date | null }, raw: unknown, now = Date.now()): Promise<Result<{ id: string }>> {
  const p = finalSchema.safeParse(raw);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Some values are not valid." };
  if (p.data.phrase !== DELETION_PHRASE) return { ok: false, error: `Type ${DELETION_PHRASE} exactly to confirm.` };
  const choices = { removeIdeas: p.data.removeIdeas, removeComments: p.data.removeComments, removeChat: p.data.removeChat };
  const stepAt = checkStepToken(p.data.token, DELETION_PURPOSE, stepSubject(userId, choices), STEP_MAX_AGE_MS, now);
  if (!stepAt) return { ok: false, error: "Please start again from Account, Privacy & data, Request deletion: the confirmation step has expired or your choices changed." };
  const r = session.reauthAt;
  if (!r || r.getTime() <= stepAt.getTime() || now - r.getTime() > REAUTH_MINUTES * 60_000)
    return { ok: false, error: "Confirm your identity (password, and your two-step code if you use one) after reading the consequences, then confirm again." };
  if (!rateLimit(`deletion-request:${userId}`, 3, 24 * 3600_000).ok) return { ok: false, error: "Too many attempts today. Please try again tomorrow." };
  const user = await db.user.findUnique({ where: { id: userId }, select: { email: true, totpEnabledAt: true, erasedAt: true } });
  if (!user || user.erasedAt) return { ok: false, error: "Account not found." };
  const existing = await db.privacyRequest.findFirst({ where: { userId, kind: "DELETION", status: { in: [...OPEN_DELETION] } }, select: { id: true } });
  if (existing) return { ok: false, error: "You already have a deletion request in progress. You can follow it under Account, Privacy & data." };
  const created = await db.$transaction(async (tx) => {
    // Re-checked inside the transaction, under a lock per account, against simultaneous submissions.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`privacy-deletion:${userId}`}))`;
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
        ...choices,
      },
    });
    await tx.auditLog.create({ data: { actorId: userId, action: "privacy.deletion_requested", entityType: "PrivacyRequest", entityId: req.id, metadata: { scope: p.data.scope, verification: req.verificationMethod, ...choices } } });
    return req;
  });
  if (!created) return { ok: false, error: "You already have a deletion request in progress." };
  const staff = (await db.user.findMany({ where: { role: { in: ["OWNER", "ADMIN"] }, status: "ACTIVE" }, select: { id: true } })).map((u) => u.id);
  await notify(staff, { type: "ADMIN_MESSAGE", title: "A member asked for their account and personal data to be deleted", body: "Review it in Admin, Privacy requests.", link: `/admin/privacy-requests/${created.id}` }, { exclude: userId });
  return { ok: true, id: created.id };
}

/** What happens to each category of the person's data (Privacy Policy version 2). Counts only. */
export type PlanItem = { category: string; count: number; action: "delete" | "anonymize" | "end" | "remove" | "keep" | "keep-necessary" | "backup-expiry"; explanation: string };

export function backupNote() {
  const keep = env().BACKUP_KEEP;
  return `Backups made before the deletion are not changed. The ${keep} most recent daily backups are kept and older ones are deleted automatically, so a copy can remain for about ${keep} days. Copies made before a software update are kept for 30 days (always the 3 most recent), then deleted automatically. Every deletion is also written to an erasure record kept outside the backups, so restoring an older backup re-applies it.`;
}

/**
 * Exceptions that only the owner may decide (the request stays in the queue for the owner):
 * a staff account, a legal hold, compensation records of the earlier administrator-run projects
 * (contractual evidence), or an open report about a dispute filed by or about the person.
 */
export async function deletionExceptions(userId: string, req: { legalHold: boolean; legalHoldReason: string | null }) {
  const out: string[] = [];
  const u = await db.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (u && u.role !== "MEMBER") out.push("The account is a staff account (owner or administrator). Change its role first; only the owner can do that.");
  if (req.legalHold) out.push(`Legal hold set by the owner${req.legalHoldReason ? `: ${req.legalHoldReason}` : ""}.`);
  const compensation = await db.compensationAgreement.count({ where: { assignment: { participant: { applicant: { userId } } } } });
  if (compensation) out.push(`Compensation records of earlier administrator-run projects exist (${compensation}); they are kept as contractual evidence.`);
  const disputes = await db.contentReport.count({ where: { status: "OPEN", reason: "DISPUTE", OR: [{ reporterId: userId }, { targetType: "USER", targetId: userId }] } });
  if (disputes) out.push(`Open dispute report(s): ${disputes}.`);
  return out;
}

export async function deletionPlan(userId: string, choices: ErasureChoices): Promise<PlanItem[]> {
  const u = await db.user.findUnique({ where: { id: userId }, select: { id: true, email: true } });
  if (!u) return [];
  const applicant = await db.applicant.findFirst({ where: { userId }, select: { _count: { select: { applications: true } } } });
  const compensation = await db.compensationAgreement.count({ where: { assignment: { participant: { applicant: { userId } } } } });
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
  const removed = (yes: boolean): PlanItem["action"] => (yes ? "remove" : "keep");
  const chosen = (yes: boolean) => (yes ? "The member asked for them to be removed: hidden now, permanently deleted by the regular clean-up after the deleted-content period." : "The member did not ask for them to be removed: kept, shown without the name (Privacy Policy version 2, section 7, point 5).");
  return [
    { category: "Account record", count: 1, action: "anonymize", explanation: "Name and email address removed, password and two-step settings removed, sign-in impossible. The row stays as an anonymous placeholder so shared records keep valid links." },
    { category: "Sessions, sign-in links and recovery codes", count: sessions + tokens + codes, action: "delete", explanation: "All signed-in sessions end." },
    { category: "Profile and profile photo", count: profile + photo, action: "delete", explanation: "The photo file is removed from storage." },
    compensation
      ? { category: "Application (and internal participant record)", count: applicant?._count.applications ?? 0, action: "keep-necessary", explanation: "Linked to compensation records of earlier administrator-run projects (contractual evidence): the applications are deleted and the applicant record is anonymized; only the participant record and its compensation records stay. Owner only." }
      : { category: "Application (and internal participant record)", count: applicant?._count.applications ?? 0, action: "delete", explanation: "Deleted, with the internal participant record." },
    { category: "Notifications, preferences, chat read markers, meeting attendance", count: notes + prefs + readStates + attendance, action: "delete", explanation: "Personal records with no value to others." },
    { category: "Group memberships", count: memberships, action: "end", explanation: "The person leaves every group (shown in each group's chat as for any leave). Coordinator roles pass on. In those chats, the automatic lines that name the person (joined, left, coordinator changes) then say “a former member”." },
    { category: "Ideas without a group", count: ideasOpen, action: removed(choices.removeIdeas), explanation: chosen(choices.removeIdeas) },
    { category: "Comments and group discussions", count: comments + discussions, action: removed(choices.removeComments), explanation: chosen(choices.removeComments) },
    { category: "Chat messages", count: chat, action: removed(choices.removeChat), explanation: chosen(choices.removeChat) + " Other members' replies stay." },
    { category: "Ideas that formed a group; research notes, tasks, decisions, links and group files", count: ideasGrouped + research + tasks + decisions + links + groupFiles, action: "keep", explanation: "Shared group records other members rely on (Privacy Policy version 2, section 7, point 5). Kept; shown as by a former member, without the name." },
    { category: "Project agreements (participations)", count: agreements, action: "keep", explanation: "Kept as evidence of what was agreed (Privacy Policy version 2, sections 3 and 7). The agreement text, which names its participants, is fingerprinted and cannot change; it is not anonymized." },
    { category: "Records of accepted policies", count: acceptances, action: "keep", explanation: "Kept as evidence of what was agreed (Privacy Policy version 2, section 3, Acceptance records)." },
    { category: "Privacy requests (including this one) and reports the person filed", count: requests + reportsFiled, action: "keep", explanation: "Evidence that requests and reports were handled (Privacy Policy version 2, section 7, point 5)." },
    { category: "Email delivery log", count: emails, action: "keep", explanation: "Kept until the email-log retention period ends (Admin, Settings), then deleted by the regular clean-up." },
    { category: "Audit log entries", count: audits, action: "keep", explanation: "Kept; the audit log has no automatic deletion (Privacy Policy version 2, section 3)." },
    { category: "Contact form messages from the same address", count: inquiries, action: "keep", explanation: "Not linked to the account; deleted by the regular clean-up after they are closed." },
    { category: "Backups", count: 0, action: "backup-expiry", explanation: backupNote() },
  ];
}

const execSchema = z.object({ id: z.string().min(1), phrase: z.string().trim() });

/**
 * Carries out an approved request. Administrators (permission privacy.erase) process ordinary requests;
 * exceptions (deletionExceptions) are the owner's. Needs a fresh identity check of the person doing it
 * (`reauthAt`), the typed word ERASE and the status "Approved for deletion". A failed completion email never
 * undoes the erasure and stays visible.
 */
export async function executeDeletion(actorId: string, raw: unknown, session: { reauthAt: Date | null }, now = new Date()): Promise<Result<{ email: { status: string; deliveryId: string } | null }>> {
  const p = execSchema.safeParse(raw);
  if (!p.success) return { ok: false, error: "Some values are not valid." };
  if (p.data.phrase !== "ERASE") return { ok: false, error: "Type ERASE to confirm." };
  const actor = await db.user.findUnique({ where: { id: actorId }, select: { role: true, status: true } });
  if (!actor || actor.status !== "ACTIVE" || !can(actor.role, "privacy.erase")) return { ok: false, error: "You are not allowed to carry out deletions." };
  if (!session.reauthAt || now.getTime() - session.reauthAt.getTime() > REAUTH_MINUTES * 60_000) return { ok: false, error: "Confirm your identity again (password, and two-step code) before carrying out a deletion." };
  const req = await db.privacyRequest.findUnique({ where: { id: p.data.id } });
  if (!req || req.kind !== "DELETION") return { ok: false, error: "Request not found." };
  if (req.status !== "APPROVED_FOR_DELETION") return { ok: false, error: "Only a request marked “Approved for deletion” can be carried out." };
  if (!req.userId) return { ok: false, error: "This request is no longer linked to an account." };
  const userId = req.userId;
  if (userId === actorId) return { ok: false, error: "Nobody can erase their own account here." };
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, email: true, name: true, role: true, erasedAt: true, emailVerifiedAt: true } });
  if (!user || user.erasedAt) return { ok: false, error: "The account was already erased." };
  if (user.role !== "MEMBER") return { ok: false, error: "This is a staff account. Only the owner can change its role to member first; staff accounts are not erased here." };
  if (req.legalHold) return { ok: false, error: "A legal hold is set on this request. The owner must clear it first." };
  const exceptions = await deletionExceptions(userId, req);
  if (exceptions.length && actor.role !== "OWNER") return { ok: false, error: `This request needs the owner: ${exceptions.join(" ")}` };
  const choices: ErasureChoices = { removeIdeas: req.removeIdeas, removeComments: req.removeComments, removeChat: req.removeChat };
  const retainApplicant = (await db.compensationAgreement.count({ where: { assignment: { participant: { applicant: { userId } } } } })) > 0;
  // Moves to PROCESSING first, so that two clicks or two people cannot run it twice.
  // The claim also requires that no legal hold was set in the meantime (the hold is set only outside PROCESSING).
  const claimed = await db.privacyRequest.updateMany({ where: { id: req.id, status: "APPROVED_FOR_DELETION", legalHold: false }, data: { status: "PROCESSING", handledById: actorId, handledAt: now } });
  if (!claimed.count) return { ok: false, error: "This request is already being processed, or a legal hold was just set." };
  // The erasure ledger first: if it cannot be written, nothing is changed (restores must be able to re-apply it).
  const e = env();
  try {
    appendLedger(path.resolve(e.LEDGER_DIR), ledgerKey({ BACKUP_ENCRYPTION_KEY: e.BACKUP_ENCRYPTION_KEY, ENCRYPTION_KEY: e.ENCRYPTION_KEY }), {
      userId,
      requestId: req.id,
      at: now.toISOString(),
      op: ERASURE_OP_VERSION,
      choices,
      retainApplicant,
    });
  } catch (err) {
    await db.privacyRequest.update({ where: { id: req.id }, data: { status: "APPROVED_FOR_DELETION" } });
    await db.auditLog.create({ data: { actorId, action: "privacy.erasure_refused", entityType: "PrivacyRequest", entityId: req.id, metadata: { reason: "erasure ledger not writable" } } });
    return { ok: false, error: `The erasure record could not be written, so nothing was deleted: ${(err as Error).message}` };
  }
  await db.auditLog.create({ data: { actorId, action: "privacy.erasure_started", entityType: "PrivacyRequest", entityId: req.id, metadata: { ...choices, retainApplicant, ledger: ERASURE_OP_VERSION } } });

  let photoKeys: string[] = [];
  let outcome: Awaited<ReturnType<typeof eraseAccountData>>["counts"];
  try {
    // Signing in is closed at once (the account is anonymized below, in one transaction).
    await db.user.update({ where: { id: userId }, data: { status: "DEACTIVATED" } });
    // Steps with their own locking and notices first: leaving groups (coordinator succession, chat lines)
    // and ending sessions (live connections are closed).
    const { leaveAllGroups } = await import("@/server/community/groups");
    await leaveAllGroups(userId);
    await revokeUserSessions(userId);
    await publishRealtime(db, { t: "user.revoked", userId });
    outcome = await db.$transaction(async (tx) => {
      // Re-checked here: the role may have changed since the checks above.
      const current = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { role: true } });
      if (current.role !== "MEMBER") throw new Error("The account became a staff account; it is not erased here.");
      const r = await eraseAccountData(tx, userId, { ...choices, retainApplicant, now });
      photoKeys = r.photoKeys;
      await tx.privacyRequest.update({
        where: { id: req.id },
        data: { status: "COMPLETED", completedAt: now, outcome: r.counts as Prisma.InputJsonValue, response: req.response ?? "Your account and personal data were deleted as described in the completion notice." },
      });
      await tx.auditLog.create({ data: { actorId, action: "privacy.erasure_completed", entityType: "PrivacyRequest", entityId: req.id, metadata: r.counts } });
      return r.counts;
    });
  } catch (err) {
    // Not completed: the request can be carried out again (every step is safe to repeat; the ledger entry
    // stays, and a restore re-applies it). The account stays closed for sign-in.
    await db.privacyRequest.update({ where: { id: req.id }, data: { status: "APPROVED_FOR_DELETION" } }).catch(() => {});
    await db.auditLog.create({ data: { actorId, action: "privacy.erasure_failed", entityType: "PrivacyRequest", entityId: req.id, metadata: { error: (err as Error).message.slice(0, 300) } } }).catch(() => {});
    return { ok: false, error: `The deletion was not completed: ${(err as Error).message} The account is closed for sign-in; carry the deletion out again once the cause is fixed.` };
  }
  const { deleteStoredFile } = await import("@/server/community/files");
  for (const storageKey of photoKeys) await deleteStoredFile({ storageKey }).catch(() => {});
  const { reevaluateIdeas } = await import("@/server/community/ideas");
  await reevaluateIdeas(userId).catch(() => {});

  // The notice goes to the address that was confirmed on the account (captured before anonymization).
  let email: { status: string; deliveryId: string } | null = null;
  if (user.emailVerifiedAt) {
    const removedList = [outcome.ideasRemoved ? "your ideas without a group" : "", outcome.commentsRemoved || outcome.discussionsRemoved ? "your comments and discussions" : "", outcome.chatMessagesRemoved ? "your chat messages" : ""].filter(Boolean);
    const b = brand();
    const res = await deliverTemplate(
      "account_deletion_completed",
      user.email,
      {
        name: user.name,
        orgName: b.name,
        completedAt: now.toISOString().replace("T", " ").slice(0, 16),
        removedContent: removedList.length ? `As you asked, also removed: ${removedList.join(", ")} (hidden now, permanently deleted by the regular clean-up).` : "",
        retainedNote:
          "records other members rely on or that show what was agreed: contributions in shared group areas (shown as by a former member, without your name), project agreements you accepted (their text names the participants and cannot change), the record of the policies you accepted, this request, and the log of administrative actions." +
          (outcome.applicantAnonymized ? " Your application was deleted; an anonymous record linked to earlier project compensation records is kept as contractual evidence." : ""),
        backupNote: backupNote(),
        contactEmail: b.contactEmail || "the contact page",
      },
      { userId },
    );
    email = { status: res.status, deliveryId: res.deliveryId };
    await db.privacyRequest.update({ where: { id: req.id }, data: { completionEmailId: res.deliveryId } });
    await db.auditLog.create({ data: { actorId, action: "privacy.erasure_notice", entityType: "PrivacyRequest", entityId: req.id, metadata: { emailStatus: res.status, deliveryId: res.deliveryId } } });
  }
  return { ok: true, email };
}

/** The owner sets or clears a legal hold (no deletion while it is set). */
export async function setLegalHold(ownerId: string, id: string, hold: boolean, reason: string): Promise<Result> {
  const owner = await db.user.findUnique({ where: { id: ownerId }, select: { role: true } });
  if (owner?.role !== "OWNER") return { ok: false, error: "Only the owner can set or clear a legal hold." };
  if (hold && reason.trim().length < 5) return { ok: false, error: "Give the reason for the legal hold." };
  const req = await db.privacyRequest.findUnique({ where: { id } });
  if (!req || req.status === "COMPLETED" || req.status === "PROCESSING") return { ok: false, error: "This request cannot be changed." };
  const changed = await db.privacyRequest.updateMany({ where: { id, status: { notIn: ["COMPLETED", "PROCESSING"] } }, data: { legalHold: hold, legalHoldReason: hold ? reason.trim().slice(0, 500) : null } });
  if (!changed.count) return { ok: false, error: "This request cannot be changed." };
  await db.auditLog.create({ data: { actorId: ownerId, action: hold ? "privacy.legal_hold_set" : "privacy.legal_hold_cleared", entityType: "PrivacyRequest", entityId: id, metadata: { reason: hold ? reason.trim().slice(0, 500) : null } } });
  return { ok: true };
}

/** Status changes for any privacy request, with a notice to the member (in the app, when they have community access). */
const statusSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["OPEN", "VERIFICATION_REQUIRED", "IN_PROGRESS", "INFO_REQUIRED", "APPROVED_FOR_DELETION", "COMPLETED", "REJECTED"]),
  response: z.string().trim().max(2000).default(""),
  adminNotes: z.string().trim().max(4000).optional(),
});

export async function updatePrivacyRequest(actorId: string, raw: unknown, now = new Date()): Promise<Result> {
  const p = statusSchema.safeParse(raw);
  if (!p.success) return { ok: false, error: "Some values are not valid." };
  const actor = await db.user.findUnique({ where: { id: actorId }, select: { role: true } });
  if (!actor || !can(actor.role, "privacy.requests")) return { ok: false, error: "You are not allowed to handle privacy requests." };
  const req = await db.privacyRequest.findUnique({ where: { id: p.data.id } });
  if (!req) return { ok: false, error: "Request not found." };
  if (req.status === "COMPLETED" || req.status === "PROCESSING") return { ok: false, error: "This request is finished or being processed; it cannot be changed." };
  // Deletion requests with a legal hold or an exception (staff account, compensation records, open dispute)
  // are decided by the owner only.
  if (req.kind === "DELETION" && actor.role !== "OWNER" && (req.legalHold || (req.userId && (await deletionExceptions(req.userId, req)).length)))
    return { ok: false, error: "This deletion request needs the owner (legal hold or an exception); administrators cannot change it." };
  const s = p.data.status;
  if (req.kind === "DELETION" && s === "COMPLETED") return { ok: false, error: "A deletion request is completed only by carrying out the deletion." };
  if (req.kind !== "DELETION" && s === "APPROVED_FOR_DELETION") return { ok: false, error: "Only deletion requests can be approved for deletion." };
  if ((s === "COMPLETED" || s === "REJECTED" || s === "INFO_REQUIRED" || s === "VERIFICATION_REQUIRED") && p.data.response.length < 5)
    return { ok: false, error: "Write a message to the member (what was done, why it is refused, or what is needed)." };
  await db.privacyRequest.update({
    where: { id: req.id },
    data: { status: s, ...(p.data.response ? { response: p.data.response } : {}), ...(p.data.adminNotes !== undefined ? { adminNotes: p.data.adminNotes || null } : {}), handledById: actorId, handledAt: now, ...(s === "COMPLETED" ? { completedAt: now } : {}) },
  });
  await db.auditLog.create({ data: { actorId, action: "privacy.request_updated", entityType: "PrivacyRequest", entityId: req.id, metadata: { from: req.status, to: s } } });
  if (req.userId && s !== req.status) await notify([req.userId], { type: "ADMIN_MESSAGE", title: "Your privacy request was updated", body: p.data.response || undefined, link: "/account/data" });
  return { ok: true };
}
