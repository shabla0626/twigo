import Link from "next/link";
import { MEMBERSHIP_LABELS } from "@/lib/labels";
import type { AccountStatus, CommunityMembership } from "@prisma/client";
import { MEMBER_LISTS, accountTypeLabel, memberListWhere, type MemberList } from "@/server/admin/members";
import { AdminHeader, Empty, Flash, Table, fmtDate, smallInput } from "@/components/admin/ui";
import { readFlash } from "@/lib/flash";
import { Badge, buttonClass } from "@/components/ui/primitives";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/guard";

const ACCOUNT_STATUS_LABELS: Record<AccountStatus, string> = { INVITED: "Invited", ACTIVE: "Active", SUSPENDED: "Suspended", DEACTIVATED: "Deactivated" };
const TONE = { INVITED: "warn", ACTIVE: "success", SUSPENDED: "danger", DEACTIVATED: "neutral" } as const;

type Props = { searchParams: Promise<Record<string, string | undefined>> };

export default async function MembersAdminPage({ searchParams }: Props) {
  await requireAdmin("members.view");
  const sp = await searchParams;
  const status = sp.status && sp.status in ACCOUNT_STATUS_LABELS ? (sp.status as AccountStatus) : undefined;
  const access = sp.access && sp.access in MEMBERSHIP_LABELS ? (sp.access as CommunityMembership) : undefined;
  const show: MemberList = sp.show && sp.show in MEMBER_LISTS ? (sp.show as MemberList) : "members";
  const q = sp.q?.trim().slice(0, 100);
  const where = memberListWhere({ show, status, access, q });
  const lists = Object.keys(MEMBER_LISTS) as MemberList[];
  const listCounts = await Promise.all(lists.map((l) => db.user.count({ where: memberListWhere({ show: l }) })));
  const [users, counts] = await Promise.all([
    db.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true, email: true, name: true, role: true, status: true, createdAt: true, lastLoginAt: true, totpEnabledAt: true, emailVerifiedAt: true, membershipStatus: true,
        profile: { select: { displayName: true } },
        _count: { select: { memberships: { where: { status: "ACTIVE" } }, ideas: true } },
      },
    }),
    db.user.groupBy({ by: ["status"], where: memberListWhere({ show }), _count: true }),
  ]);
  const count = (s: AccountStatus) => counts.find((c) => c.status === s)?._count ?? 0;
  return (
    <>
      <AdminHeader title={MEMBER_LISTS[show].label} description={`${MEMBER_LISTS[show].description} ${users.length} shown.`} />
      <Flash {...readFlash(sp)} />
      <div className="mt-6 flex flex-wrap items-center gap-2" role="group" aria-label="Which accounts to show">
        {lists.map((l, i) => (
          <Link key={l} href={`/admin/members?show=${l}`} aria-current={show === l ? "page" : undefined} className={buttonClass(show === l ? "primary" : "secondary", "sm")}>
            {MEMBER_LISTS[l].label} ({listCounts[i]})
          </Link>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-ink-600">Account:</span>
        <Link href={`/admin/members?show=${show}`} className={`rounded px-2 py-1 ${!status ? "bg-ink-200 font-medium" : "hover:bg-ink-100"}`}>
          any
        </Link>
        {(Object.keys(ACCOUNT_STATUS_LABELS) as AccountStatus[])
          .filter((s) => count(s) > 0 || status === s)
          .map((s) => (
            <Link key={s} href={`/admin/members?show=${show}&status=${s}`} className={`rounded px-2 py-1 ${status === s ? "bg-ink-200 font-medium" : "hover:bg-ink-100"}`}>
              {ACCOUNT_STATUS_LABELS[s].toLowerCase()} ({count(s)})
            </Link>
          ))}
        {access && <span className="rounded bg-ink-200 px-2 py-1 font-medium">community access: {MEMBERSHIP_LABELS[access].toLowerCase()}</span>}
        <form className="ml-auto flex gap-2" action="/admin/members">
          <input type="hidden" name="show" value={show} />
          {status && <input type="hidden" name="status" value={status} />}
          {access && <input type="hidden" name="access" value={access} />}
          <label htmlFor="q" className="sr-only">
            Search
          </label>
          <input id="q" name="q" defaultValue={q} placeholder="Name or email" className={`${smallInput} w-56`} />
          <button className={buttonClass("secondary", "sm")}>Search</button>
        </form>
      </div>
      <div className="mt-4">
        <Table head={["Name", "Email", "Account type", "Account", "Community access", "Groups", "Ideas", "Last sign-in", "2FA"]} empty={!users.length && <Empty>No accounts match.</Empty>}>
          {users.map((u) => (
            <tr key={u.id}>
              <td className="px-4 py-3">
                <Link href={`/admin/members/${u.id}`} className="font-medium text-accent-700 hover:underline">
                  {u.profile?.displayName ?? u.name}
                </Link>
              </td>
              <td className="px-4 py-3 text-ink-700">{u.email}</td>
              <td className="px-4 py-3">{accountTypeLabel(u.role)}</td>
              <td className="px-4 py-3">
                <Badge tone={TONE[u.status]}>{ACCOUNT_STATUS_LABELS[u.status]}</Badge>
                {!u.emailVerifiedAt && <span className="mt-1 block text-xs text-ink-500">email not confirmed</span>}
              </td>
              <td className="px-4 py-3">{u.role === "MEMBER" ? MEMBERSHIP_LABELS[u.membershipStatus] : "Staff"}</td>
              <td className="px-4 py-3 tabular-nums">{u._count.memberships}</td>
              <td className="px-4 py-3 tabular-nums">{u._count.ideas}</td>
              <td className="px-4 py-3 text-ink-600">{fmtDate(u.lastLoginAt)}</td>
              <td className="px-4 py-3">{u.totpEnabledAt ? "On" : "—"}</td>
            </tr>
          ))}
        </Table>
      </div>
    </>
  );
}
