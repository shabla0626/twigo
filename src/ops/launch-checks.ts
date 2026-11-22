// Checks of the DATABASE that must pass before the site may start in
// production (the settings themselves are checked in lib/env-schema.ts).
import type { PrismaClient } from "@prisma/client";

/**
 * Domains reserved for testing and documentation (RFC 2606 / RFC 6761). No
 * real person can receive email there, so an owner or administrator account
 * with such an address is a leftover test account. In production that is a
 * way in for anyone who knows its development password.
 */
export function isReservedTestAddress(email: string): boolean {
  const domain = email.toLowerCase().split("@").pop() ?? "";
  return /(^|\.)(test|example|invalid|localhost)$/.test(domain) || /^example\.(com|net|org)$/.test(domain) || /\.example\.(com|net|org)$/.test(domain);
}

/** Problems that must stop a production start. Empty = fine. Addresses are not printed in full. */
export async function launchProblems(db: PrismaClient): Promise<string[]> {
  const problems: string[] = [];
  const staff = await db.user.findMany({ where: { role: { in: ["OWNER", "ADMIN"] }, status: { in: ["ACTIVE", "INVITED"] } }, select: { email: true, role: true } });
  const test = staff.filter((u) => isReservedTestAddress(u.email));
  if (test.length) {
    const shown = test.map((u) => `${u.role.toLowerCase()} at @${u.email.split("@").pop()}`).join(", ");
    problems.push(`${test.length} administrator account(s) use a test address (${shown}). A production database must contain only real administrators; start from a clean database (docs/DEPLOYMENT.md, "First production start") or deactivate these accounts`);
  }
  if (!staff.some((u) => u.role === "OWNER" && !isReservedTestAddress(u.email))) {
    problems.push('there is no owner account yet; create it with: npm run admin:create -- --email <address> --name "<name>"');
  }
  return problems;
}
