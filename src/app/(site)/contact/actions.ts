"use server";

import { logger } from "@/lib/logger";
import { clientIp, hashIp } from "@/lib/security";
import { submitInquiry } from "@/server/contact";

export type ContactFormState = { ok?: string; error?: string; fieldErrors?: Record<string, string[] | undefined>; values?: Record<string, string> };

const FIELDS = ["name", "email", "category", "organization", "timeline", "subject", "message", "website", "formToken"] as const;

/** Validated on the server (the same rules as before); errors come back per field. */
export async function submitInquiryAction(_prev: ContactFormState | undefined, fd: FormData): Promise<ContactFormState> {
  const values = Object.fromEntries(FIELDS.map((k) => [k, String(fd.get(k) ?? "")])) as Record<string, string>;
  try {
    const res = await submitInquiry(values, { ipHash: hashIp(await clientIp()) });
    if (res.ok) return { ok: res.message };
    // Typed answers are returned so nothing has to be retyped.
    return { error: res.error, fieldErrors: res.fieldErrors, values };
  } catch (err) {
    logger.error("inquiry.submit_failed", { err });
    return { error: "Something went wrong while sending your message. Please try again later.", values };
  }
}
