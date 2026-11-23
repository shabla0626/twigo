"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PrivacyRequestStatus } from "@prisma/client";
import type { FormState } from "@/components/forms/action-form";
import { isLegalKey } from "@/content/legal";
import { audit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth/guard";
import { db } from "@/lib/db";
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
  const status = str(fd, "status") as PrivacyRequestStatus;
  if (!["OPEN", "IN_PROGRESS", "COMPLETED", "REJECTED"].includes(status)) redirect("/admin/privacy-requests");
  const response = str(fd, "response").trim().slice(0, 2000);
  if ((status === "COMPLETED" || status === "REJECTED") && response.length < 5) {
    redirect(withFlash("/admin/privacy-requests", { error: "Write what was done (or why the request is refused) before closing it." }));
  }
  await db.privacyRequest.update({ where: { id }, data: { status, response: response || null, handledById: owner.id, handledAt: new Date() } });
  await audit(owner.id, "privacy.request_updated", "PrivacyRequest", id, { status });
  redirect(withFlash("/admin/privacy-requests", { ok: "Request updated." }));
}
