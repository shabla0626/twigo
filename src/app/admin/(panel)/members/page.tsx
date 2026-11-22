import Link from "next/link";
import { MEMBERSHIP_LABELS } from "@/lib/labels";
import type { AccountStatus, Prisma } from "@prisma/client";
import { AdminHeader, Empty, Flash, Table, fmtDate, smallInput } from "@/components/admin/ui";
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
  const q = sp.q?.trim().slice(0, 100);
  const where: Prisma.UserWhereInput = {
    ...(status ? { status } : {}),
    ...(q ? { OR: [{ email: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }, { profile: { displayName: { contains: q, mode: "insensitive" } } }] } : {}),
  };
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
    db.user.groupBy({ by: ["status"], _count: true }),
  ]);
  const count = (s: AccountStatus) => counts.find((c) => c.status === s)?._count ?? 0;
  return (
    <>
      <AdminHeader title="Members" description="Accounts of approved members and administrators. Invitations are sent from an accepted application." />
      <Flash ok={sp.ok} error={sp.error} />
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <Link href="/admin/members" className={buttonClass(!status ? "primary" : "secondary", "sm")}>
          All
        </Link>
        {(Object.keys(ACCOUNT_STATUS_LABELS) as AccountStatus[]).map((s) => (
          <Link key={s} href={`/admin/members?status=${s}`} className={buttonClass(status === s ? "primary" : "secondary", "sm")}>
            {ACCOUNT_STATUS_LABELS[s]} ({count(s)})
          </Link>
        ))}
        <form className="ml-auto flex gap-2" action="/admin/members">
          {status && <input type="hidden" name="status" value={status} />}
          <label htmlFor="q" className="sr-only">
            Search
          </label>
          <input id="q" name="q" defaultValue={q} placeholder="Name or email" className={`${smallInput} w-56`} />
          <button className={buttonClass("secondary", "sm")}>Search</button>
        </form>
      </div>
      <div className="mt-4">
        <Table head={["Name", "Email", "Role", "Account", "Community access", "Groups", "Ideas", "Last sign-in", "2FA"]} empty={!users.length && <Empty>No accounts match.</Empty>}>
          {users.map((u) => (
            <tr key={u.id}>
              <td className="px-4 py-3">
                <Link href={`/admin/members/${u.id}`} className="font-medium text-accent-700 hover:underline">
                  {u.profile?.displayName ?? u.name}
                </Link>
              </td>
              <td className="px-4 py-3 text-ink-700">{u.email}</td>
              <td className="px-4 py-3">{u.role === "MEMBER" ? "Member" : u.role === "OWNER" ? "Owner" : "Admin"}</td>
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
