"use server";

import path from "node:path";
import { redirect } from "next/navigation";
import type { UserRole } from "@prisma/client";
import type { FormState } from "@/components/forms/action-form";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { env } from "@/lib/env";
import { isRecentlyAuthenticated, requireAdmin } from "@/lib/auth/guard";
import { deliver, describeSend, getTemplate, verifyEmailConnection } from "@/lib/email";
import { retryDelivery } from "@/server/email-retry";
import { TEMPLATES, isTemplateKey } from "@/lib/email/templates";
import { createBackup } from "@/ops/backup";
import { runRetention } from "@/ops/retention";
import {
  deactivateUser,
  inviteAdministrator,
  reactivateUser,
  sendInvitation,
  setUserRole,
  setMembership,
  suspendUser,
} from "@/server/accounts";
import { adminAssignCoordinator, adminSetGroupState, approveGroupForProject } from "@/server/community/groups";
import { moderate } from "@/server/community/reports";
import { notify } from "@/server/community/notifications";
import { saveSetting, SETTINGS, type SettingKey } from "@/server/settings";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");
const back = (to: string, msg: { ok?: string; error?: string }) =>
  redirect(`${to}${to.includes("?") ? "&" : "?"}${msg.error ? `error=${encodeURIComponent(msg.error)}` : `ok=${encodeURIComponent(msg.ok ?? "Done")}`}`);

async function requireRecent(returnTo: string) {
  if (!(await isRecentlyAuthenticated())) redirect(`/account/confirm?next=${encodeURIComponent(returnTo)}`);
}

// ---------------------------------------------------------------- members

export async function memberStatusAction(fd: FormData) {
  const admin = await requireAdmin("members.suspend");
  const id = str(fd, "id");
  const action = str(fd, "action");
  // Your own account is managed from the account page (with identity confirmation), never from here.
  if (id === admin.id) back(`/admin/members/${id}`, { error: "You cannot change your own account from the admin area." });
  const res =
    action === "suspend"
      ? await suspendUser(admin.id, id, str(fd, "reason"))
      : action === "reactivate"
        ? await reactivateUser(admin.id, id)
        : action === "deactivate"
          ? await deactivateUser(admin.id, id)
          : { ok: false as const, error: "Unknown action." };
  back(`/admin/members/${id}`, res.ok ? { ok: "Account updated." } : { error: res.error });
}

/** Pause, restore or remove someone's access to the member community (not their account). */
export async function membershipAction(fd: FormData) {
  const admin = await requireAdmin("members.suspend");
  const id = str(fd, "id");
  const to = str(fd, "to");
  if (!["ACTIVE", "SUSPENDED", "REVOKED"].includes(to)) back(`/admin/members/${id}`, { error: "Unknown action." });
  const res = await setMembership(admin.id, id, to as "ACTIVE" | "SUSPENDED" | "REVOKED", { notify: fd.get("notify") === "on" });
  back(`/admin/members/${id}`, res.ok ? { ok: "Community access updated." } : { error: res.error });
}

export async function messageMemberAction(_p: FormState, fd: FormData): Promise<FormState> {
  const admin = await requireAdmin("members.view");
  const title = str(fd, "title").trim().slice(0, 150);
  const body = str(fd, "body").trim().slice(0, 2000);
  if (title.length < 3) return { error: "Add a title." };
  await notify([str(fd, "id")], { type: "ADMIN_MESSAGE", title, body: body || undefined, link: "/community/notifications" });
  await audit(admin.id, "member.admin_message", "User", str(fd, "id"));
  return { ok: "Message delivered as a notification." };
}

// ---------------------------------------------------------------- applications: email + invitation

export async function sendApplicantEmailAction(_p: FormState, fd: FormData): Promise<FormState> {
  const admin = await requireAdmin("email.send");
  const applicationId = str(fd, "applicationId");
  const key = str(fd, "template");
  if (fd.get("confirm") !== "on") return { error: "Tick the box to confirm you reviewed the message." };
  if (!isTemplateKey(key) || TEMPLATES[key].audience !== "applicant") return { error: "Choose a template." };
  const app = await db.application.findUnique({ where: { id: applicationId }, select: { applicant: { select: { email: true } } } });
  if (!app) return { error: "Application not found." };
  const subject = str(fd, "subject").trim().slice(0, 200);
  const text = str(fd, "body").trim().slice(0, 20000);
  if (!subject || !text) return { error: "Subject and message are required." };
  const res = await deliver({ to: app.applicant.email, subject, text, templateKey: key, sentById: admin.id, applicationId });
  await audit(admin.id, "email.sent_to_applicant", "Application", applicationId, { template: key, status: res.status });
  if (res.status === "sent") return { ok: `${describeSend(res)} Sending an email does not change the application status.` };
  return { error: `${res.error} The attempt was logged; you can retry it from Admin → Email.` };
}

