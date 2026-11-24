import "server-only";
import type { PrivacyRequestKind } from "@prisma/client";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";

/** Members' privacy requests. Handled by the owner; every change is in the audit log. */
const schema = z.object({
  kind: z.enum(["ACCESS", "CORRECTION", "DELETION", "WITHDRAW_CONSENT", "OBJECTION", "OTHER"]),
  details: z.string().trim().min(10, "Describe your request in a sentence or two.").max(4000),
});

/** At most this many unanswered requests per person (stops accidental duplicates and flooding). */
export const MAX_OPEN_REQUESTS = 3;

export async function submitPrivacyRequest(userId: string, raw: unknown) {
  const p = schema.safeParse(raw);
  if (!p.success) return { ok: false as const, error: p.error.issues[0]?.message ?? "Some values are not valid." };
  // Account and personal-data deletion has its own verified path (Request deletion); it is not a free-text request.
  if (p.data.kind === "DELETION") return { ok: false as const, error: "To delete your account and personal data, use “Request deletion” on this page." };
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } });
  const open = await db.privacyRequest.count({ where: { userId, status: { in: ["OPEN", "IN_PROGRESS", "VERIFICATION_REQUIRED", "INFO_REQUIRED"] } } });
  if (open >= MAX_OPEN_REQUESTS) return { ok: false as const, error: "You already have several open requests. Please wait for an answer." };
  const r = await db.privacyRequest.create({ data: { userId, email: user.email, kind: p.data.kind as PrivacyRequestKind, details: p.data.details } });
  await audit(userId, "privacy.request_submitted", "PrivacyRequest", r.id, { kind: r.kind });
  return { ok: true as const };
}

export function myPrivacyRequests(userId: string) {
  return db.privacyRequest.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, select: { id: true, kind: true, status: true, details: true, response: true, createdAt: true, handledAt: true, completedAt: true } });
}
