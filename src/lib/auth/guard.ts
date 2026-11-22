import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { db } from "../db";
import { env } from "../env";
import { REAUTH_MINUTES } from "./constants";
import { can, isAdminRole, type Permission } from "./permissions";
import { destinationFor } from "./destination";
import { readSessionToken } from "./session";
import { lookupSession, type SessionInfo, type SessionUser } from "./session-core";

/** Current fully authenticated session (no pending 2FA), regardless of account status. */
export const getSession = cache(async (): Promise<SessionInfo | null> => {
  const s = await lookupSession(db, await readSessionToken());
  if (!s || s.mfaPending) return null;
  return s;
});

/** The signed-in, ACTIVE user, or null. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const s = await getSession();
  return s && s.user.status === "ACTIVE" ? s.user : null;
});

function loginRedirect(next?: string): never {
  redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
}

/** Any ACTIVE account. */
export async function requireUser(next?: string): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) loginRedirect(next);
  return user;
}

export type AdminContext = SessionUser;

/** Where an administrator lands when their role does not include a page or action. */
export const NO_ACCESS_PAGE = "/admin/no-access";

/**
 * Administrators (OWNER / ADMIN). Enforces two-factor enrollment when
 * ADMIN_REQUIRE_2FA is on (default). Use in every admin page and action.
 *
 * A refusal is never shown as an error page: someone who is not an
 * administrator is sent to their own start page, and an administrator whose
 * role lacks the permission is sent to a page that says so. Either way the
 * page or action stops here and nothing is changed.
 */
export async function requireAdmin(permission: Permission = "admin.access"): Promise<AdminContext> {
  const user = await getCurrentUser();
  if (!user) loginRedirect("/admin");
  if (!isAdminRole(user.role)) redirect(await destinationFor(user));
  if (env().ADMIN_REQUIRE_2FA && !user.totpEnabled) redirect("/account/security?required=2fa");
  if (!can(user.role, permission)) redirect(NO_ACCESS_PAGE);
  return user;
}

/** Returns whether the current administrator has a permission (for showing UI). */
export async function hasPermission(permission: Permission): Promise<boolean> {
  const user = await getCurrentUser();
  return Boolean(user && can(user.role, permission));
}

/** A signed-in account whose email address is verified (applicants and members). */
export async function requireVerifiedUser(next?: string): Promise<SessionUser> {
  const user = await requireUser(next);
  if (!user.emailVerified) redirect("/verify-email");
  return user;
}

/**
 * The private member community. Requires an approved, active membership
 * (see SessionUser.communityAccess). Anyone else is sent to the page that
 * explains their situation (verify email, application, status), never to a
 * bare "access denied". A member without a profile yet sets one up first.
 */
export async function requireMember(next = "/community"): Promise<SessionUser & { displayName: string }> {
  const user = await requireUser(next);
  if (!user.communityAccess) redirect(await destinationFor(user));
  if (!user.displayName) redirect("/community/welcome");
  return user as SessionUser & { displayName: string };
}

/** True when the current session confirmed the password/2FA within the reauth window. */
export async function isRecentlyAuthenticated(): Promise<boolean> {
  const s = await getSession();
  return Boolean(s?.reauthAt && Date.now() - s.reauthAt.getTime() < REAUTH_MINUTES * 60_000);
}

/** Sensitive actions: redirect to the confirmation page unless recently confirmed. */
export async function requireRecentAuth(returnTo: string) {
  if (!(await isRecentlyAuthenticated())) redirect(`/account/confirm?next=${encodeURIComponent(returnTo)}`);
}
