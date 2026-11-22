import "server-only";
import type { GroupStatus, ResearchSection, TaskStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { publishRealtime } from "@/lib/realtime-events";
import { activeMemberIds, requireGroupMember, requireOpenGroupMember } from "./access";
import { notify } from "./notifications";

// Everything here is private to active group members.

export async function getWorkspace(groupId: string, userId: string) {
  await requireGroupMember(groupId, userId);
  const [notes, tasks, decisions, links] = await Promise.all([
    db.researchNote.findMany({ where: { groupId }, orderBy: [{ section: "asc" }, { updatedAt: "desc" }], include: { author: { select: { profile: { select: { displayName: true } } } } } }),
    db.researchTask.findMany({ where: { groupId }, orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "asc" }], include: { assignee: { select: { id: true, profile: { select: { displayName: true } } } } } }),
    db.groupDecision.findMany({ where: { groupId }, orderBy: { decidedAt: "desc" }, include: { recordedBy: { select: { profile: { select: { displayName: true } } } } } }),
    db.groupLink.findMany({ where: { groupId }, orderBy: { createdAt: "desc" }, include: { addedBy: { select: { profile: { select: { displayName: true } } } } } }),
  ]);
  return { notes, tasks, decisions, links };
}

async function touched(groupId: string) {
  await db.researchGroup.update({ where: { id: groupId }, data: { lastActivityAt: new Date() } });
  await publishRealtime(db, { t: "group.updated", groupId, what: "research" });
}

export async function saveNote(userId: string, groupId: string, input: { id?: string; section: ResearchSection; title: string; body: string }) {
  await requireOpenGroupMember(groupId, userId);
  if (input.id) {
    const n = await db.researchNote.findUnique({ where: { id: input.id } });
    if (!n || n.groupId !== groupId) return { ok: false as const, error: "Note not found." };
    // Notes are shared: any group member may edit them (last editor is recorded).
    await db.researchNote.update({ where: { id: n.id }, data: { section: input.section, title: input.title, body: input.body, updatedById: userId } });
  } else {
    await db.researchNote.create({ data: { groupId, section: input.section, title: input.title, body: input.body, authorId: userId, updatedById: userId } });
  }
  await touched(groupId);
  return { ok: true as const };
}

export async function deleteNote(userId: string, groupId: string, noteId: string) {
  const a = await requireOpenGroupMember(groupId, userId);
  const n = await db.researchNote.findUnique({ where: { id: noteId } });
  if (!n || n.groupId !== groupId) return { ok: false as const, error: "Note not found." };
  if (n.authorId !== userId && !a.isCoordinator) return { ok: false as const, error: "Only the author or the coordinator can delete a note." };
  await db.researchNote.delete({ where: { id: noteId } });
  await touched(groupId);
  return { ok: true as const };
}

export async function addTask(userId: string, groupId: string, input: { title: string; details: string | null; assigneeId: string | null; dueDate: Date | null }) {
  await requireOpenGroupMember(groupId, userId);
  if (input.assigneeId && !(await activeMemberIds(groupId)).includes(input.assigneeId)) return { ok: false as const, error: "Tasks can only be assigned to group members." };
  await db.researchTask.create({ data: { groupId, ...input, createdById: userId } });
  await touched(groupId);
  return { ok: true as const };
}

export async function setTaskStatus(userId: string, groupId: string, taskId: string, status: TaskStatus) {
  await requireOpenGroupMember(groupId, userId);
  const t = await db.researchTask.findUnique({ where: { id: taskId } });
  if (!t || t.groupId !== groupId) return { ok: false as const, error: "Task not found." };
  await db.researchTask.update({ where: { id: taskId }, data: { status, completedAt: status === "DONE" ? new Date() : null } });
  await touched(groupId);
  return { ok: true as const };
}

export async function deleteTask(userId: string, groupId: string, taskId: string) {
  const a = await requireOpenGroupMember(groupId, userId);
  const t = await db.researchTask.findUnique({ where: { id: taskId } });
  if (!t || t.groupId !== groupId) return { ok: false as const, error: "Task not found." };
  if (t.createdById !== userId && !a.isCoordinator) return { ok: false as const, error: "Only the creator or the coordinator can delete a task." };
  await db.researchTask.delete({ where: { id: taskId } });
  await touched(groupId);
  return { ok: true as const };
}

export async function recordDecision(userId: string, groupId: string, input: { title: string; decision: string; rationale: string | null }) {
  const a = await requireOpenGroupMember(groupId, userId);
  await db.groupDecision.create({ data: { groupId, ...input, recordedById: userId } });
  await touched(groupId);
  await notify(await activeMemberIds(groupId), { type: "GROUP_DECISION", title: `${a.group.name}: decision recorded: ${input.title}`, link: `/community/groups/${a.group.slug}/research` }, { exclude: userId });
  return { ok: true as const };
}

export async function addLink(userId: string, groupId: string, input: { url: string; title: string }) {
  await requireOpenGroupMember(groupId, userId);
  await db.groupLink.create({ data: { groupId, ...input, addedById: userId } });
  await touched(groupId);
  return { ok: true as const };
}

export async function deleteLink(userId: string, groupId: string, linkId: string) {
  const a = await requireOpenGroupMember(groupId, userId);
  const l = await db.groupLink.findUnique({ where: { id: linkId } });
  if (!l || l.groupId !== groupId) return { ok: false as const, error: "Link not found." };
  if (l.addedById !== userId && !a.isCoordinator) return { ok: false as const, error: "Only the person who added it or the coordinator can remove a link." };
  await db.groupLink.delete({ where: { id: linkId } });
  return { ok: true as const };
}

export const STATUS_ORDER: GroupStatus[] = ["FORMING", "RESEARCHING", "VALIDATING", "PLANNING", "READY_FOR_REVIEW", "APPROVED_FOR_PROJECT", "ARCHIVED"];
