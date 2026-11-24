"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FormState } from "@/components/forms/action-form";
import { isLegalKey } from "@/content/legal";
import { requireAdmin } from "@/lib/auth/guard";
import { withFlash } from "@/lib/flash";
import { addEntry, createReport, publishReport } from "@/server/community-support";
import { changeStatus, createDraftVersion, editDraft } from "@/server/legal";
import { NOTICE_KEYS, saveNotices, type Notices } from "@/server/legal-notices";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");

// ---------------------------------------------------------------- legal documents (owner)

export async function newDraftAction(fd: FormData) {
  const owner = await requireAdmin("legal.manage");
  const key = str(fd, "key");
  if (!isLegalKey(key)) redirect("/admin/legal");
  const res = await createDraftVersion(owner.id, key);
  redirect(withFlash(`/admin/legal/${key}`, res.ok ? { ok: "A new draft was created from the latest text." } : { error: res.error }));
}

export async function saveDraftTextAction(_p: FormState, fd: FormData): Promise<FormState> {
  const owner = await requireAdmin("legal.manage");
  const res = await editDraft(owner.id, str(fd, "versionId"), {
    content: str(fd, "content"),
    changeSummary: str(fd, "changeSummary"),
    materialChange: fd.get("materialChange") === "on",
    requiresReacceptance: fd.get("requiresReacceptance") === "on",
  });
  if (!res.ok) return { error: res.error };
  revalidatePath("/admin/legal", "layout");
  return { ok: "Draft saved. Its fingerprint was updated." };
}

export async function legalStatusAction(fd: FormData) {
  const owner = await requireAdmin("legal.manage");
  const key = str(fd, "key");
  const to = str(fd, "to") as "PENDING_LEGAL_REVIEW" | "APPROVED" | "PUBLISHED" | "DRAFT";
  if (!["PENDING_LEGAL_REVIEW", "APPROVED", "PUBLISHED", "DRAFT"].includes(to)) redirect("/admin/legal");
  if (to === "APPROVED" && fd.get("reviewed") !== "on") {
    redirect(withFlash(`/admin/legal/${key}`, { error: "Approve only after a qualified lawyer reviewed this exact version: tick the box and say who reviewed it." }));
  }
  const eff = str(fd, "effectiveDate");
  const res = await changeStatus(owner.id, str(fd, "versionId"), to, { approvalNote: str(fd, "approvalNote"), effectiveDate: eff ? new Date(`${eff}T00:00:00Z`) : null });
  revalidatePath("/", "layout");
  redirect(withFlash(`/admin/legal/${key}`, res.ok ? { ok: "Status changed." } : { error: res.error }));
}

export async function saveNoticesAction(_p: FormState, fd: FormData): Promise<FormState> {
  const owner = await requireAdmin("legal.manage");
  const input = Object.fromEntries(NOTICE_KEYS.map((k) => [k, { value: str(fd, `${k}_value`), confirmed: fd.get(`${k}_confirmed`) === "on" }])) as Notices;
  await saveNotices(owner.id, input);
  revalidatePath("/legal/notices");
  return { ok: "Legal notices saved. Only fields marked confirmed are public." };
}

// ---------------------------------------------------------------- community support (owner)

export async function addSupportEntryAction(_p: FormState, fd: FormData): Promise<FormState> {
  const owner = await requireAdmin("support.manage");
  const res = await addEntry(owner.id, {
    kind: str(fd, "kind"),
    amount: str(fd, "amount"),
    currency: str(fd, "currency"),
    occurredOn: str(fd, "occurredOn"),
    description: str(fd, "description"),
    contributorName: str(fd, "contributorName"),
  });
  if (!res.ok) return { error: res.error };
  revalidatePath("/admin/support");
  return { ok: "Entry recorded. It is private; only published report totals are public." };
}

export async function createSupportReportAction(_p: FormState, fd: FormData): Promise<FormState> {
  const owner = await requireAdmin("support.manage");
  const res = await createReport(owner.id, { title: str(fd, "title"), periodStart: str(fd, "periodStart"), periodEnd: str(fd, "periodEnd"), currency: str(fd, "currency"), note: str(fd, "note") });
  if (!res.ok) return { error: res.error };
  revalidatePath("/admin/support");
  return { ok: "Report created. Publish it when the figures are final." };
}

export async function publishSupportReportAction(fd: FormData) {
  const owner = await requireAdmin("support.manage");
  if (fd.get("confirm") !== "on") redirect(withFlash("/admin/support", { error: "Tick the box to confirm the figures are final." }));
  const res = await publishReport(owner.id, str(fd, "id"));
  revalidatePath("/support");
  redirect(withFlash("/admin/support", res.ok ? { ok: "Report published. Its totals are now frozen and public." } : { error: res.error }));
}

// ---------------------------------------------------------------- privacy requests (owner)

export async function privacyRequestStatusAction(fd: FormData) {
  const owner = await requireAdmin("privacy.requests");
  const id = str(fd, "id");
  const back = str(fd, "back") === "detail" ? `/admin/privacy-requests/${id}` : "/admin/privacy-requests";
  const { updatePrivacyRequest } = await import("@/server/privacy-deletion");
  const res = await updatePrivacyRequest(owner.id, {
    id,
    status: str(fd, "status"),
    response: str(fd, "response"),
    ...(fd.has("adminNotes") ? { adminNotes: str(fd, "adminNotes") } : {}),
  });
  redirect(withFlash(back, res.ok ? { ok: "Request updated. The member sees the new status on their Privacy & data page (and in the app, if they have community access)." } : { error: res.error }));
}

/** Carries out an approved deletion request (privacy.erase; exceptions are the owner's). Needs a fresh identity check. */
export async function executeDeletionAction(fd: FormData) {
  const actor = await requireAdmin("privacy.erase");
  const id = str(fd, "id");
  const back = `/admin/privacy-requests/${id}`;
  const { getSession, isRecentlyAuthenticated } = await import("@/lib/auth/guard");
  if (!(await isRecentlyAuthenticated())) redirect(`/account/confirm?next=${encodeURIComponent(back)}`);
  const session = await getSession();
  const { executeDeletion } = await import("@/server/privacy-deletion");
  const res = await executeDeletion(actor.id, { id, phrase: str(fd, "phrase") }, { reauthAt: session?.reauthAt ?? null });
  if (!res.ok) redirect(withFlash(back, { error: res.error }));
  const notice = !res.email
    ? "No completion email was sent (the address was never confirmed)."
    : res.email.status === "sent"
      ? "The completion notice was handed to the email system (see its delivery status below; provider acceptance is not inbox delivery)."
      : `The completion notice was NOT sent (${res.email.status}); see the delivery status below and retry it from Admin, Email.`;
  redirect(withFlash(back, { ok: `Deletion carried out. ${notice}` }));
}

/** The owner sets or clears a legal hold on a privacy request. */
export async function legalHoldAction(fd: FormData) {
  const owner = await requireAdmin("privacy.requests");
  const id = str(fd, "id");
  const { setLegalHold } = await import("@/server/privacy-deletion");
  const res = await setLegalHold(owner.id, id, str(fd, "hold") === "set", str(fd, "reason"));
  redirect(withFlash(`/admin/privacy-requests/${id}`, res.ok ? { ok: str(fd, "hold") === "set" ? "Legal hold set." : "Legal hold cleared." } : { error: res.error }));
}
