"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { GroupStatus, TaskStatus } from "@prisma/client";
import type { FormState } from "@/components/forms/action-form";
import { db } from "@/lib/db";
import { requireMember, requireUser } from "@/lib/auth/guard";
import {
  announcementSchema,
  commentSchema,
  decisionSchema,
  discussionSchema,
  groupInfoSchema,
  ideaSchema,
  linkSchema,
  meetingSchema,
  noteSchema,
  profileSchema,
  reportSchema,
  taskSchema,
} from "@/lib/validation/community";
import { AccessError } from "@/server/community/access";
import { addComment, createDiscussion, deleteComment, deleteDiscussion, editComment } from "@/server/community/comments";
import { deleteGroupFile, discardUnsentAttachment } from "@/server/community/files";
import {
  joinGroup,
  leaveGroup,
  postAnnouncement,
  removeMember,
  setGroupStatusByCoordinator,
  transferCoordinator,
  updateGroupInfo,
} from "@/server/community/groups";
import { closeIdea, createIdea, endorseIdea, updateIdea, withdrawEndorsement } from "@/server/community/ideas";
import { endMeeting, joinMeeting, startMeeting } from "@/server/community/meetings";
import { markRead } from "@/server/community/notifications";
import { fileReport } from "@/server/community/reports";
import { addLink, addTask, deleteLink, deleteNote, deleteTask, recordDecision, saveNote, setTaskStatus } from "@/server/community/research";

function fields(fd: FormData, keys: string[]) {
  return Object.fromEntries(keys.map((k) => [k, fd.get(k) ?? undefined]));
}
function str(fd: FormData, k: string) {
  return String(fd.get(k) ?? "");
}
/** Converts access errors from services into form messages. */
async function guarded(fn: () => Promise<FormState>): Promise<FormState> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof AccessError) return { error: e.message };
    throw e;
  }
}

async function groupSlug(groupId: string) {
  return (await db.researchGroup.findUniqueOrThrow({ where: { id: groupId }, select: { slug: true } })).slug;
}

// ---------------------------------------------------------------- profile

export async function createProfileAction(_p: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser("/community/welcome");
  if (!user.communityAccess) redirect("/continue");
  const parsed = profileSchema.safeParse(fields(fd, ["displayName", "headline", "intro", "location", "timeZone", "skills", "experience", "interests", "hoursPerWeek", "availability", "showLocation", "showTimeZone", "showHours"]));
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  await db.memberProfile.upsert({ where: { userId: user.id }, create: { userId: user.id, ...parsed.data }, update: parsed.data });
  redirect("/community");
}

export async function saveProfileAction(_p: FormState, fd: FormData): Promise<FormState> {
  const user = await requireMember("/community/profile");
  const parsed = profileSchema.safeParse(fields(fd, ["displayName", "headline", "intro", "location", "timeZone", "skills", "experience", "interests", "hoursPerWeek", "availability", "showLocation", "showTimeZone", "showHours"]));
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  await db.memberProfile.update({ where: { userId: user.id }, data: parsed.data });
  revalidatePath("/community", "layout");
  return { ok: "Profile saved." };
}

export async function removeProfilePhotoAction() {
  const user = await requireMember();
  const p = await db.memberProfile.findUnique({ where: { userId: user.id }, select: { photoFileId: true } });
  if (p?.photoFileId) {
    await db.memberProfile.update({ where: { userId: user.id }, data: { photoFileId: null } });
    const { deleteStoredFile } = await import("@/server/community/files");
    const f = await db.storedFile.update({ where: { id: p.photoFileId }, data: { deletedAt: new Date() } });
    await deleteStoredFile(f);
  }
  revalidatePath("/community/profile");
}

// ---------------------------------------------------------------- ideas

const IDEA_KEYS = ["title", "summary", "category", "description", "problem", "proposal", "customers", "revenueModel", "skillsNeeded", "timeEstimate", "links"];

export async function createIdeaAction(_p: FormState, fd: FormData): Promise<FormState> {
  const user = await requireMember();
  const parsed = ideaSchema.safeParse(fields(fd, IDEA_KEYS));
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  const res = await createIdea(user.id, parsed.data);
  if (!res.ok) return { error: res.error };
  redirect(`/community/ideas/${res.id}?published=1`);
}