export async function sendInvitationAction(_p: FormState, fd: FormData): Promise<FormState> {
  const admin = await requireAdmin("members.invite");
  if (fd.get("confirm") !== "on") return { error: "Tick the box to confirm you reviewed the message." };
  const res = await sendInvitation(admin.id, str(fd, "applicationId"), { subject: str(fd, "subject").slice(0, 200), body: str(fd, "body").slice(0, 20000) });
  return res.ok ? { ok: res.status } : { error: res.error };
}

// ---------------------------------------------------------------- moderation

export async function moderateAction(fd: FormData) {
  const admin = await requireAdmin("moderation.act");
  const action = str(fd, "action") as "remove" | "dismiss" | "suspend_author";
  if (action === "suspend_author") await requireAdmin("members.suspend");
  const res = await moderate(admin.id, str(fd, "id"), action, str(fd, "note").slice(0, 500));
  back("/admin/reports", res.ok ? { ok: "Report handled and recorded in the audit log." } : { error: res.error });
}

export async function ideaModerationAction(fd: FormData) {
  const admin = await requireAdmin("moderation.act");
  const id = str(fd, "id");
  const action = str(fd, "action");
  if (action === "remove") {
    await db.businessIdea.update({ where: { id }, data: { status: "REMOVED", removedAt: new Date(), removedReason: str(fd, "reason").slice(0, 300) || null } });
  } else if (action === "restore") {
    const idea = await db.businessIdea.findUniqueOrThrow({ where: { id }, include: { group: { select: { id: true } } } });
    await db.businessIdea.update({ where: { id }, data: { status: idea.group ? "GROUP_FORMED" : "OPEN", removedAt: null, removedReason: null } });
  }
  await audit(admin.id, `idea.${action}`, "BusinessIdea", id);
  back("/admin/ideas", { ok: action === "remove" ? "Idea removed." : "Idea restored." });
}

// ---------------------------------------------------------------- groups

export async function groupStateAction(fd: FormData) {
  const admin = await requireAdmin("groups.manage");
  const id = str(fd, "id");
  const res = await adminSetGroupState(admin.id, id, str(fd, "action") as "archive" | "reopen" | "suspend" | "unsuspend", str(fd, "reason"));
  back(`/admin/groups/${id}`, res.ok ? { ok: "Group updated." } : { error: res.error });
}

export async function assignCoordinatorAction(fd: FormData) {
  const admin = await requireAdmin("groups.manage");
  const id = str(fd, "id");
  const res = await adminAssignCoordinator(admin.id, id, str(fd, "userId"));
  back(`/admin/groups/${id}`, res.ok ? { ok: "Coordinator assigned." } : { error: res.error });
}

export async function approveGroupAction(fd: FormData) {
  const admin = await requireAdmin("groups.approve_project");
  const id = str(fd, "id");
  if (fd.get("confirm") !== "on") back(`/admin/groups/${id}`, { error: "Confirm the checklist before approving." });
  const res = await approveGroupForProject(admin.id, id);
  if (!res.ok) back(`/admin/groups/${id}`, { error: res.error });
  redirect(`/admin/projects/${(res as { projectId: string }).projectId}?ok=created`);
}

// ---------------------------------------------------------------- email templates

export async function saveTemplateAction(_p: FormState, fd: FormData): Promise<FormState> {
  const admin = await requireAdmin("email.templates");
  const key = str(fd, "key");
  if (!isTemplateKey(key)) return { error: "Unknown template." };
  const subject = str(fd, "subject").trim().slice(0, 200);
  const body = str(fd, "body").trim().slice(0, 20000);
  if (!subject || !body) return { error: "Subject and body are required." };
  const required = ["activationLink", "verifyLink", "resetLink"].filter((v) => TEMPLATES[key].body.includes(`{{${v}}}`));
  for (const v of required) if (!body.includes(`{{${v}}}`)) return { error: `The message must keep the {{${v}}} placeholder.` };
  await db.emailTemplate.upsert({ where: { key }, create: { key, subject, body, updatedById: admin.id }, update: { subject, body, updatedById: admin.id } });
  await audit(admin.id, "email.template_saved", "EmailTemplate", key);
  return { ok: "Template saved." };
}

export async function resetTemplateAction(fd: FormData) {
  const admin = await requireAdmin("email.templates");
  const key = str(fd, "key");
  await db.emailTemplate.deleteMany({ where: { key } });
  await audit(admin.id, "email.template_reset", "EmailTemplate", key);
  back(`/admin/email/${key}`, { ok: "Restored the default wording." });
}

export async function testEmailAction(_p: FormState, fd: FormData): Promise<FormState> {
  const admin = await requireAdmin("email.templates");
  const key = str(fd, "key");
  if (!isTemplateKey(key)) return { error: "Unknown template." };
  const t = await getTemplate(key);
  const res = await deliver({ to: admin.email, subject: `[Test] ${t.subject}`, text: t.body, templateKey: key, sentById: admin.id });
  return res.status === "sent" ? { ok: describeSend(res) } : { error: res.error };
}

