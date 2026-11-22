import { z } from "zod";

/**
 * The ONE rule for what counts as an email address on this site.
 *
 * It is used by the sign-up form and by every other place that accepts an address (changing
 * the address, inviting an administrator, the command-line account tool, the contact form),
 * so no place accepts an address that another place would refuse.
 */
export const EMAIL_MAX = 254;

/** A form field holding an email address: trimmed, lower case, checked. */
export function emailField(message = "Please enter a valid email address.") {
  return z.string().trim().toLowerCase().email(message).max(EMAIL_MAX, message);
}

const rule = emailField();

/** The cleaned address, or null when the text is not an email address. */
export function normalizeEmail(raw: unknown): string | null {
  const r = rule.safeParse(raw);
  return r.success ? r.data : null;
}
