/**
 * The erasure of one account's personal data, as Privacy Policy version 2 (section 7) describes it.
 * Framework-free: used by the owner/administrator action (src/server/privacy-deletion.ts) and by the
 * restore replay (src/ops/erasure-ledger.ts), so a restored backup gets exactly the same treatment.
 *
 * Deleted: sessions, sign-in links, recovery codes, profile and profile photo, notifications and
 * preferences, chat read markers, meeting attendance, the application (unless it is linked to earlier
 * project records with compensation, where only what is necessary is kept: see `retainApplicant`).
 * Anonymized: the account row (kept as a placeholder so shared records keep valid links).
 * Ended: group memberships. Removed as the member chose: ideas without a group, comments and
 * discussions, chat messages (hidden now; permanently deleted by the regular clean-up).
 * Kept (shared or evidence): research notes, tasks, decisions, links, group files, ideas that formed a
 * group, project agreements, acceptance records, privacy requests, reports, audit log, email log.
 */
import type { Prisma } from "@prisma/client";

export const ERASURE_OP_VERSION = "erasure/1";
export const ERASED_NAME = "Erased account";
export const erasedEmail = (userId: string) => `erased-${userId}@erased.invalid`;

export type ErasureChoices = { removeIdeas: boolean; removeComments: boolean; removeChat: boolean };
export type ErasureOptions = ErasureChoices & { retainApplicant: boolean; now: Date };

/** Applies the erasure inside a transaction. Idempotent: a second run finds nothing more to do. */
export async function eraseAccountData(tx: Prisma.TransactionClient, userId: string, o: ErasureOptions) {
  const counts: Record<string, number> = {};
  const photoKeys: string[] = [];
  counts.sessions = (await tx.session.deleteMany({ where: { userId } })).count;
  counts.tokens = (await tx.accountToken.deleteMany({ where: { userId } })).count;
  counts.recoveryCodes = (await tx.recoveryCode.deleteMany({ where: { userId } })).count;
  // The automatic lines in group chats ("<name> joined the group", "... left the group", coordinator changes)
  // contain the display name as text: in the chats of the person's groups it is replaced by "a former
  // member" (the same neutral attribution as everywhere else). Done before the profile is deleted.
  const profileName = (await tx.memberProfile.findUnique({ where: { userId }, select: { displayName: true } }))?.displayName?.trim();
  counts.systemLinesNeutralized = 0;
  if (profileName && profileName.length >= 2) {
    const groupIds = (await tx.groupMembership.findMany({ where: { userId }, select: { groupId: true } })).map((m) => m.groupId);
    if (groupIds.length) {
      counts.systemLinesNeutralized = await tx.$executeRaw`
        UPDATE "ChatMessage" SET body = replace(body, ${profileName}, 'a former member')
        WHERE kind = 'SYSTEM' AND strpos(body, ${profileName}) > 0
          AND "channelId" IN (SELECT id FROM "GroupChannel" WHERE "groupId" = ANY(${groupIds}))`;
      await tx.$executeRaw`
        UPDATE "ChatMessage" SET body = 'A' || substr(body, 2)
        WHERE kind = 'SYSTEM' AND body LIKE 'a former member%'
          AND "channelId" IN (SELECT id FROM "GroupChannel" WHERE "groupId" = ANY(${groupIds}))`;
    }
  }
  const photos = await tx.storedFile.findMany({ where: { ownerId: userId, scope: "PROFILE_PHOTO" }, select: { id: true, storageKey: true } });
  photoKeys.push(...photos.map((f) => f.storageKey));
  counts.profile = (await tx.memberProfile.deleteMany({ where: { userId } })).count;
  counts.profilePhotos = (await tx.storedFile.deleteMany({ where: { id: { in: photos.map((f) => f.id) } } })).count;
  counts.notifications = (await tx.notification.deleteMany({ where: { userId } })).count;
  counts.notificationPreferences = (await tx.notificationPreference.deleteMany({ where: { userId } })).count;
  counts.chatReadMarkers = (await tx.channelReadState.deleteMany({ where: { userId } })).count;
  counts.meetingAttendance = (await tx.meetingAttendance.deleteMany({ where: { userId } })).count;
  counts.groupMembershipsEnded = (await tx.groupMembership.updateMany({ where: { userId, status: "ACTIVE" }, data: { status: "LEFT", leftAt: o.now, role: "MEMBER" } })).count;
  if (o.retainApplicant) {
    // Only what is necessary for the earlier project records: the applicant row stays as an anonymous
    // anchor for the participant record and its compensation records; the applications themselves go.
    const a = await tx.applicant.findFirst({ where: { userId }, select: { id: true } });
    if (a) {
      counts.applications = (await tx.application.deleteMany({ where: { applicantId: a.id } })).count;
      await tx.applicantSkill.deleteMany({ where: { applicantId: a.id } });
      await tx.applicant.update({
        where: { id: a.id },
        data: { fullName: ERASED_NAME, email: erasedEmail(userId), country: null, region: null, timeZone: null, occupation: null, education: null, profileUrl: null },
      });
      counts.applicantAnonymized = 1;
    }
  } else {
    counts.applicant = (await tx.applicant.deleteMany({ where: { userId } })).count;
  }
  if (o.removeIdeas) counts.ideasRemoved = (await tx.businessIdea.updateMany({ where: { authorId: userId, group: null, status: { not: "REMOVED" } }, data: { status: "REMOVED", removedAt: o.now } })).count;
  if (o.removeComments) {
    counts.commentsRemoved = (await tx.comment.updateMany({ where: { authorId: userId, deletedAt: null }, data: { deletedAt: o.now } })).count;
    counts.discussionsRemoved = (await tx.groupDiscussion.updateMany({ where: { authorId: userId, deletedAt: null }, data: { deletedAt: o.now } })).count;
  }
  if (o.removeChat) {
    const msgs = await tx.chatMessage.findMany({ where: { authorId: userId, deletedAt: null, kind: "USER" }, select: { id: true } });
    counts.chatMessagesRemoved = (await tx.chatMessage.updateMany({ where: { id: { in: msgs.map((m) => m.id) } }, data: { deletedAt: o.now } })).count;
    await tx.storedFile.updateMany({ where: { messageId: { in: msgs.map((m) => m.id) }, deletedAt: null }, data: { deletedAt: o.now } });
  }
  await tx.user.update({
    where: { id: userId },
    data: {
      email: erasedEmail(userId),
      name: ERASED_NAME,
      passwordHash: null,
      totpSecretEnc: null,
      totpPendingEnc: null,
      totpEnabledAt: null,
      status: "DEACTIVATED",
      membershipStatus: "REVOKED",
      erasedAt: o.now,
    },
  });
  return { counts, photoKeys };
}

