import "server-only";
import type { GroupProjectStatus, Prisma, ProjectAgreementStatus } from "@prisma/client";
import { z } from "zod";
import { brand } from "@/config/brand";
import { audit } from "@/lib/audit";
import { sha256 } from "@/lib/crypto";
import { db } from "@/lib/db";
import { AccessError, activeMemberIds, groupAccess, requireGroupMember, requireOpenGroupMember } from "./access";
import { notify } from "./notifications";

/**
 * Member-led projects and their agreements (Twigo transformation, stage 6).
 *
 * Principles enforced here, not only described:
 * - The platform is never a party and never receives a share: no field for a platform share exists,
 *   and the agreement text always states it.
 * - No formula is assumed. The participants choose the method and write the formula themselves.
 * - An agreement version's text is frozen when it is opened for acceptance; its fingerprint is the
 *   SHA-256 of that text. Every participant accepts that exact fingerprint.
 * - Any change is a new version. The previous accepted version stays in force until every participant
 *   of the new one has accepted it. Nobody can change another person's terms without that person's
 *   acceptance.
 * - Commercial activity starts only when the latest version is accepted by everyone, the contracting
 *   arrangement and the payment recipient are recorded, and any legal-review flag is cleared.
 * - Leaving a project never forfeits anything: it is recorded, and the agreement decides.
 */

export const CONTRACTING_MODELS = {
  UNDECIDED: "Not decided yet",
  PROJECT_REPRESENTATIVE: "One project representative contracts with the customer and receives payment",
  DIRECT_CONTRACTS: "Each participant contracts directly with the customer for their own part",
  SEPARATE_ENTITY: "A separately established project entity contracts with the customer",
  OTHER: "Another documented arrangement",
} as const;

export const COMPENSATION_METHODS = {
  EQUAL: "Equal distribution",
  CONTRIBUTION: "Contribution-based distribution",
  ROLE: "Role-based compensation",
  FIXED: "Fixed project payments",
  OTHER: "Another mutually agreed arrangement",
} as const;

