"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/guard";
import { withFlash } from "@/lib/flash";
import { decideGroupAccess, requestGroupAccess, revokeGroupAccess } from "@/server/admin/group-access";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");
/** "2026-11-24T14:30" from a datetime-local field, read as UTC (the form says so). */
const utc = (v: string) => (v ? new Date(/Z$|[+-]\d\d:\d\d$/.test(v) ? v : `${v}:00Z`) : undefined);

/** An administrator asks the owner for temporary access (the group comes from the report, never from the form). */
export async function requestGroupAccessAction(fd: FormData) {
  const admin = await requireAdmin("group_access.request");
  const reportId = str(fd, "reportId");
  const res = await requestGroupAccess(admin.id, { reportId, reason: str(fd, "reason"), scope: fd.getAll("scope").map(String), hours: str(fd, "hours") });
  if (!res.ok) redirect(withFlash(`/admin/group-access/new?report=${encodeURIComponent(reportId)}`, { error: res.error }));
  redirect(withFlash(`/admin/group-access/${res.id}`, { ok: "Request sent to the owner. Nothing is visible until the owner approves it." }));
}

/** The owner approves (information, start and end) or rejects. */
export async function decideGroupAccessAction(fd: FormData) {
  const owner = await requireAdmin("group_access.approve");
  const id = str(fd, "id");
  const res = await decideGroupAccess(owner.id, {
    id,
    decision: str(fd, "decision"),
    scope: fd.getAll("scope").map(String),
    startsAt: utc(str(fd, "startsAt")),
    expiresAt: utc(str(fd, "expiresAt")),
    note: str(fd, "note"),
  });
  redirect(withFlash(`/admin/group-access/${id}`, res.ok ? { ok: str(fd, "decision") === "approve" ? "Access approved for the period you set." : "Request rejected." } : { error: res.error }));
}

/** The owner ends approved access now. */
export async function revokeGroupAccessAction(fd: FormData) {
  const owner = await requireAdmin("group_access.approve");
  const id = str(fd, "id");
  const res = await revokeGroupAccess(owner.id, id);
  redirect(withFlash(`/admin/group-access/${id}`, res.ok ? { ok: "Access ended." } : { error: res.error }));
}
