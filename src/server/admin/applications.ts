import { accessState, grantAcceptedMembership, type AccessState } from "../membership-grant";
import "server-only";
import type { ApplicationStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { siteUrl } from "@/lib/env";
import { brand } from "@/config/brand";
import { deliverTemplate, type SendResult } from "@/lib/email";
import type { TemplateKey } from "@/lib/email/templates";
import type { ApplicationFilters } from "@/lib/validation/admin";

export const PAGE_SIZE = 25;

export function buildApplicationWhere(f: ApplicationFilters): Prisma.ApplicationWhereInput {
  const and: Prisma.ApplicationWhereInput[] = [];
  // Unfinished drafts are the applicant's private work: administrators only see submitted applications.
  and.push(f.status && f.status !== "DRAFT" ? { status: f.status } : { status: { not: "DRAFT" } });
  if (f.experience) and.push({ experienceLevel: f.experience });
  if (f.category) and.push({ workPreferences: { some: { category: f.category } } });
  if (f.minHours) and.push({ availability: { hoursPerWeek: { gte: f.minHours } } });
  if (f.skill) {
    and.push({
      applicant: { skills: { some: { skill: { name: { contains: f.skill.toLowerCase() } } } } },
    });
  }
  if (f.q) {
    and.push({
      OR: [
        { applicant: { fullName: { contains: f.q, mode: "insensitive" } } },
        { applicant: { email: { contains: f.q, mode: "insensitive" } } },
        { applicant: { country: { contains: f.q, mode: "insensitive" } } },
      ],
    });
  }
  return { AND: and };
}

export async function listApplications(f: ApplicationFilters) {
  const where = buildApplicationWhere(f);
  const page = f.page ?? 1;
  const [total, rows] = await Promise.all([
    db.application.count({ where }),
    db.application.findMany({
      where,
      orderBy: [{ submittedAt: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        status: true,
        experienceLevel: true,
        createdAt: true,
        submittedAt: true,
        applicant: {
          select: {
            fullName: true,
            email: true,
            country: true,
            user: { select: { emailVerifiedAt: true, membershipStatus: true } },
            skills: { where: { kind: "PRIMARY" }, select: { skill: { select: { label: true } } }, take: 4 },
          },
        },
        availability: { select: { hoursPerWeek: true } },
        workPreferences: { select: { category: true } },
      },
    }),
  ]);
  return { total, rows, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export async function getApplication(id: string) {
  return db.application.findUnique({
    where: { id },
    include: {
      applicant: {
        include: {
          skills: { include: { skill: true } },
          participant: { select: { id: true } },
          user: { select: { id: true, email: true, name: true, status: true, emailVerifiedAt: true, membershipStatus: true, membershipChangedAt: true, lastLoginAt: true } },
        },
      },
      availability: true,
      workPreferences: true,
      notes: { orderBy: { createdAt: "desc" }, include: { author: { select: { name: true } } } },
    },
  });
}

/**
 * Allowed changes made by administrators. Drafts and withdrawals belong to
 * the applicant; an accepted application is final here (community access is
 * then managed on the member's page: suspend, restore or revoke).
 */
export const ADMIN_TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  DRAFT: [],
  SUBMITTED: ["UNDER_REVIEW", "INTERVIEW_REQUESTED", "WAITLISTED", "ACCEPTED", "DECLINED"],
  UNDER_REVIEW: ["INTERVIEW_REQUESTED", "WAITLISTED", "ACCEPTED", "DECLINED"],
  INTERVIEW_REQUESTED: ["UNDER_REVIEW", "WAITLISTED", "ACCEPTED", "DECLINED"],
  WAITLISTED: ["UNDER_REVIEW", "INTERVIEW_REQUESTED", "ACCEPTED", "DECLINED"],
  DECLINED: ["UNDER_REVIEW"],
  ACCEPTED: [],
  WITHDRAWN: [],
};

const REOPEN_BLOCKED = "This applicant has already started a new application, so the declined one cannot be re-opened. Review the new application instead.";

/** True when the applicant has another application that is still open (a person may only have one). */
export async function hasOtherOpenApplication(applicantId: string, exceptId: string, tx: Prisma.TransactionClient = db): Promise<boolean> {
  const other = await tx.application.findFirst({ where: { applicantId, id: { not: exceptId }, status: { notIn: ["DECLINED", "WITHDRAWN"] } }, select: { id: true } });
  return Boolean(other);
}

/** The email that matches a decision (sent only when the administrator asks for it). */
export const STATUS_EMAIL: Partial<Record<ApplicationStatus, TemplateKey>> = {
  INTERVIEW_REQUESTED: "interview_invitation",
  WAITLISTED: "application_waitlisted",
  DECLINED: "application_declined",
  ACCEPTED: "application_accepted",
};

export type StatusChangeResult =
  | {
      ok: true;
      status: ApplicationStatus;
      /** granted = account now has community access; pending_account = applicant has no confirmed account yet. */
      membership: "granted" | "already" | "pending_account" | "not_applicable";
      /** The person's real situation after the change (used for what the administrator is told). */
      access: AccessState;
      email: SendResult | null;
    }
  | { ok: false; error: string };

/**
 * Changes an application's status in ONE transaction. Accepting it also
 * grants membership to the linked, verified account (participant record,
 * member profile, membership ACTIVE), so the person can enter the community
 * with the email and password they already have. The notification email is
 * sent only after the change is saved: an email failure never undoes the
 * decision and is reported separately.
 */
export async function updateApplicationStatus(
  adminId: string,
  id: string,
  to: ApplicationStatus,
  opts: { notify?: boolean; interviewDetails?: string | null; details?: string } = {},
): Promise<StatusChangeResult> {
  const outcome = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Application" WHERE id = ${id} FOR UPDATE`;
    const app = await tx.application.findUnique({
      where: { id },
      include: {
        availability: true,
        workPreferences: true,
        applicant: { include: { participant: true, skills: { include: { skill: true } }, user: true } },
      },
    });
    if (!app) return { ok: false as const, error: "Application not found." };
    if (app.status === to && to === "ACCEPTED") {
      // Approving again: nothing about the application changes, but if the person could not be
      // given access the first time (account suspended, email unconfirmed...) and now can, they get it.
      const linked = app.applicant.user;
      const grantedNow = linked ? await grantAcceptedMembership(tx, linked.id, { byAdminId: adminId, reason: "approved again" }) : false;
      const now = grantedNow ? await tx.user.findUnique({ where: { id: linked!.id } }) : linked;
      return { ok: true as const, from: app.status, membership: grantedNow ? ("granted_now" as const) : ("already" as const), access: accessState(now), app };
    }
    if (!ADMIN_TRANSITIONS[app.status].includes(to))
      return { ok: false as const, error: `An application that is “${app.status.replace(/_/g, " ").toLowerCase()}” cannot be changed to “${to.replace(/_/g, " ").toLowerCase()}”.` };
    // Re-opening a declined application would give the person two open applications.
    if (app.status === "DECLINED" && (await hasOtherOpenApplication(app.applicantId, id, tx))) return { ok: false as const, error: REOPEN_BLOCKED };
    const now = new Date();
    await tx.application.update({
      where: { id },
      data: {
        status: to,
        statusChangedAt: now,
        reviewedAt: now,
        ...(to === "ACCEPTED" || to === "DECLINED" ? { decidedAt: now, decidedById: adminId } : {}),
        ...(to === "INTERVIEW_REQUESTED" && opts.interviewDetails !== undefined ? { interviewDetails: opts.interviewDetails } : {}),
      },
    });
    let membership: "granted" | "granted_now" | "already" | "pending_account" | "not_applicable" = "not_applicable";
    if (to === "ACCEPTED") {
      const participant =
        app.applicant.participant ??
        (await tx.participant.create({
          data: {
            applicantId: app.applicantId,
            applicationId: app.id,
            hoursPerWeek: app.availability?.hoursPerWeek ?? null,
            availabilityNotes: app.availability?.schedule ?? null,
            preferredCategories: app.workPreferences.map((w) => w.category),
            skillsSummary: app.applicant.skills.map((sk) => sk.skill.label).join(", ") || null,
          },
        }));
      const user = app.applicant.user;
      if (user && user.emailVerifiedAt && user.status === "ACTIVE") {
        const participantTaken = await tx.user.findFirst({ where: { participantId: participant.id, NOT: { id: user.id } }, select: { id: true } });
        membership = user.membershipStatus === "ACTIVE" ? "already" : "granted";
        await tx.user.update({
          where: { id: user.id },
          data: {
            membershipStatus: "ACTIVE",
            membershipChangedAt: now,
            membershipChangedById: adminId,
            ...(!user.participantId && !participantTaken ? { participantId: participant.id } : {}),
          },
        });
        await tx.memberProfile.upsert({ where: { userId: user.id }, create: { userId: user.id, displayName: user.name.slice(0, 60) }, update: {} });
      } else {
        membership = "pending_account";
      }
    }
    const after = to === "ACCEPTED" && app.applicant.user ? await tx.user.findUnique({ where: { id: app.applicant.user.id } }) : app.applicant.user;
    return { ok: true as const, from: app.status, membership, access: accessState(after), app };
  });
  if (!outcome.ok) return outcome;
  const { app, from, membership, access } = outcome;
  if (from !== to) await audit(adminId, "application.status_changed", "Application", id, { from, to });
  if (membership === "granted") await audit(adminId, "membership.granted", "User", app.applicant.user!.id, { applicationId: id });

  let email: SendResult | null = null;
  const template = STATUS_EMAIL[to];
  if (opts.notify && template && from !== to) {
    const person = app.applicant.user ?? { email: app.applicant.email, name: app.applicant.fullName, id: null };
    const res = await deliverTemplate(
      template,
      person.email,
      {
        name: person.name,
        details: opts.details ?? (to === "INTERVIEW_REQUESTED" ? (opts.interviewDetails ?? "") : ""),
        contactEmail: brand().contactEmail || "",
        statusLink: siteUrl("/application"),
        communityLink: siteUrl(membership === "pending_account" ? "/join" : "/community"),
      },
      { sentById: adminId, applicationId: id, userId: person.id },
    );
    email = res;
    await audit(adminId, "application.notified", "Application", id, { template, emailStatus: res.status });
  }
  return { ok: true, status: to, membership: membership === "granted_now" ? "granted" : membership, access, email };
}

/** For applications made before accounts existed: ask the person to create their account. */
export async function requestAccountCreation(adminId: string, applicationId: string): Promise<{ ok: true; email: SendResult } | { ok: false; error: string }> {
  const app = await db.application.findUnique({ where: { id: applicationId }, include: { applicant: true } });
  if (!app) return { ok: false, error: "Application not found." };
  if (app.applicant.userId) return { ok: false, error: "This applicant already has an account." };
  const email = await deliverTemplate("create_account_request", app.applicant.email, { name: app.applicant.fullName, joinLink: siteUrl("/join") }, { sentById: adminId, applicationId });
  await audit(adminId, "applicant.account_requested", "Application", applicationId, { emailStatus: email.status });
  return { ok: true, email };
}

export async function addApplicationNote(adminId: string, applicationId: string, body: string) {
  await db.applicationNote.create({ data: { applicationId, authorId: adminId, body } });
  await audit(adminId, "application.note_added", "Application", applicationId);
}

/**
 * Deletes an applicant and all their application data (privacy/erasure
 * request). Refuses if the person is an accepted participant — remove the
 * participant record first so project history is handled deliberately.
 */
export async function deleteApplicantData(adminId: string, applicationId: string): Promise<{ ok: boolean; error?: string }> {
  const app = await db.application.findUnique({
    where: { id: applicationId },
    select: { applicantId: true, applicant: { select: { participant: { select: { id: true } } } } },
  });
  if (!app) return { ok: false, error: "Application not found" };
  if (app.applicant.participant) {
    return { ok: false, error: "This person is a participant. Remove the participant record first." };
  }
  await db.applicant.delete({ where: { id: app.applicantId } });
  await audit(adminId, "applicant.deleted", "Applicant", app.applicantId);
  return { ok: true };
}

export async function getOverviewStats() {
  const [total, byStatus, participants, activeProjects, completedProjects, openInquiries] = await Promise.all([
    db.application.count({ where: { status: { not: "DRAFT" } } }),
    db.application.groupBy({ by: ["status"], _count: { _all: true } }),
    db.participant.count({ where: { status: "ACTIVE" } }),
    db.project.count({ where: { status: "ACTIVE" } }),
    db.project.count({ where: { status: "COMPLETED" } }),
    db.contactInquiry.count({ where: { status: "OPEN" } }),
  ]);
  const count = (s: ApplicationStatus) => byStatus.find((b) => b.status === s)?._count._all ?? 0;
  return {
    total,
    new: count("SUBMITTED"),
    underReview: count("UNDER_REVIEW"),
    interview: count("INTERVIEW_REQUESTED"),
    accepted: count("ACCEPTED"),
    activeParticipants: participants,
    activeProjects,
    completedProjects,
    openInquiries,
  };
}
