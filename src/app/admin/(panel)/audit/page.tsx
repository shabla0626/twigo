import Link from "next/link";
import { AdminHeader, Empty, Pager, Table, fmtDate, smallInput, smallLabel } from "@/components/admin/ui";
import { buttonClass } from "@/components/ui/primitives";
import { requireAdmin } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { pageHref, pageNumber, pageWindow } from "@/lib/paging";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function AuditPage({ searchParams }: Props) {
  await requireAdmin("audit.view");
  const sp = await searchParams;
  const areas = (await db.auditLog.groupBy({ by: ["entityType"], orderBy: { entityType: "asc" } })).map((a) => a.entityType);
  // Only a value that really exists is used as a filter; anything else shows the whole log.
  const asked = Array.isArray(sp.area) ? sp.area[0] : sp.area;
  const area = asked && areas.includes(asked) ? asked : undefined;
  const where = area ? { entityType: area } : undefined;
  const total = await db.auditLog.count({ where });
  const { page, pages, skip, take } = pageWindow(pageNumber(sp.page), total);
  const logs = await db.auditLog.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip,
    take,
    include: { actor: { select: { name: true } } },
  });
  return (
    <>
      <AdminHeader title="Audit log" description="Sensitive administrative operations, newest first. Nothing is removed from this list." />
      <form action="/admin/audit" role="search" className="mt-6 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="area" className={smallLabel}>
            Show
          </label>
          <select id="area" name="area" defaultValue={area ?? ""} className={`${smallInput} w-auto`}>
            <option value="">Everything</option>
            {areas.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className={buttonClass("secondary", "sm")}>
          Apply
        </button>
        {area && (
          <Link href="/admin/audit" className="pb-1.5 text-sm font-medium text-accent-700 underline underline-offset-2">
            Show everything
          </Link>
        )}
      </form>
      <div className="mt-4">
        <Table head={["Time", "Admin", "Action", "Entity", "Details"]} empty={logs.length === 0 ? <Empty>No entries.</Empty> : undefined}>
          {logs.map((l) => (
            <tr key={l.id}>
              <td className="whitespace-nowrap px-4 py-2.5 text-ink-600">{fmtDate(l.createdAt, true)}</td>
              <td className="px-4 py-2.5">{l.actor?.name ?? "—"}</td>
              <td className="px-4 py-2.5 font-mono text-xs">{l.action}</td>
              <td className="px-4 py-2.5 text-xs text-ink-600">
                {l.entityType}
                {l.entityId && <span className="block font-mono text-ink-500">{l.entityId}</span>}
              </td>
              <td className="px-4 py-2.5 font-mono text-xs text-ink-600">{l.metadata ? JSON.stringify(l.metadata) : ""}</td>
            </tr>
          ))}
        </Table>
      </div>
      <Pager page={page} pages={pages} total={total} href={(p) => pageHref("/admin/audit", { area }, p)} />
    </>
  );
}