export const PROJECT_STATUS_LABELS: Record<GroupProjectStatus, string> = {
  PLANNING: "Planning",
  AGREEMENT_PENDING: "Agreement waiting for acceptance",
  ACTIVE: "Commercially active",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export const AGREEMENT_STATUS_LABELS: Record<ProjectAgreementStatus, string> = {
  DRAFT: "Draft",
  OPEN: "Waiting for acceptance",
  ACCEPTED: "Accepted by every participant (in force)",
  SUPERSEDED: "Replaced by a newer accepted version",
  WITHDRAWN: "Withdrawn before everyone accepted",
};

const txt = (max: number) => z.string().trim().max(max).default("");

/** The structured terms. Every money-related item is written by the participants; nothing is preset. */
export const termsSchema = z.object({
  scope: txt(4000),
  deliverables: txt(4000),
  timeline: txt(1000),
  customer: txt(500),
  contractingModel: z.enum(Object.keys(CONTRACTING_MODELS) as [keyof typeof CONTRACTING_MODELS, ...(keyof typeof CONTRACTING_MODELS)[]]).default("UNDECIDED"),
  contractingDetails: txt(2000),
  paymentRecipient: txt(500),
  approvedExpenses: txt(2000),
  grossRevenue: txt(1500),
  deductions: txt(1500),
  refundsChargebacks: txt(1500),
  netRevenue: txt(1500),
  compensationMethod: z.enum(Object.keys(COMPENSATION_METHODS) as [keyof typeof COMPENSATION_METHODS, ...(keyof typeof COMPENSATION_METHODS)[]]).default("OTHER"),
  distributionFormula: txt(3000),
  paymentSchedule: txt(1500),
  ipArrangements: txt(3000),
  confidentiality: txt(2000),
  withdrawal: txt(2000),
  disputes: txt(2000),
  other: txt(3000),
});
export type Terms = z.infer<typeof termsSchema>;

export const participantSchema = z.object({
  userId: z.string().min(1).max(40),
  role: txt(120),
  responsibilities: z.string().trim().max(2000),
  expectedContribution: txt(1000),
  compensation: z.string().trim().max(1500),
});
export type ParticipantInput = z.infer<typeof participantSchema>;

/** Items that must be filled in before the participants are asked to accept. */
const REQUIRED: [keyof Terms, string][] = [
  ["scope", "Project scope"],
  ["paymentRecipient", "Who receives customer payments"],
  ["grossRevenue", "Definition of gross project revenue"],
  ["deductions", "Taxes and mandatory deductions"],
  ["refundsChargebacks", "Refunds and chargebacks"],
  ["netRevenue", "Definition of net distributable revenue"],
  ["distributionFormula", "Revenue distribution formula"],
  ["paymentSchedule", "Payment schedule"],
  ["ipArrangements", "Intellectual property"],
  ["confidentiality", "Confidentiality"],
  ["withdrawal", "Withdrawal and termination"],
  ["disputes", "Dispute resolution"],
];

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

// ---------------------------------------------------------------- reading

async function projectWithAccess(projectId: string, userId: string) {
  const project = await db.groupProject.findUnique({ where: { id: projectId } });
  if (!project) throw new AccessError("Project not found.");
  const a = await requireGroupMember(project.groupId, userId);
  const canEdit = a.isCoordinator || project.coordinatorId === userId;
  return { project, access: a, canEdit };
}

export async function listGroupProjects(groupId: string, userId: string) {
  await requireGroupMember(groupId, userId);
  return db.groupProject.findMany({
    where: { groupId },
    orderBy: { createdAt: "desc" },
    include: { coordinator: { select: { profile: { select: { displayName: true } } } }, versions: { orderBy: { version: "desc" }, take: 1, select: { version: true, status: true } } },
  });
}

/** Everything the project page shows. Group members only. */
export async function projectDetail(projectId: string, userId: string) {
  const { project, access, canEdit } = await projectWithAccess(projectId, userId);
  const versions = await db.projectAgreementVersion.findMany({
    where: { projectId },
    orderBy: { version: "desc" },
    include: { participants: { orderBy: { displayName: "asc" } }, createdBy: { select: { profile: { select: { displayName: true } } } } },
  });
  const members = await db.groupMembership.findMany({
    where: { groupId: project.groupId, status: "ACTIVE" },
    select: { userId: true, user: { select: { profile: { select: { displayName: true } } } } },
  });
  const eligible = new Set(await activeMemberIds(project.groupId));
  const coordinator = project.coordinatorId ? await db.user.findUnique({ where: { id: project.coordinatorId }, select: { profile: { select: { displayName: true } } } }) : null;
  return {
    project,
    canEdit,
    isOpenGroup: access.isOpen,
    versions,
    inForce: versions.find((v) => v.status === "ACCEPTED") ?? null,
    open: versions.find((v) => v.status === "OPEN") ?? null,
    draft: versions.find((v) => v.status === "DRAFT") ?? null,
    members: members.filter((m) => eligible.has(m.userId)).map((m) => ({ userId: m.userId, name: m.user.profile?.displayName ?? "Member" })),
    coordinatorName: coordinator?.profile?.displayName ?? null,
  };
}

// ---------------------------------------------------------------- the readable text

const section = (title: string, body: string) => `## ${title}\n\n${body.trim() || "Not specified."}\n`;

/** Builds the agreement text. The statement about the platform is always included and cannot be edited. */
export function agreementText(input: { projectName: string; groupName: string; version: number; terms: Terms; participants: (ParticipantInput & { displayName: string })[] }) {
  const name = brand().name;
  const t = input.terms;
  const people = input.participants
    .map((p) => `- **${p.displayName}**${p.role ? ` (${p.role})` : ""}: responsibilities: ${p.responsibilities || "not specified"}${p.expectedContribution ? `; expected contribution: ${p.expectedContribution}` : ""}; compensation: ${p.compensation || "not specified"}`)
    .join("\n");
  return [
    `## Project agreement: ${input.projectName}`,
    "",
    `Version ${input.version}, recorded in the ${name} group "${input.groupName}".`,
    "",
    `**${name} is not a party to this agreement and receives no share, commission or fee from this project.** ${name} provides the tool to record what the participants agree; it does not collect, hold or distribute project money. This agreement does not by itself create a company or partnership, and naming a coordinator does not by itself make that person the legal representative of the others. Whether a legal or tax review is needed depends on the arrangement and the applicable law.`,
    "",
    section("1. Scope", t.scope),
    section("2. Deliverables and timeline", [t.deliverables, t.timeline && `Timeline: ${t.timeline}`].filter(Boolean).join("\n\n")),
    section("3. Participants, responsibilities and compensation", people),
    section("4. Customer and contracting arrangement", [`Customer: ${t.customer || "not yet known"}.`, `Arrangement: ${CONTRACTING_MODELS[t.contractingModel]}.`, t.contractingDetails].filter(Boolean).join("\n\n")),
    section("5. Who receives customer payments", t.paymentRecipient),
    section("6. Approved project expenses", t.approvedExpenses),
    section("7. Gross receipts, deductions and net distributable revenue", [`Gross customer receipts: ${t.grossRevenue || "not specified"}`, `Taxes and mandatory deductions: ${t.deductions || "not specified"}`, `Refunds and chargebacks: ${t.refundsChargebacks || "not specified"}`, `Net distributable project revenue: ${t.netRevenue || "not specified"}`].join("\n\n")),
    section("8. Distribution", `Method: ${COMPENSATION_METHODS[t.compensationMethod]}.\n\n${t.distributionFormula || "Formula not specified."}`),
    section("9. Payment schedule", t.paymentSchedule),
    section("10. Intellectual property", t.ipArrangements),
    section("11. Confidentiality", t.confidentiality),
    section("12. Withdrawal and termination", `${t.withdrawal || "Not specified."}\n\nLeaving the project does not by itself forfeit compensation already earned under this agreement.`),
    section("13. Disputes", t.disputes),
    section("14. Other terms", t.other),
  ].join("\n");
}

// ---------------------------------------------------------------- writing

export async function createGroupProject(userId: string, groupId: string, input: { name: string; objective: string }): Promise<Result<{ id: string }>> {
  await requireOpenGroupMember(groupId, userId);
  const name = input.name.trim();
  const objective = input.objective.trim();
  if (name.length < 3 || name.length > 120) return { ok: false, error: "The project name needs 3 to 120 characters." };
  if (objective.length < 10 || objective.length > 2000) return { ok: false, error: "Describe the business objective in 10 to 2000 characters." };
  const p = await db.groupProject.create({ data: { groupId, name, objective, coordinatorId: userId, createdById: userId } });
  await audit(userId, "project.created", "GroupProject", p.id, { groupId });
  return { ok: true, id: p.id };
}

export async function updateProjectBasics(userId: string, projectId: string, input: { name: string; objective: string; coordinatorId: string }): Promise<Result> {
  const { project, canEdit } = await projectWithAccess(projectId, userId);
  if (!canEdit) return { ok: false, error: "Only the project coordinator or the group coordinator can change the project." };
  if (!(await activeMemberIds(project.groupId)).includes(input.coordinatorId)) return { ok: false, error: "The project coordinator must be an active member of the group." };
  const name = input.name.trim();
  const objective = input.objective.trim();
  if (name.length < 3 || objective.length < 10) return { ok: false, error: "Give a name (3+ characters) and an objective (10+ characters)." };
  await db.groupProject.update({ where: { id: projectId }, data: { name: name.slice(0, 120), objective: objective.slice(0, 2000), coordinatorId: input.coordinatorId } });
  await audit(userId, "project.updated", "GroupProject", projectId);
  return { ok: true };
}

/** Creates or updates the one draft of the agreement. Drafts are visible to the group, never binding. */
export async function saveAgreementDraft(userId: string, projectId: string, termsRaw: unknown, participantsRaw: unknown, changeNote: string): Promise<Result<{ versionId: string }>> {
  const { project, canEdit } = await projectWithAccess(projectId, userId);
  if (!canEdit) return { ok: false, error: "Only the project coordinator or the group coordinator can edit the draft agreement." };
  if (project.status === "COMPLETED" || project.status === "CANCELLED") return { ok: false, error: "This project is closed." };
  const terms = termsSchema.safeParse(termsRaw);
  if (!terms.success) return { ok: false, error: terms.error.issues[0]?.message ?? "Some values are not valid." };
  const parts = z.array(participantSchema).max(50).safeParse(participantsRaw);
  if (!parts.success) return { ok: false, error: "Each participant needs responsibilities and compensation terms (or leave the row empty)." };
  const eligible = new Set(await activeMemberIds(project.groupId));
  const seen = new Set<string>();
  for (const p of parts.data) {
    if (!eligible.has(p.userId)) return { ok: false, error: "Participants must be active members of the group." };
    if (seen.has(p.userId)) return { ok: false, error: "Each person can be listed once." };
    seen.add(p.userId);
  }
  const names = new Map((await db.memberProfile.findMany({ where: { userId: { in: [...seen] } }, select: { userId: true, displayName: true } })).map((m) => [m.userId, m.displayName]));
  const group = await db.researchGroup.findUniqueOrThrow({ where: { id: project.groupId }, select: { name: true } });

  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "GroupProject" WHERE "id" = ${projectId} FOR UPDATE`;
    const latest = await tx.projectAgreementVersion.findFirst({ where: { projectId }, orderBy: { version: "desc" } });
    const draft = latest?.status === "DRAFT" ? latest : null;
    const version = draft ? draft.version : (latest?.version ?? 0) + 1;
    const withNames = parts.data.map((p) => ({ ...p, displayName: names.get(p.userId) ?? "Member" }));
    const content = agreementText({ projectName: project.name, groupName: group.name, version, terms: terms.data, participants: withNames });
    const data = { terms: terms.data as Prisma.InputJsonValue, content, contentHash: sha256(content), changeNote: changeNote.trim().slice(0, 1000) || null };
    const v = draft
      ? await tx.projectAgreementVersion.update({ where: { id: draft.id }, data })
      : await tx.projectAgreementVersion.create({ data: { ...data, projectId, version, createdById: userId } });
    await tx.projectAgreementParticipant.deleteMany({ where: { versionId: v.id } });
    if (withNames.length) {
      await tx.projectAgreementParticipant.createMany({
        data: withNames.map((p) => ({ versionId: v.id, userId: p.userId, displayName: p.displayName, role: p.role || null, responsibilities: p.responsibilities, expectedContribution: p.expectedContribution || null, compensation: p.compensation })),
      });
    }
    await tx.auditLog.create({ data: { actorId: userId, action: "project.agreement_draft_saved", entityType: "ProjectAgreementVersion", entityId: v.id, metadata: { version } } });
    return { ok: true as const, versionId: v.id };
  });
}

/** Freezes the draft and asks every listed participant to accept exactly this text. */
export async function openForAcceptance(userId: string, versionId: string): Promise<Result> {
  const v = await db.projectAgreementVersion.findUnique({ where: { id: versionId }, include: { participants: true } });
  if (!v) return { ok: false, error: "Agreement not found." };
  const { project, canEdit } = await projectWithAccess(v.projectId, userId);
  if (!canEdit) return { ok: false, error: "Only the project coordinator or the group coordinator can ask for acceptance." };
  if (v.status !== "DRAFT") return { ok: false, error: "Only a draft can be opened for acceptance." };
  const terms = termsSchema.parse(v.terms);
  const missing = REQUIRED.filter(([k]) => !String(terms[k] ?? "").trim()).map(([, label]) => label);
  if (terms.contractingModel === "UNDECIDED") missing.unshift("Contracting arrangement");
  if (!v.participants.length) missing.push("At least one participant");
  if (v.participants.some((p) => !p.responsibilities.trim() || !p.compensation.trim())) missing.push("Responsibilities and compensation for every participant");
  if (missing.length) return { ok: false, error: `Please complete before asking for acceptance: ${missing.join(", ")}.` };
  const eligible = new Set(await activeMemberIds(project.groupId));
  if (v.participants.some((p) => !p.userId || !eligible.has(p.userId))) return { ok: false, error: "A listed participant is no longer an active member of the group. Update the participants first." };

  await db.$transaction(async (tx) => {
    await tx.projectAgreementVersion.updateMany({ where: { projectId: v.projectId, status: "OPEN" }, data: { status: "WITHDRAWN", closedAt: new Date() } });
    await tx.projectAgreementVersion.update({ where: { id: v.id }, data: { status: "OPEN", openedAt: new Date() } });
    if (project.status === "PLANNING") await tx.groupProject.update({ where: { id: project.id }, data: { status: "AGREEMENT_PENDING" } });
    await tx.auditLog.create({ data: { actorId: userId, action: "project.agreement_opened", entityType: "ProjectAgreementVersion", entityId: v.id, metadata: { version: v.version, contentHash: v.contentHash } } });
  });
  const slug = (await db.researchGroup.findUniqueOrThrow({ where: { id: project.groupId }, select: { slug: true } })).slug;
  await notify(
    v.participants.map((p) => p.userId!).filter((id) => id !== userId),
    { type: "PROJECT_AGREEMENT", title: `Please review version ${v.version} of the agreement for “${project.name}”`, body: "Read it and accept or decline. Nothing is binding on you until you accept.", link: `/community/groups/${slug}/projects/${project.id}` },
  );
  return { ok: true };
}

/** A participant accepts the exact text they were shown (its fingerprint must match). */
export async function acceptAgreement(userId: string, versionId: string, fingerprint: string): Promise<Result<{ allAccepted: boolean }>> {
  const v = await db.projectAgreementVersion.findUnique({ where: { id: versionId }, include: { participants: true } });
  if (!v) return { ok: false, error: "Agreement not found." };
  await projectWithAccess(v.projectId, userId);
  if (v.status !== "OPEN") return { ok: false, error: "This version is not waiting for acceptance." };
  if (fingerprint !== v.contentHash) return { ok: false, error: "The agreement text changed after you opened it. Please reload and read it again." };
  const me = v.participants.find((p) => p.userId === userId);
  if (!me) return { ok: false, error: "You are not a participant in this version." };
  if (me.acceptedAt) return { ok: true, allAccepted: v.participants.every((p) => p.acceptedAt || p.userId === userId) };

  const all = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "ProjectAgreementVersion" WHERE "id" = ${v.id} FOR UPDATE`;
    await tx.projectAgreementParticipant.update({ where: { id: me.id }, data: { acceptedAt: new Date(), acceptedHash: v.contentHash, declinedAt: null, declineNote: null } });
    const waiting = await tx.projectAgreementParticipant.count({ where: { versionId: v.id, acceptedAt: null } });
    if (waiting === 0) {
      const now = new Date();
      await tx.projectAgreementVersion.updateMany({ where: { projectId: v.projectId, status: "ACCEPTED" }, data: { status: "SUPERSEDED", closedAt: now } });
      await tx.projectAgreementVersion.update({ where: { id: v.id }, data: { status: "ACCEPTED", acceptedAt: now } });
    }
    await tx.auditLog.create({ data: { actorId: userId, action: "project.agreement_accepted", entityType: "ProjectAgreementVersion", entityId: v.id, metadata: { version: v.version, contentHash: v.contentHash } } });
    return waiting === 0;
  });
  if (all) {
    const project = await db.groupProject.findUniqueOrThrow({ where: { id: v.projectId } });
    const slug = (await db.researchGroup.findUniqueOrThrow({ where: { id: project.groupId }, select: { slug: true } })).slug;
    await notify(v.participants.map((p) => p.userId!).filter(Boolean), {
      type: "PROJECT_AGREEMENT",
      title: `Every participant accepted version ${v.version} of the agreement for “${project.name}”`,
      body: "This version is now the agreement in force.",
      link: `/community/groups/${slug}/projects/${project.id}`,
    });
  }
  return { ok: true, allAccepted: all };
}

