import "server-only";
import { grantAcceptedMembership } from "./membership-grant";
import { Prisma, type ApplicationStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { env, siteUrl } from "@/lib/env";
import { logger } from "@/lib/logger";
import { deliverTemplate } from "@/lib/email";
import { EXPERIENCE_LEVELS, WORK_CATEGORIES } from "@/lib/labels";
import {
  PRIVACY_NOTICE_VERSION,
  parseSkillList,
  stepAboutSchema,
  stepMotivationSchema,
  stepSkillsSchema,
  submitConfirmSchema,
} from "@/lib/validation/application";
import { upsertSkills } from "./skills";

type FieldErrors = Record<string, string[] | undefined>;
export type StepResult = { ok: true; nextStep: number } | { ok: false; error?: string; fieldErrors?: FieldErrors; redirectTo?: string };

/** Statuses in which the applicant can still change or withdraw their application. */
export const OPEN_STATUSES: ApplicationStatus[] = ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "INTERVIEW_REQUESTED", "WAITLISTED"];

const appInclude = {
  availability: true,
  workPreferences: true,
  applicant: { include: { skills: { include: { skill: true } } } },
} satisfies Prisma.ApplicationInclude;

/** The signed-in person's most recent application (or null). */
export async function getMyApplication(userId: string) {
  return db.application.findFirst({ where: { applicant: { userId } }, orderBy: { createdAt: "desc" }, include: appInclude });
}

/** Finds or creates the applicant record and the DRAFT application for this account. */
async function ensureDraft(tx: Prisma.TransactionClient, userId: string) {
  const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.emailVerifiedAt) throw new Error("UNVERIFIED");
  let applicant = await tx.applicant.findUnique({ where: { userId } });
  if (!applicant) {
    // An older, unlinked applicant record with this (verified) address is reused rather than duplicated.
    const legacy = await tx.applicant.findFirst({ where: { email: user.email, userId: null } });
    applicant = legacy
      ? await tx.applicant.update({ where: { id: legacy.id }, data: { userId } })
      : await tx.applicant.create({ data: { userId, email: user.email, fullName: user.name } });
    // The earlier application may already have been accepted: then the person gets access now.
    if (legacy) await grantAcceptedMembership(tx, userId, { reason: "earlier application linked" });
  }
  const latest = await tx.application.findFirst({ where: { applicantId: applicant.id }, orderBy: { createdAt: "desc" } });
  if (latest && latest.status === "DRAFT") return { applicant, app: latest };
  if (latest && latest.status !== "DECLINED" && latest.status !== "WITHDRAWN") return { applicant, app: latest };
  const app = await tx.application.create({ data: { applicantId: applicant.id, status: "DRAFT" } });
  return { applicant, app };
}

/**
 * Saves one step of the application as a draft. Each step is validated on
 * the server; the applicant can stop at any time and continue later.
 */
export async function saveApplicationStep(userId: string, step: number, raw: Record<string, unknown>): Promise<StepResult> {
  const schema = step === 1 ? stepAboutSchema : step === 2 ? stepSkillsSchema : step === 3 ? stepMotivationSchema : null;
  if (!schema) return { ok: false, error: "Unknown step." };
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Please check the highlighted answers.", fieldErrors: parsed.error.flatten().fieldErrors };
  const d = parsed.data as Record<string, unknown>;

  try {
    return await db.$transaction(async (tx) => {
      const { applicant, app } = await ensureDraft(tx, userId);
      if (app.status !== "DRAFT") return { ok: false, redirectTo: "/application", error: "Your application was already submitted." };
      const nextStep = Math.max(app.draftStep, Math.min(step + 1, 3));
      if (step === 1) {
        await tx.applicant.update({
          where: { id: applicant.id },
          data: {
            country: d.country as string,
            region: (d.region as string) ?? null,
            occupation: d.occupation as string,
            education: (d.education as string) ?? null,
            profileUrl: (d.profileUrl as string) ?? null,
            ...(d.timeZone ? { timeZone: d.timeZone as string } : {}),
          },
        });
        await tx.application.update({
          where: { id: app.id },
          data: { experienceLevel: (d.experienceLevel as never) ?? null, relevantExperience: (d.relevantExperience as string) ?? null, draftStep: nextStep },
        });
      } else if (step === 2) {
        const primary = parseSkillList(d.mainSkills as string);
        const secondary = parseSkillList((d.secondarySkills as string) ?? "").filter((x) => !primary.some((p) => p.toLowerCase() === x.toLowerCase()));
        const primaryIds = await upsertSkills(tx, primary);
        const secondaryIds = await upsertSkills(tx, secondary);
        await tx.applicantSkill.deleteMany({ where: { applicantId: applicant.id } });
        await tx.applicantSkill.createMany({
          data: [
            ...primaryIds.map((skillId) => ({ applicantId: applicant.id, skillId, kind: "PRIMARY" as const })),
            ...secondaryIds.map((skillId) => ({ applicantId: applicant.id, skillId, kind: "SECONDARY" as const })),
          ],
          skipDuplicates: true,
        });
        await tx.workPreference.deleteMany({ where: { applicationId: app.id } });
        await tx.workPreference.createMany({ data: (d.workCategories as string[]).map((category) => ({ applicationId: app.id, category: category as never })) });
        await tx.availability.upsert({
          where: { applicationId: app.id },
          create: { applicationId: app.id, hoursPerWeek: d.hoursPerWeek as number, schedule: (d.schedule as string) ?? null },
          update: { hoursPerWeek: d.hoursPerWeek as number, schedule: (d.schedule as string) ?? null },
        });
        await tx.application.update({
          where: { id: app.id },
          data: { desiredWork: (d.desiredWork as string) ?? null, willingToLearn: d.willingToLearn as boolean, draftStep: nextStep },
        });
      } else {
        await tx.application.update({
          where: { id: app.id },
          data: { motivation: d.motivation as string, contribution: d.contribution as string, additionalComments: (d.additionalComments as string) ?? null, draftStep: nextStep },
        });
      }
      return { ok: true as const, nextStep };
    });
  } catch (err) {
    if ((err as Error).message === "UNVERIFIED") return { ok: false, redirectTo: "/verify-email", error: "Please confirm your email address first." };
    // Two tabs creating the first draft at once: the database keeps one; the user can simply save again.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return { ok: false, error: "Your draft was just saved in another window. Please save again." };
    throw err;
  }
}

