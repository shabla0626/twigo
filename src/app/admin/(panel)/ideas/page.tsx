import Link from "next/link";
import { AdminHeader, Empty, Flash, Table, fmtDate, smallInput } from "@/components/admin/ui";
import { Badge, buttonClass } from "@/components/ui/primitives";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/guard";
import { IDEA_CATEGORIES } from "@/lib/validation/community";
import { ideaModerationAction } from "../../actions/community";

type Props = { searchParams: Promise<Record<string, string | undefined>> };

export default async function IdeasAdminPage({ searchParams }: Props) {
  await requireAdmin("moderation.act");
  const sp = await searchParams;
  const ideas = await db.businessIdea.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      author: { select: { id: true, email: true, profile: { select: { displayName: true } } } },
      group: { select: { id: true, name: true } },
      endorsements: { orderBy: { createdAt: "asc" }, select: { createdAt: true, user: { select: { id: true, status: true, profile: { select: { displayName: true } } } } } },
    },
  });
  return (
    <>
      <AdminHeader title="Business ideas" description="All ideas, including removed ones. Endorsement records show who endorsed and when; groups are created automatically at the configured threshold." />
      <Flash ok={sp.ok} error={sp.error} />
      <div className="mt-6">
        <Table head={["Idea", "Author", "Status", "Endorsements", "Group", "Created", "Moderation"]} empty={!ideas.length && <Empty>No ideas yet.</Empty>}>
          {ideas.map((i) => (
            <tr key={i.id} className="align-top">
              <td className="max-w-sm px-4 py-3">
                <Link href={`/community/ideas/${i.id}`} className="font-medium text-accent-700 hover:underline">
                  {i.title}
                </Link>
                <p className="text-xs text-ink-500">{IDEA_CATEGORIES[i.category]}</p>
              </td>
              <td className="px-4 py-3">
                {i.author ? (
                  <Link href={`/admin/members/${i.author.id}`} className="hover:underline">
                    {i.author.profile?.displayName ?? i.author.email}
                  </Link>
                ) : (
                  "Former member"
                )}
              </td>
              <td className="px-4 py-3">
                <Badge tone={i.status === "REMOVED" ? "danger" : i.status === "GROUP_FORMED" ? "success" : "neutral"}>{i.status.replace("_", " ").toLowerCase()}</Badge>
                {i.removedReason && <p className="mt-1 text-xs text-ink-500">{i.removedReason}</p>}
              </td>
              <td className="px-4 py-3">
                <details>
                  <summary className="cursor-pointer tabular-nums">{i.endorsements.length}</summary>
                  <ul className="mt-1 space-y-0.5 text-xs text-ink-700">
                    {i.endorsements.map((e) => (
                      <li key={e.user.id}>
                        {e.user.profile?.displayName ?? "—"} {e.user.status !== "ACTIVE" && `(${e.user.status.toLowerCase()})`} · {fmtDate(e.createdAt, true)}
                      </li>
                    ))}
                  </ul>
                </details>
              </td>
              <td className="px-4 py-3">
                {i.group ? (
                  <Link href={`/admin/groups/${i.group.id}`} className="text-accent-700 hover:underline">
                    {i.group.name}
                  </Link>
                ) : (
                  "—"
                )}
              </td>
              <td className="px-4 py-3 text-ink-600">{fmtDate(i.createdAt)}</td>
              <td className="px-4 py-3">
                <form action={ideaModerationAction} className="flex flex-col gap-1">
                  <input type="hidden" name="id" value={i.id} />
                  {i.status === "REMOVED" ? (
                    <button name="action" value="restore" className={buttonClass("secondary", "sm")}>
                      Restore
                    </button>
                  ) : (
                    <>
                      <label htmlFor={`r-${i.id}`} className="sr-only">
                        Reason
                      </label>
                      <input id={`r-${i.id}`} name="reason" placeholder="Reason" maxLength={300} className={`${smallInput} w-40`} />
                      <button name="action" value="remove" className={buttonClass("danger", "sm")}>
                        Remove
                      </button>
                    </>
                  )}
                </form>
              </td>
            </tr>
          ))}
        </Table>
      </div>
    </>
  );
}