export async function declineAgreement(userId: string, versionId: string, note: string): Promise<Result> {
  const v = await db.projectAgreementVersion.findUnique({ where: { id: versionId }, include: { participants: true } });
  if (!v) return { ok: false, error: "Agreement not found." };
  await projectWithAccess(v.projectId, userId);
  if (v.status !== "OPEN") return { ok: false, error: "This version is not waiting for acceptance." };
  const me = v.participants.find((p) => p.userId === userId);
  if (!me) return { ok: false, error: "You are not a participant in this version." };
  if (me.acceptedAt) return { ok: false, error: "You already accepted this version. Ask for a new version if something must change." };
  await db.projectAgreementParticipant.update({ where: { id: me.id }, data: { declinedAt: new Date(), declineNote: note.trim().slice(0, 1000) || null } });
  await audit(userId, "project.agreement_declined", "ProjectAgreementVersion", v.id, { version: v.version });
  return { ok: true };
}

/** Stops asking for acceptance of an open version (the version in force, if any, stays in force). */
export async function withdrawOpenVersion(userId: string, versionId: string): Promise<Result> {
  const v = await db.projectAgreementVersion.findUnique({ where: { id: versionId } });
  if (!v) return { ok: false, error: "Agreement not found." };
  const { canEdit } = await projectWithAccess(v.projectId, userId);
  if (!canEdit) return { ok: false, error: "Only the project coordinator or the group coordinator can do this." };
  if (v.status !== "OPEN") return { ok: false, error: "Only a version waiting for acceptance can be withdrawn." };
  await db.projectAgreementVersion.update({ where: { id: v.id }, data: { status: "WITHDRAWN", closedAt: new Date() } });
  await audit(userId, "project.agreement_withdrawn", "ProjectAgreementVersion", v.id, { version: v.version });
  return { ok: true };
}

