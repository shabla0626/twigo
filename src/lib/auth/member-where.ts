import type { Prisma } from "@prisma/client";

/**
 * Database filter for "an active member of the community": the same rule as
 * SessionUser.communityAccess (active account, confirmed email, approved
 * membership; administrators are staff). Use it wherever a rule says
 * "active member", e.g. whose support counts toward creating a group.
 */
export const ACTIVE_MEMBER: Prisma.UserWhereInput = {
  status: "ACTIVE",
  emailVerifiedAt: { not: null },
  OR: [{ membershipStatus: "ACTIVE" }, { role: { in: ["OWNER", "ADMIN"] } }],
};