/** After an erasure (or its replay): the account cannot sign in and holds none of the deleted data. */
export async function verifyErased(tx: Prisma.TransactionClient, userId: string, choices: ErasureChoices): Promise<string[]> {
  const problems: string[] = [];
  const u = await tx.user.findUnique({ where: { id: userId }, select: { email: true, name: true, passwordHash: true, totpSecretEnc: true, erasedAt: true, status: true } });
  if (!u) return problems; // the row does not exist in this database at all
  if (!u.erasedAt || u.passwordHash || u.totpSecretEnc || u.status !== "DEACTIVATED" || u.email !== erasedEmail(userId) || u.name !== ERASED_NAME) problems.push("account not anonymized");
  if (await tx.session.count({ where: { userId } })) problems.push("sessions remain");
  if (await tx.memberProfile.count({ where: { userId } })) problems.push("profile remains");
  if (await tx.notification.count({ where: { userId } })) problems.push("notifications remain");
  if (await tx.groupMembership.count({ where: { userId, status: "ACTIVE" } })) problems.push("active group memberships remain");
  if (choices.removeChat && (await tx.chatMessage.count({ where: { authorId: userId, deletedAt: null, kind: "USER" } }))) problems.push("chat messages remain");
  if (choices.removeComments && (await tx.comment.count({ where: { authorId: userId, deletedAt: null } }))) problems.push("comments remain");
  if (choices.removeIdeas && (await tx.businessIdea.count({ where: { authorId: userId, group: null, status: { not: "REMOVED" } } }))) problems.push("ideas remain");
  return problems;
}