/** Connects and logs in to the email server without sending anything. */
export async function checkEmailConnectionAction(): Promise<FormState> {
  const admin = await requireAdmin("email.send");
  const res = await verifyEmailConnection();
  await audit(admin.id, "email.connection_checked", "System", undefined, { ok: res.ok, status: res.ok ? "OK" : res.status });
  return res.ok ? { ok: "Connected and logged in to the email server successfully. (No email was sent.)" } : { error: res.error };
}

/** Sends a short test message to the signed-in administrator's own address. */
export async function sendTestToMeAction(): Promise<FormState> {
  const admin = await requireAdmin("email.send");
  const res = await deliver({
    to: admin.email,
    subject: "Test email from the CoWork admin panel",
    text: "This is a test email sent from the Email page of the admin panel. If you can read it in your inbox, email delivery works.\n\nYou can ignore this message.",
    sentById: admin.id,
  });
  return res.status === "sent" ? { ok: describeSend(res) } : { error: res.error };
}

/** Manually retries one failed delivery (see server/email-retry.ts for the safety rules). */
export async function retryEmailAction(fd: FormData) {
  const admin = await requireAdmin("email.send");
  if (fd.get("confirm") !== "on") back("/admin/email", { error: "Tick the box to confirm the retry." });
  const res = await retryDelivery(admin.id, str(fd, "id"));
  back("/admin/email", res.ok ? { ok: res.message } : { error: res.error });
}

// ---------------------------------------------------------------- owner: settings, admins, retention, backups

export async function saveSettingsAction(_p: FormState, fd: FormData): Promise<FormState> {
  const owner = await requireAdmin("settings.manage");
  if (!(await isRecentlyAuthenticated())) return { error: "Confirm your identity first (Account → Confirm identity)." };
  for (const key of Object.keys(SETTINGS) as SettingKey[]) {
    if (!fd.has(key)) continue;
    const res = await saveSetting(owner.id, key, str(fd, key).trim());
    if (!res.ok) return { error: res.error };
  }
  return { ok: "Settings saved." };
}

export async function setRoleAction(fd: FormData) {
  const owner = await requireAdmin("admins.manage");
  await requireRecent("/admin/admins");
  const res = await setUserRole(owner.id, str(fd, "id"), str(fd, "role") as UserRole);
  back("/admin/admins", res.ok ? { ok: "Role changed. The person must sign in again." } : { error: res.error });
}

export async function inviteAdminAction(_p: FormState, fd: FormData): Promise<FormState> {
  const owner = await requireAdmin("admins.manage");
  if (!(await isRecentlyAuthenticated())) return { error: "Confirm your identity first." };
  const role = str(fd, "role") === "OWNER" ? "OWNER" : "ADMIN";
  const res = await inviteAdministrator(owner.id, str(fd, "email"), str(fd, "name").trim().slice(0, 100) || "Administrator", role);
  return res.ok ? { ok: res.status } : { error: res.error };
}

export async function runRetentionAction(fd: FormData) {
  const owner = await requireAdmin("retention.run");
  await requireRecent("/admin/privacy");
  if (str(fd, "confirm").trim().toUpperCase() !== "DELETE") back("/admin/privacy", { error: "Type DELETE to confirm." });
  const res = await runRetention(db, { dryRun: false, storageDir: path.resolve(env().STORAGE_DIR) });
  await audit(owner.id, "retention.manual_run", "System", res.jobRunId);
  back("/admin/privacy", { ok: `Retention run finished: ${res.categories.reduce((n, c) => n + c.count, 0)} records removed.` });
}

export async function backupNowAction() {
  const owner = await requireAdmin("backups.manage");
  const e = env();
  const run = await db.jobRun.create({ data: { job: "backup" } });
  // The outcome is decided inside try/catch; the redirect happens after it,
  // because redirect() works by throwing and would otherwise be caught as a failure.
  let written: string | null = null;
  try {
    const res = await createBackup({ connectionString: e.DATABASE_URL, dir: path.resolve(e.BACKUP_DIR), encryptionKey: e.BACKUP_ENCRYPTION_KEY || undefined, keep: e.BACKUP_KEEP, label: "manual" });
    await db.jobRun.update({ where: { id: run.id }, data: { finishedAt: new Date(), ok: true, summary: { file: path.basename(res.file), bytes: res.bytes, tables: res.manifest.tables.length } } });
    await audit(owner.id, "backup.manual", "System", run.id);
    written = path.basename(res.file);
  } catch (err) {
    await db.jobRun.update({ where: { id: run.id }, data: { finishedAt: new Date(), ok: false, error: String(err).slice(0, 1000) } });
  }
  back("/admin/backups", written ? { ok: `Backup written: ${written}` } : { error: "Backup failed. See the job history." });
}