export async function setLegalReview(userId: string, projectId: string, needed: boolean, note: string): Promise<Result> {
  const { canEdit } = await projectWithAccess(projectId, userId);
  if (!canEdit) return { ok: false, error: "Only the project coordinator or the group coordinator can do this." };
  if (!needed && note.trim().length < 10) return { ok: false, error: "Say how the review was done or why it is not needed (at least 10 characters)." };
  await db.groupProject.update({ where: { id: projectId }, data: { needsLegalReview: needed, legalReviewNote: note.trim().slice(0, 1000) || null } });
  await audit(userId, needed ? "project.legal_review_flagged" : "project.legal_review_cleared", "GroupProject", projectId);
  return { ok: true };
}

/** Commercial work may start: the latest version is accepted and the money arrangements are recorded. */
export async function activateProject(userId: string, projectId: string): Promise<Result> {
  const { project, canEdit } = await projectWithAccess(projectId, userId);
  if (!canEdit) return { ok: false, error: "Only the project coordinator or the group coordinator can do this." };
  if (project.status === "ACTIVE") return { ok: true };
  if (project.status === "COMPLETED" || project.status === "CANCELLED") return { ok: false, error: "This project is closed." };
  if (project.needsLegalReview) return { ok: false, error: "The project is marked as needing a legal or tax review. Record the outcome first." };
  const latest = await db.projectAgreementVersion.findFirst({ where: { projectId, status: { in: ["ACCEPTED", "OPEN", "DRAFT"] } }, orderBy: { version: "desc" } });
  if (!latest || latest.status !== "ACCEPTED") return { ok: false, error: "Commercial work can only start when the latest agreement version has been accepted by every participant." };
  const terms = termsSchema.parse(latest.terms);
  if (terms.contractingModel === "UNDECIDED" || !terms.paymentRecipient.trim()) return { ok: false, error: "Record the contracting arrangement and the payment recipient first." };
  await db.groupProject.update({ where: { id: projectId }, data: { status: "ACTIVE", activatedAt: new Date() } });
  await audit(userId, "project.activated", "GroupProject", projectId, { agreementVersion: latest.version });
  return { ok: true };
}

