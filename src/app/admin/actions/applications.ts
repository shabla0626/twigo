"use server";

import { APPROVAL_MESSAGE } from "@/server/membership-grant";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/guard";
import { LOCAL_CAPTURE_MESSAGE, type SendResult } from "@/lib/email";
import { formToObject, noteSchema, statusChangeSchema } from "@/lib/validation/admin";
import { addApplicationNote, deleteApplicantData, requestAccountCreation, updateApplicationStatus } from "@/server/admin/applications";

function emailOutcome(email: SendResult | null): { ok?: string; error?: string } {
  if (!email) return {};
  if (email.status === "sent") return { ok: email.local ? LOCAL_CAPTURE_MESSAGE : "The notification was accepted by the email provider (delivery is not confirmed yet)." };
  return { error: `The decision was saved, but the notification email was NOT sent. ${email.error} You can retry it under Email in the admin menu.` };
}

function back(id: string, msg: { ok?: string; error?: string }): never {
  const p = new URLSearchParams();
  if (msg.ok) p.set("ok", msg.ok);
  if (msg.error) p.set("error", msg.error);
  redirect(`/admin/applications/${id}?${p.toString()}`);
}

/**
 * Changes the application status. Approving ("Accepted") requires an explicit
 * confirmation and grants community access in the same step. The email is
 * optional and never decides the outcome: if it fails, the decision stays.
 */
export async function changeStatusAction(fd: FormData) {
  const admin = await requireAdmin("applications.review");
  const parsed = statusChangeSchema.safeParse(formToObject(fd));
  const id = String(fd.get("id") ?? "");
  if (!parsed.success) back(id, { error: "Choose a status." });
  const { status, notify, confirm, interviewDetails, details } = parsed.data;
  if (status === "ACCEPTED") {
    await requireAdmin("members.invite");
    if (!confirm) back(id, { error: "Tick the box to confirm the approval. Approving gives this person access to the member community." });
  }
  if (notify) await requireAdmin("email.send");
  const res = await updateApplicationStatus(admin.id, id, status, { notify, interviewDetails: status === "INTERVIEW_REQUESTED" ? interviewDetails : undefined, details: details ?? interviewDetails ?? undefined });
  if (!res.ok) back(id, { error: res.error });
  revalidatePath("/admin", "layout");
  // What is said here is the person's real situation, never an assumption.
  const decision = res.status === "ACCEPTED" ? APPROVAL_MESSAGE[res.access] : "Status updated.";
  const mail = emailOutcome(res.email);
  back(id, { ok: [decision, mail.ok].filter(Boolean).join(" "), error: mail.error });
}

/** For applications from before accounts existed. */
export async function requestAccountAction(fd: FormData) {
  const admin = await requireAdmin("email.send");
  const id = String(fd.get("id") ?? "");
  const res = await requestAccountCreation(admin.id, id);
  if (!res.ok) back(id, { error: res.error });
  const mail = emailOutcome(res.email);
  back(id, mail.error ? { error: mail.error.replace("The decision was saved, but the notification email", "The email") } : { ok: `Request sent. ${mail.ok ?? ""}` });
}

export async function addNoteAction(fd: FormData) {
  const admin = await requireAdmin("applications.review");
  const parsed = noteSchema.safeParse(formToObject(fd));
  const id = String(fd.get("id") ?? "");
  if (!parsed.success) redirect(`/admin/applications/${encodeURIComponent(id)}?error=note`);
  await addApplicationNote(admin.id, parsed.data.id, parsed.data.body);
  revalidatePath(`/admin/applications/${parsed.data.id}`);
  redirect(`/admin/applications/${parsed.data.id}?ok=note`);
}

export async function deleteApplicantAction(fd: FormData) {
  const admin = await requireAdmin("applications.erase");
  const id = String(fd.get("id") ?? "");
  if (fd.get("confirm") !== "DELETE") redirect(`/admin/applications/${encodeURIComponent(id)}?error=confirm`);
  const res = await deleteApplicantData(admin.id, id);
  if (!res.ok) redirect(`/admin/applications/${encodeURIComponent(id)}?error=participant`);
  revalidatePath("/admin", "layout");
  redirect("/admin/applications?ok=deleted");
}
