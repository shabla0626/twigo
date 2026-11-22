import "server-only";
import { db } from "@/lib/db";
import { env, siteUrl } from "@/lib/env";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { checkFormToken } from "@/lib/security";
import { deliverTemplate } from "@/lib/email";
import { INQUIRY_CATEGORIES } from "@/lib/labels";
import { contactSchema } from "@/lib/validation/contact";

export type ContactResult =
  | { ok: true; message: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

const OK = "Thank you. Your message has been received and will be read by a member of the team.";

export async function submitInquiry(input: unknown, ctx: { ipHash: string; now?: number }): Promise<ContactResult> {
  const parsed = contactSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please correct the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  const data = parsed.data;
  if (data.website) return { ok: true, message: OK };
  const token = checkFormToken(data.formToken, ctx.now);
  if (token !== "ok") {
    return { ok: false, error: token === "expired" ? "This form has expired. Please reload the page." : "We could not verify this submission. Please try again." };
  }
  const limit = rateLimit(`contact:${ctx.ipHash}`, 5, 60 * 60_000, ctx.now);
  if (!limit.ok) return { ok: false, error: "Too many messages from your network. Please try again later." };

  const inquiry = await db.contactInquiry.create({
    data: {
      name: data.name,
      email: data.email,
      category: data.category,
      subject: data.subject,
      message: data.message,
      organization: data.organization ?? null,
      timeline: data.timeline ?? null,
      ipHash: ctx.ipHash,
    },
    select: { id: true },
  });
  logger.info("inquiry.created", { inquiryId: inquiry.id });

  const e = env();
  if (e.ADMIN_NOTIFICATION_EMAIL) {
    await deliverTemplate("admin_new_inquiry", e.ADMIN_NOTIFICATION_EMAIL, {
      adminUrl: siteUrl("/admin/inquiries"),
      category: INQUIRY_CATEGORIES[data.category],
    });
  }
  return { ok: true, message: OK };
}