export async function closeProject(userId: string, projectId: string, to: "COMPLETED" | "CANCELLED", note: string): Promise<Result> {
  const { project, canEdit } = await projectWithAccess(projectId, userId);
  if (!canEdit) return { ok: false, error: "Only the project coordinator or the group coordinator can do this." };
  if (project.status === "COMPLETED" || project.status === "CANCELLED") return { ok: false, error: "This project is already closed." };
  if (note.trim().length < 10) return { ok: false, error: "Add a short note for the participants (at least 10 characters)." };
  await db.groupProject.update({ where: { id: projectId }, data: { status: to, closedAt: new Date() } });
  await audit(userId, to === "COMPLETED" ? "project.completed" : "project.cancelled", "GroupProject", projectId, { note: note.trim().slice(0, 500) });
  return { ok: true };
}

/** A participant records that they leave the project. Nothing earned is forfeited; the agreement decides. */
export async function withdrawFromProject(userId: string, projectId: string, note: string): Promise<Result> {
  const { project } = await projectWithAccess(projectId, userId);
  const inForce = await db.projectAgreementVersion.findFirst({ where: { projectId, status: "ACCEPTED" }, include: { participants: true } });
  const me = inForce?.participants.find((p) => p.userId === userId);
  if (!inForce || !me) return { ok: false, error: "You are not a participant in the agreement in force." };
  if (me.withdrewAt) return { ok: true };
  if (note.trim().length < 10) return { ok: false, error: "Add a short note for the other participants (at least 10 characters)." };
  await db.projectAgreementParticipant.update({ where: { id: me.id }, data: { withdrewAt: new Date(), withdrawalNote: note.trim().slice(0, 1000) } });
  await audit(userId, "project.participant_withdrew", "GroupProject", projectId);
  const slug = (await db.researchGroup.findUniqueOrThrow({ where: { id: project.groupId }, select: { slug: true } })).slug;
  await notify(inForce.participants.map((p) => p.userId!).filter((id) => id && id !== userId), {
    type: "PROJECT_AGREEMENT",
    title: `${me.displayName} is leaving the project “${project.name}”`,
    body: "Work already done is settled under the agreement in force. Record a new agreement version for the remaining participants.",
    link: `/community/groups/${slug}/projects/${project.id}`,
  });
  return { ok: true };
}

/** For the download: the version, if the person may see it (group members; the owner via the admin area). */
export async function agreementForDownload(userId: string, versionId: string, opts: { owner?: boolean } = {}) {
  const v = await db.projectAgreementVersion.findUnique({ where: { id: versionId }, include: { participants: true, project: { include: { group: { select: { name: true } } } } } });
  if (!v) return null;
  if (!opts.owner) {
    const a = await groupAccess(v.project.groupId, userId);
    if (!a?.isMember) return null;
  }
  return v;
}