export async function updateIdeaAction(_p: FormState, fd: FormData): Promise<FormState> {
  const user = await requireMember();
  const id = str(fd, "id");
  const parsed = ideaSchema.safeParse(fields(fd, IDEA_KEYS));
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  const res = await updateIdea(user.id, id, parsed.data);
  if (!res.ok) return { error: res.error };
  redirect(`/community/ideas/${id}`);
}

export async function closeIdeaAction(fd: FormData) {
  const user = await requireMember();
  const id = str(fd, "id");
  await closeIdea(user.id, id);
  revalidatePath(`/community/ideas/${id}`);
}

export async function endorseAction(fd: FormData) {
  const user = await requireMember();
  const id = str(fd, "id");
  const res = await endorseIdea(user.id, id);
  if (res.ok && res.groupCreated) redirect(`/community/groups/${res.groupCreated.slug}?created=1`);
  redirect(`/community/ideas/${id}${res.ok ? "?endorsed=1" : `?error=${encodeURIComponent(res.error)}`}`);
}

export async function withdrawEndorsementAction(fd: FormData) {
  const user = await requireMember();
  const id = str(fd, "id");
  await withdrawEndorsement(user.id, id);
  redirect(`/community/ideas/${id}?withdrawn=1`);
}

// ---------------------------------------------------------------- comments

export async function addCommentAction(_p: FormState, fd: FormData): Promise<FormState> {
  const user = await requireMember();
  const parsed = commentSchema.safeParse({ body: fd.get("body"), parentId: fd.get("parentId") || undefined });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const ideaId = str(fd, "ideaId");
  const discussionId = str(fd, "discussionId");
  const res = await addComment(user.id, ideaId ? { ideaId } : { discussionId }, parsed.data);
  if (!res.ok) return { error: res.error };
  revalidatePath(str(fd, "path") || "/community");
  return { ok: "Posted." };
}

