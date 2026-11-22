import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

/**
 * One-time messages shown at the top of a page after an action ("Changes saved.").
 *
 * The message travels in the page address. A page must never display whatever text an address
 * happens to contain: anyone could then write a link that shows a false message on this site.
 * So a page displays a message only in two cases:
 *
 *   1. it is one of the fixed codes below (`?ok=saved`), or
 *   2. this site itself wrote it within the last few minutes. That is proven by a signature
 *      made with the site's secret, which nobody outside the server can produce.
 *
 * Anything else in the address is ignored.
 */

const OK_CODES: Record<string, string> = {
  status: "Status updated.",
  note: "Note added.",
  deleted: "Deleted.",
  saved: "Changes saved.",
  removed: "Participant removed.",
  created: "Project created.",
  role: "Role added.",
  role_deleted: "Role removed.",
  assigned: "Participant assigned.",
  assignment: "Assignment updated.",
  milestone: "Milestone updated.",
  milestone_deleted: "Milestone removed.",
  compensation: "Compensation record saved.",
  "compensation-removed": "Compensation agreement removed.",
  reset: "Section reset to default content.",
};

const ERROR_CODES: Record<string, string> = {
  note: "Note cannot be empty.",
  confirm: "Confirmation text did not match. Nothing was changed.",
  participant: "This person is a participant. Remove the participant record first.",
  invalid: "Some values were invalid. Nothing was saved.",
};

/** How long a written message stays valid. Long enough for the next page to load, not longer. */
export const FLASH_MAX_AGE_MS = 5 * 60_000;

export type Flash = { ok?: string; error?: string };

function mac(ts: string, msg: Flash): Buffer {
  return createHmac("sha256", env().AUTH_SECRET).update(`flash\n${ts}\n${msg.ok ?? ""}\n${msg.error ?? ""}`).digest();
}

/** The part of an address that carries a message written by this site: `ok=…&sig=…`. */
export function flashQuery(msg: Flash, now = Date.now()): string {
  if (!msg.ok && !msg.error) return "";
  const parts: string[] = [];
  if (msg.ok) parts.push(`ok=${encodeURIComponent(msg.ok)}`);
  if (msg.error) parts.push(`error=${encodeURIComponent(msg.error)}`);
  const ts = now.toString(36);
  parts.push(`sig=${ts}.${mac(ts, msg).toString("base64url")}`);
  return parts.join("&");
}

/** `path` with the message added (the path may already have a query). */
export function withFlash(path: string, msg: Flash, now = Date.now()): string {
  const q = flashQuery(msg, now);
  return q ? `${path}${path.includes("?") ? "&" : "?"}${q}` : path;
}

function signedByUs(sig: string | undefined, msg: Flash, now: number): boolean {
  if (!sig) return false;
  const dot = sig.indexOf(".");
  if (dot < 1) return false;
  const ts = sig.slice(0, dot);
  const written = parseInt(ts, 36);
  if (!Number.isFinite(written) || written > now + 60_000 || now - written > FLASH_MAX_AGE_MS) return false;
  let given: Buffer;
  try {
    given = Buffer.from(sig.slice(dot + 1), "base64url");
  } catch {
    return false;
  }
  const expected = mac(ts, msg);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** The message a page may display, taken from its address. Unknown or unsigned text is dropped. */
export function readFlash(sp: Record<string, string | string[] | undefined>, now = Date.now()): Flash {
  const one = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v) || undefined;
  };
  const raw: Flash = { ok: one("ok"), error: one("error") };
  if (!raw.ok && !raw.error) return {};
  const trusted = signedByUs(one("sig"), raw, now);
  const text = (value: string | undefined, codes: Record<string, string>) => (value ? (Object.hasOwn(codes, value) ? codes[value] : trusted ? value : undefined) : undefined);
  return { ok: text(raw.ok, OK_CODES), error: text(raw.error, ERROR_CODES) };
}
