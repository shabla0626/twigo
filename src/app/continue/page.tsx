import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/guard";
import { destinationFor } from "@/lib/auth/destination";
import { isAdminRole } from "@/lib/auth/permissions";
import { safeNext } from "@/lib/auth/safe-next";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | undefined>> };

/**
 * One place decides where a signed-in person goes, from their real account
 * state (see destinationFor). A requested page ("next") is honored only when
 * that person is actually allowed to open it; the pages themselves check
 * permissions again on the server.
 */
export default async function ContinuePage({ searchParams }: Props) {
  const sp = await searchParams;
  const s = await getSession();
  if (!s || s.user.status !== "ACTIVE") redirect("/login");
  const user = s.user;
  const dest = await destinationFor(user);
  const next = safeNext(sp.next);
  const allowed =
    user.emailVerified &&
    ((next.startsWith("/admin") && isAdminRole(user.role)) ||
      (next.startsWith("/community") && user.communityAccess) ||
      next.startsWith("/account") ||
      next === "/application" ||
      (next === "/apply" && dest === "/apply"));
  const target = next && allowed ? next : dest;
  redirect(sp.verified && (target === "/apply" || target === "/community") ? `${target}?verified=1` : target);
}