export async function editCommentAction(_p: FormState, fd: FormData): Promise<FormState> {
  const user = await requireMember();
  const parsed = commentSchema.safeParse({ body: fd.get("body") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const res = await editComment(user.id, str(fd, "id"), parsed.data.body);
  if (!res.ok) return { error: res.error };
  revalidatePath(str(fd, "path") || "/community");
  return { ok: "Saved." };
}

export async function deleteCommentAction(fd: FormData) {
  const user = await requireMember();
  await deleteComment(user.id, str(fd, "id"));
  revalidatePath(str(fd, "path") || "/community");
}

// ---------------------------------------------------------------- reports

export async function reportAction(_p: FormState, fd: FormData): Promise<FormState> {
  const user = await requireMember();
  const parsed = reportSchema.safeParse(fields(fd, ["targetType", "targetId", "reason", "details"]));
  if (!parsed.success) return { error: "Choose a reason for the report." };
  const res = await fileReport(user.id, parsed.data);
  return res.ok ? { ok: res.message } : { error: res.error };
}

// ---------------------------------------------------------------- groups

export async function joinGroupAction(fd: FormData) {
  const user = await requireMember();
  const groupId = str(fd, "groupId");
  const res = await joinGroup(user.id, groupId);
  const slug = await groupSlug(groupId);
  redirect(`/community/groups/${slug}${res.ok ? "?joined=1" : `?error=${encodeURIComponent(res.error)}`}`);
}

export async function leaveGroupAction(fd: FormData) {
  const user = await requireMember();
  const groupId = str(fd, "groupId");
  await leaveGroup(user.id, groupId);
  redirect(`/community/groups/${await groupSlug(groupId)}?left=1`);
}

export async function groupStatusAction(fd: FormData) {
  const user = await requireMember();
  const groupId = str(fd, "groupId");
  let msg = "";
  try {
    const res = await setGroupStatusByCoordinator(user.id, groupId, str(fd, "status") as GroupStatus);
    if (!res.ok) msg = res.error;
  } catch (e) {
    if (!(e instanceof AccessError)) throw e;
    msg = e.message;
  }
  redirect(`/community/groups/${await groupSlug(groupId)}${msg ? `?error=${encodeURIComponent(msg)}` : "?ok=Status+updated"}`);
}

export async function groupInfoAction(_p: FormState, fd: FormData): Promise<FormState> {
  const user = await requireMember();
  return guarded(async () => {
    const parsed = groupInfoSchema.safeParse(fields(fd, ["name", "purpose", "description"]));
    if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
    await updateGroupInfo(user.id, str(fd, "groupId"), parsed.data);
    revalidatePath(`/community/groups/${await groupSlug(str(fd, "groupId"))}`, "layout");
    return { ok: "Group details saved." };
  });
}

export async function announcementAction(_p: FormState, fd: FormData): Promise<FormState> {
  const user = await requireMember();
  return guarded(async () => {
    const parsed = announcementSchema.safeParse(fields(fd, ["title", "body"]));
    if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
    await postAnnouncement(user.id, str(fd, "groupId"), parsed.data);
    revalidatePath(`/community/groups/${await groupSlug(str(fd, "groupId"))}`, "layout");
    return { ok: "Announcement posted. Group members were notified." };
  });
}

export async function removeMemberAction(fd: FormData) {
  const user = await requireMember();
  const groupId = str(fd, "groupId");
  let msg = "Member removed";
  try {
    const res = await removeMember(user.id, groupId, str(fd, "userId"));
    if (!res.ok) msg = res.error;
  } catch (e) {
    if (!(e instanceof AccessError)) throw e;
    msg = e.message;
  }
  redirect(`/community/groups/${await groupSlug(groupId)}/members?ok=${encodeURIComponent(msg)}`);
}

export async function transferCoordinatorAction(fd: FormData) {
  const user = await requireMember();
  const groupId = str(fd, "groupId");
  let msg = "Coordinator role handed over";
  try {
    const res = await transferCoordinator(user.id, groupId, str(fd, "userId"));
    if (!res.ok) msg = res.error;
  } catch (e) {
    if (!(e instanceof AccessError)) throw e;
    msg = e.message;
  }
  redirect(`/community/groups/${await groupSlug(groupId)}/members?ok=${encodeURIComponent(msg)}`);
}

// ---------------------------------------------------------------- discussions

export async function createDiscussionAction(_p: FormState, fd: FormData): Promise<FormState> {
  const user = await requireMember();
  const parsed = discussionSchema.safeParse(fields(fd, ["title", "body"]));
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  const groupId = str(fd, "groupId");
  const res = await createDiscussion(user.id, groupId, parsed.data);
  if (!res.ok) return { error: res.error };
  redirect(`/community/groups/${await groupSlug(groupId)}/discussions/${res.id}`);
}

export async function deleteDiscussionAction(fd: FormData) {
  const user = await requireMember();
  await deleteDiscussion(user.id, str(fd, "id"));
  redirect(`/community/groups/${await groupSlug(str(fd, "groupId"))}/discussions`);
}

// ---------------------------------------------------------------- meetings

export async function startMeetingAction(_p: FormState, fd: FormData): Promise<FormState> {
  const user = await requireMember();
  return guarded(async () => {
    const parsed = meetingSchema.safeParse(fields(fd, ["kind", "title", "joinUrl"]));
    if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
    const res = await startMeeting(user.id, str(fd, "groupId"), parsed.data);
    if (!res.ok) return { error: res.error };
    revalidatePath(`/community/groups/${await groupSlug(str(fd, "groupId"))}/meetings`);
    return { ok: "Meeting started. Group members were notified." };
  });
}

/** Records attendance and sends the member to Google Meet. */
export async function joinMeetingAction(fd: FormData) {
  const user = await requireMember();
  const groupId = str(fd, "groupId");
  let url: string | null = null;
  try {
    const res = await joinMeeting(user.id, groupId, str(fd, "meetingId"));
    if (res.ok) url = res.url;
  } catch (e) {
    if (!(e instanceof AccessError)) throw e;
  }
  if (!url) redirect(`/community/groups/${await groupSlug(groupId)}/meetings?error=${encodeURIComponent("This meeting is not available.")}`);
  redirect(url);
}

export async function endMeetingAction(fd: FormData) {
  const user = await requireMember();
  const groupId = str(fd, "groupId");
  try {
    await endMeeting(user.id, groupId, str(fd, "meetingId"));
  } catch (e) {
    if (!(e instanceof AccessError)) throw e;
  }
  revalidatePath(`/community/groups/${await groupSlug(groupId)}/meetings`);
}

// ---------------------------------------------------------------- research workspace

async function researchPath(groupId: string) {
  return `/community/groups/${await groupSlug(groupId)}`;
}

export async function saveNoteAction(_p: FormState, fd: FormData): Promise<FormState> {
  const user = await requireMember();
  return guarded(async () => {
    const parsed = noteSchema.safeParse(fields(fd, ["section", "title", "body"]));
    if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
    const res = await saveNote(user.id, str(fd, "groupId"), { id: str(fd, "id") || undefined, ...parsed.data });
    if (!res.ok) return { error: res.error };
    revalidatePath(await researchPath(str(fd, "groupId")), "layout");
    return { ok: "Note saved." };
  });
}

export async function deleteNoteAction(fd: FormData) {
  const user = await requireMember();
  await deleteNote(user.id, str(fd, "groupId"), str(fd, "id")).catch(() => {});
  revalidatePath(await researchPath(str(fd, "groupId")), "layout");
}

export async function addTaskAction(_p: FormState, fd: FormData): Promise<FormState> {
  const user = await requireMember();
  return guarded(async () => {
    const parsed = taskSchema.safeParse(fields(fd, ["title", "details", "assigneeId", "dueDate"]));
    if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
    const res = await addTask(user.id, str(fd, "groupId"), parsed.data);
    if (!res.ok) return { error: res.error };
    revalidatePath(await researchPath(str(fd, "groupId")), "layout");
    return { ok: "Task added." };
  });
}

export async function taskStatusAction(fd: FormData) {
  const user = await requireMember();
  await setTaskStatus(user.id, str(fd, "groupId"), str(fd, "id"), str(fd, "status") as TaskStatus).catch(() => {});
  revalidatePath(await researchPath(str(fd, "groupId")), "layout");
}

export async function deleteTaskAction(fd: FormData) {
  const user = await requireMember();
  await deleteTask(user.id, str(fd, "groupId"), str(fd, "id")).catch(() => {});
  revalidatePath(await researchPath(str(fd, "groupId")), "layout");
}

export async function decisionAction(_p: FormState, fd: FormData): Promise<FormState> {
  const user = await requireMember();
  return guarded(async () => {
    const parsed = decisionSchema.safeParse(fields(fd, ["title", "decision", "rationale"]));
    if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
    await recordDecision(user.id, str(fd, "groupId"), parsed.data);
    revalidatePath(await researchPath(str(fd, "groupId")), "layout");
    return { ok: "Decision recorded." };
  });
}

export async function addLinkAction(_p: FormState, fd: FormData): Promise<FormState> {
  const user = await requireMember();
  return guarded(async () => {
    const parsed = linkSchema.safeParse(fields(fd, ["url", "title"]));
    if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
    await addLink(user.id, str(fd, "groupId"), parsed.data);
    revalidatePath(`/community/groups/${await groupSlug(str(fd, "groupId"))}`, "layout");
    return { ok: "Link added." };
  });
}

export async function deleteLinkAction(fd: FormData) {
  const user = await requireMember();
  await deleteLink(user.id, str(fd, "groupId"), str(fd, "id")).catch(() => {});
  revalidatePath(`/community/groups/${await groupSlug(str(fd, "groupId"))}`, "layout");
}

export async function deleteFileAction(fd: FormData) {
  const user = await requireMember();
  await deleteGroupFile(user.id, str(fd, "groupId"), str(fd, "id")).catch(() => {});
  revalidatePath(`/community/groups/${await groupSlug(str(fd, "groupId"))}`, "layout");
}

// ---------------------------------------------------------------- notifications

export async function markAllReadAction() {
  const user = await requireMember();
  await markRead(user.id, "all");
  revalidatePath("/community", "layout");
}

export async function openNotificationAction(fd: FormData) {
  const user = await requireMember();
  const id = str(fd, "id");
  const n = await db.notification.findFirst({ where: { id, userId: user.id } });
  if (n) await markRead(user.id, [n.id]);
  const link = n?.link && n.link.startsWith("/") && !n.link.startsWith("//") ? n.link : "/community/notifications";
  redirect(link);
}

/** A file was removed from the chat box before the message was sent. */
export async function discardAttachmentAction(fileId: string): Promise<void> {
  const user = await requireMember();
  if (typeof fileId === "string" && fileId.length <= 40) await discardUnsentAttachment(user.id, fileId);
}
