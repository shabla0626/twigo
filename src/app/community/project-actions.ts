"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FormState } from "@/components/forms/action-form";
import { requireMember } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { withFlash } from "@/lib/flash";
import { AccessError } from "@/server/community/access";
import {
  acceptAgreement,
  activateProject,
  closeProject,
  createGroupProject,
  declineAgreement,
  openForAcceptance,
  saveAgreementDraft,
  setLegalReview,
  updateProjectBasics,
  withdrawFromProject,
  withdrawOpenVersion,
  type ParticipantInput,
} from "@/server/community/group-projects";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");

async function projectPath(projectId: string) {
  const p = await db.groupProject.findUnique({ where: { id: projectId }, select: { id: true, group: { select: { slug: true } } } });
  if (!p) throw new AccessError("Project not found.");
  return `/community/groups/${p.group.slug}/projects/${p.id}`;
}

/** Runs a service call; access refusals become form messages instead of errors. */
async function run(fn: () => Promise<{ ok: boolean; error?: string }>, ok: string, path?: () => Promise<string>): Promise<FormState> {
  try {
    const res = await fn();
    if (!res.ok) return { error: res.error };
    if (path) revalidatePath(await path());
    return { ok };
  } catch (e) {
    if (e instanceof AccessError) return { error: e.message };
    throw e;
  }
}

export async function createProjectAction(_p: FormState, fd: FormData): Promise<FormState> {
  const user = await requireMember();
  const groupId = str(fd, "groupId");
  let id = "";
  const res = await run(async () => {
    const r = await createGroupProject(user.id, groupId, { name: str(fd, "name"), objective: str(fd, "objective") });
    if (r.ok) id = r.id;
    return r;
  }, "");
  if (res?.error) return res;
  redirect(withFlash(await projectPath(id), { ok: "Project created. Next: draft its agreement." }));
}

export async function updateProjectBasicsAction(_p: FormState, fd: FormData): Promise<FormState> {
  const user = await requireMember();
  const id = str(fd, "projectId");
  return run(() => updateProjectBasics(user.id, id, { name: str(fd, "name"), objective: str(fd, "objective"), coordinatorId: str(fd, "coordinatorId") }), "Project details saved.", () => projectPath(id));
}

const TERM_KEYS = [
  "scope", "deliverables", "timeline", "customer", "contractingModel", "contractingDetails", "paymentRecipient", "approvedExpenses", "grossRevenue",
  "deductions", "refundsChargebacks", "netRevenue", "compensationMethod", "distributionFormula", "paymentSchedule", "ipArrangements", "confidentiality",
  "withdrawal", "disputes", "other",
] as const;

export async function saveDraftAction(_p: FormState, fd: FormData): Promise<FormState> {
  const user = await requireMember();
  const id = str(fd, "projectId");
  const terms = Object.fromEntries(TERM_KEYS.map((k) => [k, str(fd, k)]));
  // One row per group member; only ticked rows are participants.
  const participants: ParticipantInput[] = fd
    .getAll("member")
    .map(String)
    .filter((uid) => fd.get(`p_${uid}_include`) === "on")
    .map((uid) => ({
      userId: uid,
      role: str(fd, `p_${uid}_role`),
      responsibilities: str(fd, `p_${uid}_responsibilities`),
      expectedContribution: str(fd, `p_${uid}_contribution`),
      compensation: str(fd, `p_${uid}_compensation`),
    }));
  return run(() => saveAgreementDraft(user.id, id, terms, participants, str(fd, "changeNote")), "Draft saved. Nothing is binding until every participant accepts a version.", () => projectPath(id));
}

export async function openForAcceptanceAction(_p: FormState, fd: FormData): Promise<FormState> {
  const user = await requireMember();
  const v = str(fd, "versionId");
  const project = await db.projectAgreementVersion.findUnique({ where: { id: v }, select: { projectId: true } });
  return run(() => openForAcceptance(user.id, v), "The participants were asked to review and accept this version.", project ? () => projectPath(project.projectId) : undefined);
}

export async function acceptAgreementAction(_p: FormState, fd: FormData): Promise<FormState> {
  const user = await requireMember();
  if (fd.get("confirm") !== "on") return { error: "Tick the box to confirm that you read this version and accept it." };
  const v = str(fd, "versionId");
  const project = await db.projectAgreementVersion.findUnique({ where: { id: v }, select: { projectId: true } });
  return run(() => acceptAgreement(user.id, v, str(fd, "fingerprint")), "Your acceptance was recorded.", project ? () => projectPath(project.projectId) : undefined);
}

export async function declineAgreementAction(_p: FormState, fd: FormData): Promise<FormState> {
  const user = await requireMember();
  const v = str(fd, "versionId");
  const project = await db.projectAgreementVersion.findUnique({ where: { id: v }, select: { projectId: true } });
  return run(() => declineAgreement(user.id, v, str(fd, "note")), "Your answer was recorded. The coordinator can prepare a new version.", project ? () => projectPath(project.projectId) : undefined);
}

export async function withdrawVersionAction(_p: FormState, fd: FormData): Promise<FormState> {
  const user = await requireMember();
  const v = str(fd, "versionId");
  const project = await db.projectAgreementVersion.findUnique({ where: { id: v }, select: { projectId: true } });
  return run(() => withdrawOpenVersion(user.id, v), "This version is no longer waiting for acceptance.", project ? () => projectPath(project.projectId) : undefined);
}

export async function legalReviewAction(_p: FormState, fd: FormData): Promise<FormState> {
  const user = await requireMember();
  const id = str(fd, "projectId");
  return run(() => setLegalReview(user.id, id, fd.get("needed") === "yes", str(fd, "note")), "Saved.", () => projectPath(id));
}

export async function activateProjectAction(_p: FormState, fd: FormData): Promise<FormState> {
  const user = await requireMember();
  const id = str(fd, "projectId");
  return run(() => activateProject(user.id, id), "The project is commercially active under the accepted agreement.", () => projectPath(id));
}

export async function closeProjectAction(_p: FormState, fd: FormData): Promise<FormState> {
  const user = await requireMember();
  const id = str(fd, "projectId");
  const to = str(fd, "to") === "COMPLETED" ? "COMPLETED" : "CANCELLED";
  return run(() => closeProject(user.id, id, to, str(fd, "note")), to === "COMPLETED" ? "The project is marked completed." : "The project is marked cancelled.", () => projectPath(id));
}

export async function withdrawFromProjectAction(_p: FormState, fd: FormData): Promise<FormState> {
  const user = await requireMember();
  const id = str(fd, "projectId");
  return run(() => withdrawFromProject(user.id, id, str(fd, "note")), "Your withdrawal was recorded and the other participants were told.", () => projectPath(id));
}
