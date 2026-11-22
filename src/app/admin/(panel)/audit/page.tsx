import { AdminHeader, Empty, Table, fmtDate } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/auth/guard";
import { db } from "@/lib/db";

export default async function AuditPage() {
  await requireAdmin("audit.view");
  const logs = await db.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { actor: { select: { name: true } } },
  });
  return (
    <>
      <AdminHeader title="Audit log" description="Sensitive administrative operations (latest 200)." />
      <div className="mt-6">
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
    </>
  );
}
