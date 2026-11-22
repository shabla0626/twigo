import "server-only";
import type { AgreementStatus, AssignmentStatus, MilestoneStatus, Prisma, ProjectStatus, WorkCategory } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { parseSkillList } from "@/lib/validation/application";
import { upsertSkills } from "../skills";

export type ProjectInput = {
  title: string;
  summary: string;
  description: string | null;
  category: WorkCategory | null;
  status: ProjectStatus;
  isPublished: boolean;
  publicSummary: string | null;
  startDate: Date | null;
  targetDate: Date | null;
};

export function slugify(s: string) {
  return (
    s
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/[\s_-]+/g, "-")
      .slice(0, 60) || "project"
  );
}

export async function uniqueSlug(tx: Prisma.TransactionClient, title: string) {
  const base = slugify(title);
  let slug = base;
  for (let i = 2; await tx.project.findUnique({ where: { slug }, select: { id: true } }); i++) slug = `${base}-${i}`;
  return slug;
}

export async function listProjects() {
  return db.project.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { assignments: true, roles: true } },
      milestones: { select: { status: true } },
    },
  });
}

export function progressOf(milestones: { status: MilestoneStatus }[]) {
  if (milestones.length === 0) return null;
  return Math.round((milestones.filter((m) => m.status === "DONE").length / milestones.length) * 100);
}

/** `withCompensation` must only be true for callers holding the compensation.view permission. */
export async function getProject(id: string, withCompensation = false) {
  return db.project.findUnique({
    where: { id },
    include: {
      roles: { orderBy: { createdAt: "asc" }, include: { skills: { include: { skill: true } } } },
      milestones: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      assignments: {
        orderBy: { createdAt: "asc" },
        include: {
          participant: { include: { applicant: { select: { fullName: true, email: true } } } },
          role: { select: { title: true } },
          compensation: withCompensation,
        },
      },
    },
  });
}

export async function createProject(adminId: string, input: ProjectInput) {
  const project = await db.$transaction(async (tx) =>
    tx.project.create({ data: { ...input, slug: await uniqueSlug(tx, input.title) } }),
  );
  await audit(adminId, "project.created", "Project", project.id);
  return project;
}

export async function updateProject(adminId: string, id: string, input: ProjectInput) {
  await db.project.update({ where: { id }, data: input });
  await audit(adminId, "project.updated", "Project", id, { status: input.status, isPublished: input.isPublished });
}

export async function deleteProject(adminId: string, id: string) {
  await db.project.delete({ where: { id } });
  await audit(adminId, "project.deleted", "Project", id);
}

export async function addRole(
  adminId: string,
  input: { projectId: string; title: string; responsibilities: string | null; openings: number; skills: string },
) {
  const role = await db.$transaction(async (tx) => {
    const r = await tx.projectRole.create({
      data: { projectId: input.projectId, title: input.title, responsibilities: input.responsibilities, openings: input.openings },
    });
    const ids = await upsertSkills(tx, parseSkillList(input.skills));
    if (ids.length) await tx.projectRoleSkill.createMany({ data: ids.map((skillId) => ({ roleId: r.id, skillId })) });
    return r;
  });
  await audit(adminId, "project.role_added", "Project", input.projectId, { roleId: role.id });
}

export async function deleteRole(adminId: string, roleId: string) {
  const role = await db.projectRole.delete({ where: { id: roleId } });
  await audit(adminId, "project.role_deleted", "Project", role.projectId, { roleId });
}

export async function addAssignment(
  adminId: string,
  input: { projectId: string; participantId: string; roleId: string | null; responsibilities: string | null },
): Promise<{ ok: boolean; error?: string }> {
  const exists = await db.projectAssignment.findUnique({
    where: { projectId_participantId: { projectId: input.projectId, participantId: input.participantId } },
  });
  if (exists) return { ok: false, error: "This participant is already assigned to the project." };
  if (input.roleId) {
    const role = await db.projectRole.findFirst({ where: { id: input.roleId, projectId: input.projectId } });
    if (!role) return { ok: false, error: "Role does not belong to this project." };
  }
  const a = await db.projectAssignment.create({ data: input });
  await audit(adminId, "project.participant_assigned", "Project", input.projectId, { assignmentId: a.id });
  return { ok: true };
}

export async function setAssignmentStatus(adminId: string, id: string, status: AssignmentStatus) {
  const a = await db.projectAssignment.update({ where: { id }, data: { status } });
  await audit(adminId, "project.assignment_status", "Project", a.projectId, { assignmentId: id, status });
  return a;
}

export async function addMilestone(adminId: string, input: { projectId: string; title: string; dueDate: Date | null }) {
  const count = await db.projectMilestone.count({ where: { projectId: input.projectId } });
  await db.projectMilestone.create({ data: { ...input, sortOrder: count } });
  await audit(adminId, "project.milestone_added", "Project", input.projectId);
}

export async function setMilestoneStatus(adminId: string, id: string, status: MilestoneStatus) {
  const m = await db.projectMilestone.update({
    where: { id },
    data: { status, completedAt: status === "DONE" ? new Date() : null },
  });
  await audit(adminId, "project.milestone_status", "Project", m.projectId, { milestoneId: id, status });
  return m;
}

export async function deleteMilestone(adminId: string, id: string) {
  const m = await db.projectMilestone.delete({ where: { id } });
  await audit(adminId, "project.milestone_deleted", "Project", m.projectId);
  return m;
}

/** PRIVATE compensation record for a single assignment. */
export async function saveCompensation(
  adminId: string,
  input: {
    assignmentId: string;
    terms: string;
    basis: string | null;
    amount: number | null;
    currency: string | null;
    status: AgreementStatus;
    documentRef: string | null;
  },
) {
  const prior = await db.compensationAgreement.findUnique({ where: { assignmentId: input.assignmentId } });
  const data = {
    terms: input.terms,
    basis: input.basis,
    amountMinor: input.amount,
    currency: input.currency,
    status: input.status,
    documentRef: input.documentRef,
    agreedAt: input.status === "AGREED" ? (prior?.agreedAt ?? new Date()) : (prior?.agreedAt ?? null),
  };
  const rec = await db.compensationAgreement.upsert({
    where: { assignmentId: input.assignmentId },
    create: { assignmentId: input.assignmentId, ...data },
    update: data,
    include: { assignment: { select: { projectId: true } } },
  });
  // Metadata intentionally excludes amounts and terms.
  await audit(adminId, "compensation.saved", "CompensationAgreement", rec.id, { status: input.status });
  return rec;
}

export async function assignableParticipants() {
  return db.participant.findMany({
    where: { status: "ACTIVE" },
    orderBy: { applicant: { fullName: "asc" } },
    select: { id: true, applicant: { select: { fullName: true } }, skillsSummary: true },
  });
}
