import Link from "next/link";
import { AdminHeader, Flash, Panel, Table, fmtDate } from "@/components/admin/ui";
import { Badge } from "@/components/ui/primitives";
import { requireAdmin } from "@/lib/auth/guard";
import { readFlash } from "@/lib/flash";
import { STATUS_LABELS, adminLegalOverview, shortFingerprint } from "@/server/legal";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function AdminLegalPage({ searchParams }: Props) {
  await requireAdmin("legal.manage");
  const docs = await adminLegalOverview();
  return (
    <>
      <AdminHeader
        title="Legal documents"
        description="Every policy, its versions and their status. A version moves Draft → Pending legal review → Approved (only after a lawyer reviewed it) → Published. Nothing is approved automatically."
      />
      <Flash {...readFlash(await searchParams)} />
      <Panel className="mt-6">
        <Table head={["Document", "Shown to visitors", "Versions", "Acceptances", ""]}>
          {docs.map((d) => {
            const published = d.versions.find((v) => v.status === "PUBLISHED");
            const shown = published ?? d.versions.find((v) => ["APPROVED", "PENDING_LEGAL_REVIEW"].includes(v.status));
            return (
              <tr key={d.id}>
                <td className="px-4 py-3 font-medium text-ink-950">{d.title}</td>
                <td className="px-4 py-3">
                  {shown ? (
                    <Badge tone={shown.status === "PUBLISHED" ? "success" : "warn"}>
                      v{shown.version} · {STATUS_LABELS[shown.status]}
                    </Badge>
                  ) : (
                    "Nothing (draft only)"
                  )}
                  {shown && <span className="ml-2 font-mono text-xs text-ink-500">{shortFingerprint(shown.contentHash)}</span>}
                </td>
                <td className="px-4 py-3 text-ink-700">
                  {d.versions.length} (latest {fmtDate(d.versions[0]?.createdAt)})
                </td>
                <td className="px-4 py-3 tabular-nums">{d.versions.reduce((n, v) => n + v._count.acceptances, 0)}</td>
                <td className="px-4 py-3">
                  <Link href={`/admin/legal/${d.key}`} className="text-sm font-medium text-accent-700 underline underline-offset-2">
                    Manage
                  </Link>
                </td>
              </tr>
            );
          })}
        </Table>
      </Panel>
    </>
  );
}
