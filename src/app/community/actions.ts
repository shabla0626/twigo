"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { GroupStatus, TaskStatus } from "@prisma/client";
import type { FormState } from "@/components/forms/action-form";
import { db } from "@/lib/db";
import { withFlash } from "@/lib/flash";
import { recordAcceptance } from "@/server/legal";
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

/**
 * For the small one-click buttons (delete, mark done, end meeting). Every refusal comes back as
 * a short message that is shown next to the button; nothing fails silently.
 */
async function quick(fn: () => Promise<{ ok: true } | { ok: false; error: string } | void>): Promise<FormState> {
  try {
    const res = await fn();
    return res && !res.ok ? { error: res.error } : undefined;
  } catch (e) {
    if (e instanceof AccessError) return { error: e.message };
    throw e;
  }
}

/** The group's address name. An unknown group is an ordinary "not found", never a crash. */
async function groupSlug(groupId: string) {
  const g = groupId ? await db.researchGroup.findUnique({ where: { id: groupId }, select: { slug: true } }) : null;
  if (!g) throw new AccessError("Group not found.");
  return g.slug;
}

/** For actions that end with a redirect: an unknown group leads to the list of groups with a message. */
async function groupPath(groupId: string): Promise<string> {
  const g = groupId ? await db.researchGroup.findUnique({ where: { id: groupId }, select: { slug: true } }) : null;
  if (!g) redirect(withFlash("/community/groups", { error: "Group not found." }));
  return `/community/groups/${g.slug}`;
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

const IDEA_KEYS = ["title", "summary", "category", "description", "problem", "proposal", "customers", "revenueModel", "skillsNeeded", "timeEstimate", "expectedActivities", "objectives", "collaborationApproach", "links"];

export async function createIdeaAction(_p: FormState, fd: FormData): Promise<FormState> {
  const user = await requireMember();
  // The author confirms, before publishing, that they understood who sees the idea and what that means.
  if (fd.get("visibilityAck") !== "on") return { error: "Please confirm that you understand who can see your idea and that it is not confidential." };
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
  const kind = str(fd, "changeKind");
  const res = await updateIdea(user.id, id, parsed.data, { kind: kind === "MINOR" || kind === "MATERIAL" ? kind : undefined });
  if (!res.ok) return { error: res.error };
  redirect(`/community/ideas/${id}${"reset" in res && res.reset ? "?changed=material" : "?changed=1"}`);
}

export async function closeIdeaAction(_p: FormState, fd: FormData): Promise<FormState> {
  const user = await requireMember();
  const id = str(fd, "id");
  return quick(async () => {
    const res = await closeIdea(user.id, id);
    if (res.ok) revalidatePath(`/community/ideas/${id}`);
    return res;
  });
}

export async function endorseAction(fd: FormData) {
  const user = await requireMember();
  const id = str(fd, "id");
  const res = await endorseIdea(user.id, id);
  // Supporting can make the person a founding group member: the agreement shown next to the button is recorded.
  if (res.ok) await recordAcceptance({ userId: user.id, key: "group-participation", kind: "ACCEPTED", method: "idea-support", context: id });
  if (res.ok && res.groupCreated) redirect(`/community/groups/${res.groupCreated.slug}?created=1`);
  redirect(res.ok ? `/community/ideas/${id}?endorsed=1` : withFlash(`/community/ideas/${encodeURIComponent(id)}`, { error: res.error }));
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

export async function deleteCommentAction(_p: FormState, fd: FormData): Promise<FormState> {
  const user = await requireMember();
  return quick(async () => {
    const res = await deleteComment(user.id, str(fd, "id"));
    const path = str(fd, "path");
    if (res.ok) revalidatePath(path.startsWith("/community") ? path : "/community");
    return res;
  });
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
  const path = await groupPath(groupId);
  const res = await joinGroup(user.id, groupId);
  if (res.ok) await recordAcceptance({ userId: user.id, key: "group-participation", kind: "ACCEPTED", method: "group-join", context: groupId });
  redirect(res.ok ? `${path}?joined=1` : withFlash(path, { error: res.error }));
}

export async function leaveGroupAction(fd: FormData) {
  const user = await requireMember();
  const groupId = str(fd, "groupId");
  const path = await groupPath(groupId);
  await leaveGroup(user.id, groupId);
  redirect(`${path}?left=1`);
}

export async function groupStatusAction(fd: FormData) {
  const user = await requireMember();
  const groupId = str(fd, "groupId");
  const path = await groupPath(groupId);
  let msg = "";
  try {
    const res = await setGroupStatusByCoordinator(user.id, groupId, str(fd, "status") as GroupStatus);
    if (!res.ok) msg = res.error;
  } catch (e) {
    if (!(e instanceof AccessError)) throw e;
    msg = e.message;
  }
  redirect(withFlash(path, msg ? { error: msg } : { ok: "Status updated." }));
}

export async function groupInfoAction(_p: FormState, fd: FormData): Promise<FormState> {
  const user = await requireMember();
  return guarded(async () => {
    const parsed = groupInfoSchema.safeParse(fields(fd, ["name", "purpose", "description"]));
    if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
    const res = await updateGroupInfo(user.id, str(fd, "groupId"), parsed.data, str(fd, "reason"));
    if (!res.ok) return { error: res.error };
    revalidatePath(`/community/groups/${await groupSlug(str(fd, "groupId"))}`, "layout");
    return { ok: res.purposeChanged ? "Saved. The change of direction was recorded as a decision, announced, and sent to all members." : "Group details saved." };
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

/** Coordinator removes a member. The refusal, if any, is shown next to the button. */
export async function removeMemberAction(_p: FormState, fd: FormData): Promise<FormState> {
  const user = await requireMember();
  const groupId = str(fd, "groupId");
  const refused = await quick(async () => {
    await groupSlug(groupId);
    return removeMember(user.id, groupId, str(fd, "userId"));
  });
  if (refused) return refused;
  redirect(withFlash(`${await groupPath(groupId)}/members`, { ok: "The member was removed and has been told. The group can see this in the chat." }));
}

/** Coordinator hands the role to another member. */
export async function transferCoordinatorAction(_p: FormState, fd: FormData): Promise<FormState> {
  const user = await requireMember();
  const groupId = str(fd, "groupId");
  const refused = await quick(async () => {
    await groupSlug(groupId);
    return transferCoordinator(user.id, groupId, str(fd, "userId"));
  });
  if (refused) return refused;
  redirect(withFlash(`${await groupPath(groupId)}/members`, { ok: "The coordinator role was handed over. The new coordinator has been told." }));
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

export async function deleteDiscussionAction(_p: FormState, fd: FormData): Promise<FormState> {
  const user = await requireMember();
  const groupId = str(fd, "groupId");
  const refused = await quick(async () => {
    await groupSlug(groupId);
    return deleteDiscussion(user.id, str(fd, "id"));
  });
  if (refused) return refused;
  redirect(`${await groupPath(groupId)}/discussions`);
}

// ---------------------------------------------------------------- meetings

export async function startMeetingAction(_p: FormState, fd: FormData): Promise<FormState> {
  const user = await requireMember();
  return guarded(async () => {
    const parsed = meetingSchema.safeParse(fields(fd, ["title", "joinUrl"]));
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
  if (!url) redirect(withFlash(`${await groupPath(groupId)}/meetings`, { error: "This meeting is not available. It may have ended." }));
  redirect(url);
}

export async function endMeetingAction(_p: FormState, fd: FormData): Promise<FormState> {
  const user = await requireMember();
  const groupId = str(fd, "groupId");
  return quick(async () => {
    const slug = await groupSlug(groupId);
    const res = await endMeeting(user.id, groupId, str(fd, "meetingId"));
    revalidatePath(`/community/groups/${slug}/meetings`);
    return res;
  });
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

export async function deleteNoteAction(_p: FormState, fd: FormData): Promise<FormState> {
  const user = await requireMember();
  const groupId = str(fd, "groupId");
  return quick(async () => {
    const slug = await groupSlug(groupId);
    const res = await deleteNote(user.id, groupId, str(fd, "id"));
    revalidatePath(`/community/groups/${slug}`, "layout");
    return res;
  });
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

export async function taskStatusAction(_p: FormState, fd: FormData): Promise<FormState> {
  const user = await requireMember();
  const groupId = str(fd, "groupId");
  return quick(async () => {
    const slug = await groupSlug(groupId);
    const res = await setTaskStatus(user.id, groupId, str(fd, "id"), str(fd, "status") as TaskStatus);
    revalidatePath(`/community/groups/${slug}`, "layout");
    return res;
  });
}

export async function deleteTaskAction(_p: FormState, fd: FormData): Promise<FormState> {
  const user = await requireMember();
  const groupId = str(fd, "groupId");
  return quick(async () => {
    const slug = await groupSlug(groupId);
    const res = await deleteTask(user.id, groupId, str(fd, "id"));
    revalidatePath(`/community/groups/${slug}`, "layout");
    return res;
  });
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

export async function deleteLinkAction(_p: FormState, fd: FormData): Promise<FormState> {
  const user = await requireMember();
  const groupId = str(fd, "groupId");
  return quick(async () => {
    const slug = await groupSlug(groupId);
    const res = await deleteLink(user.id, groupId, str(fd, "id"));
    revalidatePath(`/community/groups/${slug}`, "layout");
    return res;
  });
}

export async function deleteFileAction(_p: FormState, fd: FormData): Promise<FormState> {
  const user = await requireMember();
  const groupId = str(fd, "groupId");
  return quick(async () => {
    const slug = await groupSlug(groupId);
    const res = await deleteGroupFile(user.id, groupId, str(fd, "id"));
    revalidatePath(`/community/groups/${slug}`, "layout");
    return res;
  });
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
