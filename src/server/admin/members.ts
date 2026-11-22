import "server-only";
import type { AccountStatus, CommunityMembership, Prisma } from "@prisma/client";

/**
 * The lists on the admin "Members" page. Each counter that links to one of
 * these lists is computed with the same filter, so a number and the list it
 * opens can never disagree.
 *
 * members    – people whose application was approved (community access active, paused or removed)
 * applicants – accounts without community access yet (not approved, or no application)
 * staff      – the owner and administrators
 * all        – every account
 */
export const MEMBER_LISTS = {
  members: { label: "Members", description: "People whose application was approved. Their community access can be active, paused or removed." },
  applicants: { label: "Applicants", description: "Accounts that do not have community access: people who registered or applied and are not (or not yet) approved." },
  staff: { label: "Staff", description: "The owner and the administrators." },
  all: { label: "All accounts", description: "Every account on the site." },
} as const;
export type MemberList = keyof typeof MEMBER_LISTS;

export function memberListWhere(opts: { show?: MemberList; status?: AccountStatus; access?: CommunityMembership; q?: string } = {}): Prisma.UserWhereInput {
  const show = opts.show ?? "members";
  const base: Prisma.UserWhereInput =
    show === "members"
      ? { role: "MEMBER", membershipStatus: { not: "NONE" } }
      : show === "applicants"
        ? { role: "MEMBER", membershipStatus: "NONE" }
        : show === "staff"
          ? { role: { in: ["OWNER", "ADMIN"] } }
          : {};
  return {
    AND: [
      base,
      opts.status ? { status: opts.status } : {},
      opts.access ? { membershipStatus: opts.access } : {},
      opts.q ? { OR: [{ email: { contains: opts.q, mode: "insensitive" } }, { name: { contains: opts.q, mode: "insensitive" } }, { profile: { displayName: { contains: opts.q, mode: "insensitive" } } }] } : {},
    ],
  };
}

/** People who can use the member community right now (the "Members with access" counter on the overview). */
export const MEMBERS_WITH_ACCESS = { show: "members", status: "ACTIVE", access: "ACTIVE" } as const;
export const MEMBERS_WITH_ACCESS_HREF = "/admin/members?show=members&status=ACTIVE&access=ACTIVE";

/** What kind of account this is, in words that cannot be mistaken for "is a member of the community". */
export function accountTypeLabel(role: string): string {
  return role === "OWNER" ? "Owner" : role === "ADMIN" ? "Administrator" : "Member account";
}
