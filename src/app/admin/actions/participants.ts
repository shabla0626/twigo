"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { withFlash } from "@/lib/flash";
import { requireAdmin } from "@/lib/auth/guard";
import { formToObject, participantUpdateSchema } from "@/lib/validation/admin";
import { removeParticipant, updateParticipant } from "@/server/admin/participants";

export async function updateParticipantAction(fd: FormData) {
  const admin = await requireAdmin("participants.manage");
  const id = String(fd.get("id") ?? "");
  const parsed = participantUpdateSchema.safeParse(formToObject(fd, ["preferredCategories"]));
  if (!parsed.success) redirect(`/admin/participants/${encodeURIComponent(id)}?error=invalid`);
  await updateParticipant(admin.id, parsed.data);
  revalidatePath("/admin/participants");
  redirect(`/admin/participants/${id}?ok=saved`);
}

export async function removeParticipantAction(fd: FormData) {
  // Owner only: removing is permanent.
  const admin = await requireAdmin("participants.remove");
  const id = String(fd.get("id") ?? "");
  if (fd.get("confirm") !== "REMOVE") redirect(`/admin/participants/${encodeURIComponent(id)}?error=confirm`);
  const res = await removeParticipant(admin.id, id);
  if (!res.ok) redirect(withFlash(`/admin/participants/${encodeURIComponent(id)}`, { error: res.error }));
  revalidatePath("/admin", "layout");
  redirect("/admin/participants?ok=removed");
}
