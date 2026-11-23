"use server";

import { redirect } from "next/navigation";
import type { FormState } from "@/components/forms/action-form";
import { requireUser } from "@/lib/auth/guard";
import { pendingReacceptance, recordAcceptance } from "@/server/legal";

export async function acceptUpdatedDocumentsAction(_p: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser("/legal/review");
  const ticked = new Set(fd.getAll("versionId").map(String));
  const pending = await pendingReacceptance(user.id);
  if (pending.some((p) => !ticked.has(p.versionId))) return { error: "Please tick every document to continue." };
  for (const p of pending) {
    const rec = await recordAcceptance({ userId: user.id, key: p.key, kind: p.kind, method: "reacceptance", versionId: p.versionId });
    if (!rec) return { error: "A document changed again while you were reading. Please reload the page." };
  }
  redirect("/continue");
}