/** Which required answers are still missing (for the review step). */
export function missingAnswers(app: NonNullable<Awaited<ReturnType<typeof getMyApplication>>>): string[] {
  const missing: string[] = [];
  if (!app.applicant.country || !app.applicant.occupation) missing.push("About you");
  if (!app.applicant.skills.some((s) => s.kind === "PRIMARY") || !app.workPreferences.length || !app.availability) missing.push("Skills and time");
  if (!app.motivation || !app.contribution) missing.push("Why you want to join");
  return missing;
}

export type SubmitResult = { ok: true; alreadySubmitted: boolean; applicationId: string } | { ok: false; error: string; fieldErrors?: FieldErrors };

/**
 * Submits the draft exactly once. The row is locked (SELECT ... FOR UPDATE),
 * so double clicks, refreshes and parallel requests cannot submit twice or
 * create a second application. Emails are sent AFTER the data is saved; an
 * email failure never loses the application.
 */
export async function submitMyApplication(userId: string, raw: Record<string, unknown>): Promise<SubmitResult> {
  const confirm = submitConfirmSchema.safeParse(raw);
  if (!confirm.success) return { ok: false, error: "Please confirm the statement to submit.", fieldErrors: confirm.error.flatten().fieldErrors };
  const outcome = await db.$transaction(async (tx) => {
    const app = await tx.application.findFirst({ where: { applicant: { userId } }, orderBy: { createdAt: "desc" }, select: { id: true } });
    if (!app) return { ok: false as const, error: "Please fill in the application first." };
    await tx.$queryRaw`SELECT id FROM "Application" WHERE id = ${app.id} FOR UPDATE`;
    const full = await tx.application.findUniqueOrThrow({ where: { id: app.id }, include: appInclude });
    if (full.status !== "DRAFT") return { ok: true as const, alreadySubmitted: true, applicationId: full.id };
    const missing = missingAnswers(full);
    if (missing.length) return { ok: false as const, error: `Please complete: ${missing.join(", ")}.` };
    const now = new Date();
    await tx.application.update({
      where: { id: full.id },
      data: { status: "SUBMITTED", submittedAt: now, statusChangedAt: now, privacyNoticeVersion: PRIVACY_NOTICE_VERSION, acknowledgedAt: now },
    });
    return { ok: true as const, alreadySubmitted: false, applicationId: full.id };
  });
  if (outcome.ok && !outcome.alreadySubmitted) {
    await audit(userId, "application.submitted", "Application", outcome.applicationId);
    await notifySubmitted(outcome.applicationId).catch((err) => logger.error("application.notify_failed", { err }));
  }
  return outcome;
}

async function notifySubmitted(applicationId: string) {
  const e = env();
  const app = await db.application.findUniqueOrThrow({
    where: { id: applicationId },
    select: { experienceLevel: true, workPreferences: true, applicant: { select: { fullName: true, email: true, user: { select: { email: true, name: true } } } } },
  });
  const updates: { adminNotifiedAt?: Date; confirmationSentAt?: Date } = {};
  if (e.ADMIN_NOTIFICATION_EMAIL) {
    const res = await deliverTemplate("admin_new_application", e.ADMIN_NOTIFICATION_EMAIL, {
      adminUrl: siteUrl(`/admin/applications/${applicationId}`),
      experience: app.experienceLevel ? EXPERIENCE_LEVELS[app.experienceLevel] : "Not given",
      categories: app.workPreferences.map((w) => WORK_CATEGORIES[w.category]).join(", "),
    });
    if (res.status === "sent") updates.adminNotifiedAt = new Date();
  }
  if (e.SEND_APPLICANT_CONFIRMATION) {
    const to = app.applicant.user?.email ?? app.applicant.email;
    const res = await deliverTemplate("application_received", to, { name: app.applicant.user?.name ?? app.applicant.fullName, statusLink: siteUrl("/application") }, { applicationId });
    if (res.status === "sent") updates.confirmationSentAt = new Date();
  }
  if (Object.keys(updates).length) await db.application.update({ where: { id: applicationId }, data: updates });
}

/** The applicant withdraws an application that has not been decided yet. */
export async function withdrawMyApplication(userId: string): Promise<{ ok: boolean; error?: string }> {
  const app = await db.application.findFirst({ where: { applicant: { userId } }, orderBy: { createdAt: "desc" } });
  if (!app || !OPEN_STATUSES.includes(app.status) || app.status === "DRAFT") return { ok: false, error: "There is no submitted application to withdraw." };
  const res = await db.application.updateMany({ where: { id: app.id, status: app.status }, data: { status: "WITHDRAWN", statusChangedAt: new Date() } });
  if (res.count !== 1) return { ok: false, error: "Your application changed meanwhile. Please reload the page." };
  await audit(userId, "application.withdrawn", "Application", app.id);
  return { ok: true };
}
