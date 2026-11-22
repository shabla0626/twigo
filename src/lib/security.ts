import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { headers } from "next/headers";
import { CLIENT_ADDRESS_HEADER } from "./client-address";
import { env } from "./env";

/** Salted one-way hash of the client IP for abuse tracking (raw IPs are never stored). */
export function hashIp(ip: string): string {
  return createHmac("sha256", env().AUTH_SECRET).update(`ip:${ip}`).digest("hex").slice(0, 32);
}

/**
 * The address a request came from, for counting attempts. It is worked out by
 * server.ts (see lib/client-address.ts) and never taken from a header the
 * visitor can set, such as X-Forwarded-For.
 */
export async function clientIp(): Promise<string> {
  return (await headers()).get(CLIENT_ADDRESS_HEADER) ?? "unknown";
}

// ---- Form timing token (spam protection) -------------------------------
// A signed timestamp issued when the form is rendered. Submissions that come
// back faster than MIN_FILL_MS or later than MAX_AGE_MS are rejected.
const MIN_FILL_MS = 3_000;
const MAX_AGE_MS = 1000 * 60 * 60 * 6;

function sign(value: string) {
  return createHmac("sha256", env().AUTH_SECRET).update(`form:${value}`).digest("base64url");
}

export function issueFormToken(now = Date.now()): string {
  const ts = String(now);
  return `${ts}.${sign(ts)}`;
}

export type FormTokenCheck = "ok" | "invalid" | "too_fast" | "expired";

export function checkFormToken(token: string | undefined | null, now = Date.now()): FormTokenCheck {
  if (!token) return "invalid";
  const [ts, sig] = token.split(".");
  if (!ts || !sig || !/^\d+$/.test(ts)) return "invalid";
  const expected = Buffer.from(sign(ts));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return "invalid";
  const age = now - Number(ts);
  if (age < MIN_FILL_MS) return "too_fast";
  if (age > MAX_AGE_MS) return "expired";
  return "ok";
}
