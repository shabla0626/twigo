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

/**
 * Who may take part in a project group: an active member of the community whose account is an
 * ordinary member account. Owner and administrator accounts are staff: they never hold a group
 * membership, so they have no standing view into any group's private areas. An administrator may
 * see a group's private information only through a temporary, owner-approved investigation grant
 * that follows a report by a member of that group (src/server/admin/group-access.ts).
 */
export const GROUP_PARTICIPANT: Prisma.UserWhereInput = { ...ACTIVE_MEMBER, role: "MEMBER" };

/** Staff accounts (owner and administrators). */
export const isStaffRole = (role: string) => role === "OWNER" || role === "ADMIN";
