import "server-only";
import { db } from "../db";
import { isAdminRole } from "./permissions";
import type { SessionUser } from "./session-core";

/**
 * Where a signed-in person belongs, based on their ACTUAL account and
 * application state (never on what the browser asks for):
 *   email not verified            → /verify-email
 *   administrator                 → /admin
 *   approved member               → /community
 *   no application or a draft     → /apply (continues where they stopped)
 *   submitted / reviewed / closed → /application (status page)
 * Nobody is ever sent to an unexplained "access denied" page.
 */
export async function destinationFor(user: Pick<SessionUser, "id" | "role" | "emailVerified" | "communityAccess" | "membership">): Promise<string> {
  if (!user.emailVerified) return "/verify-email";
  if (isAdminRole(user.role)) return "/admin";
  if (user.communityAccess) return "/community";
  // Membership paused or removed: the status page explains it.
  if (user.membership === "SUSPENDED" || user.membership === "REVOKED") return "/application";
  const app = await db.application.findFirst({
    where: { applicant: { userId: user.id } },
    orderBy: { createdAt: "desc" },
    select: { status: true },
  });
  return !app || app.status === "DRAFT" ? "/apply" : "/application";
}
