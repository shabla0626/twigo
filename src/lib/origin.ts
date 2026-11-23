import { env } from "@/lib/env";

/**
 * Whether a request's Origin header is this site (CSRF protection for the upload endpoint).
 *
 * The browser's Origin must be the site's public address (SITE_URL), the same rule the live
 * chat uses. It must NOT be compared with the address the server sees for itself: behind a
 * proxy, and even on this computer, that is an internal name (for example "localhost"), so
 * every upload from the real address was refused with "Invalid origin."
 */
export function uploadOriginAllowed(origin: string | null, siteUrl = env().SITE_URL): boolean {
  if (!origin) return false;
  try {
    const parsed = new URL(origin);
    // An Origin header is only scheme, host and port: anything more is not a real browser origin.
    return origin === parsed.origin && parsed.origin === new URL(siteUrl).origin;
  } catch {
    return false;
  }
}
