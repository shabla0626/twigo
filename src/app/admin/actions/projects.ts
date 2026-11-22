"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { flashQuery, withFlash } from "@/lib/flash";
import { requireAdmin } from "@/lib/auth/guard";
import {
  assignmentSchema,
  assignmentStatusSchema,
  compensationSchema,
  formToObject,
  milestoneSchema,
  milestoneStatusSchema,
  projectSchema,
  roleSchema,
} from "@/lib/validation/admin";
import {
  addAssignment,
  addMilestone,
  addRole,
  createProject,
  deleteMilestone,
  deleteProject,
  removeCompensation,
  deleteRole,
  saveCompensation,
  setAssignmentStatus,
  setMilestoneStatus,
  updateProject,
} from "@/server/admin/projects";

const back = (projectId: string, q: string) => `/admin/projects/${encodeURIComponent(projectId)}?${q}`;

function refreshPublic() {
  revalidatePath("/participation");
}

export async function createProjectAction(fd: FormData) {
  const admin = await requireAdmin("projects.manage");
  const parsed = projectSchema.safeParse(formToObject(fd));
  if (!parsed.success) redirect(withFlash("/admin/projects", { error: parsed.error.issues[0]?.message ?? "invalid" }));
  const p = await createProject(admin.id, parsed.data);
  refreshPublic();
  redirect(`/admin/projects/${p.id}?ok=created`);
}

export async function updateProjectAction(fd: FormData) {
  const admin = await requireAdmin("projects.manage");
  const id = String(fd.get("id") ?? "");
  const parsed = projectSchema.safeParse(formToObject(fd));
  if (!parsed.success) redirect(back(id, flashQuery({ error: parsed.error.issues[0]?.message ?? "invalid" })));
  await updateProject(admin.id, id, parsed.data);
  refreshPublic();
  revalidatePath(`/admin/projects/${id}`);
  redirect(back(id, "ok=saved"));
}

/** Owner only: deleting is permanent and removes the project's records. */
export async function deleteProjectAction(fd: FormData) {
  const owner = await requireAdmin("projects.delete");
  const id = String(fd.get("id") ?? "");
  if (fd.get("confirm") !== "DELETE") redirect(back(id, flashQuery({ error: "Type DELETE to confirm" })));
  const res = await deleteProject(owner.id, id);
  if (!res.ok) redirect(back(id, flashQuery({ error: res.error })));
  refreshPublic();
  redirect("/admin/projects?ok=deleted");
}

/** Owner only: removes one compensation agreement (needed before its project or participant record can be deleted). */
export async function removeCompensationAction(fd: FormData) {
  const owner = await requireAdmin("compensation.manage");
  const pid = String(fd.get("projectId") ?? "");
  if (fd.get("confirm") !== "REMOVE") redirect(back(pid, flashQuery({ error: "Type REMOVE to confirm" })));
  const res = await removeCompensation(owner.id, String(fd.get("assignmentId") ?? ""));
  redirect(back(pid, res.ok ? "ok=compensation-removed" : flashQuery({ error: res.error })));
}

export async function addRoleAction(fd: FormData) {
  const admin = await requireAdmin("projects.manage");
  const parsed = roleSchema.safeParse(formToObject(fd));
  const pid = String(fd.get("projectId") ?? "");
  if (!parsed.success) redirect(back(pid, flashQuery({ error: "Role title is required" })));
  await addRole(admin.id, parsed.data);
  refreshPublic();
  redirect(back(pid, "ok=role"));
}

export async function deleteRoleAction(fd: FormData) {
  const admin = await requireAdmin("projects.manage");
  await deleteRole(admin.id, String(fd.get("id")));
  refreshPublic();
  redirect(back(String(fd.get("projectId")), "ok=role_deleted"));
}

export async function addAssignmentAction(fd: FormData) {
  const admin = await requireAdmin("projects.manage");
  const pid = String(fd.get("projectId") ?? "");
  const parsed = assignmentSchema.safeParse(formToObject(fd));
  if (!parsed.success) redirect(back(pid, flashQuery({ error: "Select a participant" })));
  const res = await addAssignment(admin.id, parsed.data);
  if (!res.ok) redirect(back(pid, flashQuery({ error: res.error ?? "Could not assign" })));
  redirect(back(pid, "ok=assigned"));
}

export async function assignmentStatusAction(fd: FormData) {
  const admin = await requireAdmin("projects.manage");
  const { id, status } = assignmentStatusSchema.parse(formToObject(fd));
  const a = await setAssignmentStatus(admin.id, id, status);
  redirect(back(a.projectId, "ok=assignment"));
}

export async function addMilestoneAction(fd: FormData) {
  const admin = await requireAdmin("projects.manage");
  const pid = String(fd.get("projectId") ?? "");
  const parsed = milestoneSchema.safeParse(formToObject(fd));
  if (!parsed.success) redirect(back(pid, flashQuery({ error: "Milestone title is required" })));
  await addMilestone(admin.id, parsed.data);
  redirect(back(pid, "ok=milestone"));
}

export async function milestoneStatusAction(fd: FormData) {
  const admin = await requireAdmin("projects.manage");
  const { id, status } = milestoneStatusSchema.parse(formToObject(fd));
  const m = await setMilestoneStatus(admin.id, id, status);
  redirect(back(m.projectId, "ok=milestone"));
}

export async function deleteMilestoneAction(fd: FormData) {
  const admin = await requireAdmin("projects.manage");
  const m = await deleteMilestone(admin.id, String(fd.get("id")));
  redirect(back(m.projectId, "ok=milestone_deleted"));
}

export async function saveCompensationAction(fd: FormData) {
  const admin = await requireAdmin("compensation.manage");
  const pid = String(fd.get("projectId") ?? "");
  const parsed = compensationSchema.safeParse(formToObject(fd));
  if (!parsed.success) redirect(back(pid, flashQuery({ error: parsed.error.issues[0]?.message ?? "Invalid compensation" })));
  await saveCompensation(admin.id, parsed.data);
  redirect(back(pid, "ok=compensation"));
}
