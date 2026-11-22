import "server-only";
import type { ApplicationStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { toCsv } from "@/lib/csv";
import { EXPERIENCE_LEVELS, WORK_CATEGORIES } from "@/lib/labels";

/**
 * Everything the organization holds about one member (data-access request).
 * Excludes: password hash, 2FA secrets, token hashes, other people's private
 * data, administrator notes (exported separately by admins on request).
 */
export async function exportUserData(userId: string) {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true, email: true, name: true, role: true, status: true, emailVerifiedAt: true, createdAt: true, lastLoginAt: true, totpEnabledAt: true,
      profile: { select: { displayName: true, headline: true, intro: true, location: true, timeZone: true, skills: true, experience: true, interests: true, hoursPerWeek: true, availability: true, categories: true, showLocation: true, showTimeZone: true, showHours: true, createdAt: true, updatedAt: true } },
      participant: { select: { id: true, applicantId: true, status: true, joinedAt: true, hoursPerWeek: true, preferredCategories: true } },
    },
  });
  const applicant = user.participant ? await exportApplicantCore(user.participant.applicantId, false) : null;
  const [ideas, comments, endorsements, memberships, messages, notifications, files, sessions, reports] = await Promise.all([
    db.businessIdea.findMany({ where: { authorId: userId }, omit: { authorId: true } }),
    db.comment.findMany({ where: { authorId: userId }, select: { id: true, ideaId: true, discussionId: true, body: true, createdAt: true, editedAt: true, deletedAt: true } }),
    db.ideaEndorsement.findMany({ where: { userId }, select: { ideaId: true, createdAt: true } }),
    db.groupMembership.findMany({ where: { userId }, select: { role: true, status: true, joinedAt: true, leftAt: true, group: { select: { name: true, slug: true } } } }),
    db.chatMessage.findMany({ where: { authorId: userId }, select: { id: true, body: true, createdAt: true, editedAt: true, deletedAt: true, channel: { select: { group: { select: { name: true } } } } } }),
    db.notification.findMany({ where: { userId }, select: { type: true, title: true, body: true, createdAt: true, readAt: true } }),
    db.storedFile.findMany({ where: { ownerId: userId }, select: { id: true, originalName: true, mimeType: true, size: true, scope: true, createdAt: true, deletedAt: true } }),
    db.session.findMany({ where: { userId }, select: { createdAt: true, lastSeenAt: true, expiresAt: true, revokedAt: true, userAgent: true } }),
    db.contentReport.findMany({ where: { reporterId: userId }, select: { targetType: true, reason: true, details: true, status: true, createdAt: true } }),
  ]);
  return {
    exportedAt: new Date().toISOString(),
    notice: "Deleted messages and comments are listed with their deletion date; their text is purged after the retention period.",
    account: user,
    application: applicant,
    ideas,
    endorsements,
    comments,
    groupMemberships: memberships,
    chatMessages: messages.map((m) => ({ ...m, body: m.deletedAt ? "(deleted)" : m.body })),
    notifications,
    files,
    sessions,
    reportsFiled: reports,
  };
}

async function exportApplicantCore(applicantId: string, includeAdminNotes: boolean) {
  return db.applicant.findUnique({
    where: { id: applicantId },
    include: {
      skills: { select: { kind: true, skill: { select: { label: true } } } },
      applications: {
        omit: { ipHash: true },
        include: {
          workPreferences: { select: { category: true } },
          availability: { select: { hoursPerWeek: true, schedule: true } },
          ...(includeAdminNotes ? { notes: { select: { body: true, createdAt: true } } } : {}),
        },
      },
    },
  });
}

/** Admin export for an applicant's access request (includes admin notes, which the person is entitled to). */
export async function exportApplicantData(applicantId: string) {
  const applicant = await exportApplicantCore(applicantId, true);
  if (!applicant) return null;
  const user = await db.user.findFirst({ where: { participant: { applicantId } }, select: { id: true } });
  return {
    exportedAt: new Date().toISOString(),
    applicant,
    memberAccount: user ? await exportUserData(user.id) : null,
  };
}

export async function applicationsCsv(filter: { status?: ApplicationStatus } = {}) {
  const where: Prisma.ApplicationWhereInput = filter.status ? { status: filter.status } : {};
  const rows = await db.application.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      applicant: { select: { fullName: true, email: true, country: true, region: true, timeZone: true, occupation: true } },
      workPreferences: { select: { category: true } },
      availability: { select: { hoursPerWeek: true, schedule: true } },
    },
  });
  return toCsv(
    ["Submitted", "Status", "Name", "Email", "Country", "Region", "Time zone", "Occupation", "Experience", "Interests", "Hours/week", "Schedule", "Willing to learn"],
    rows.map((r) => [
      r.createdAt,
      r.status,
      r.applicant.fullName,
      r.applicant.email,
      r.applicant.country,
      r.applicant.region,
      r.applicant.timeZone,
      r.applicant.occupation,
      r.experienceLevel ? EXPERIENCE_LEVELS[r.experienceLevel] : "",
      r.workPreferences.map((w) => WORK_CATEGORIES[w.category]).join("; "),
      r.availability?.hoursPerWeek,
      r.availability?.schedule,
      r.willingToLearn ? "yes" : "no",
    ]),
  );
}
