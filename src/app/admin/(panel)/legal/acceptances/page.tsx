import Link from "next/link";
import { AdminHeader, Empty, Pager, Table } from "@/components/admin/ui";
import { LEGAL_DOCUMENTS, isLegalKey } from "@/content/legal";
import { requireAdmin } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { pageHref, pageNumber, pageWindow } from "@/lib/paging";
import { shortFingerprint } from "@/server/legal";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Who accepted which version, when and how. Personal data: owner only. */
export default async function AcceptanceRecordsPage({ searchParams }: Props) {
  await requireAdmin("legal.manage");
  const sp = await searchParams;
  const askedDoc = Array.isArray(sp.doc) ? sp.doc[0] : sp.doc;
  const doc = askedDoc && isLegalKey(askedDoc) ? askedDoc : undefined;
  const where = doc ? { documentKey: doc } : undefined;
  const total = await db.legalAcceptance.count({ where });
  const { page, pages, skip, take } = pageWindow(pageNumber(sp.page), total);
  const rows = await db.legalAcceptance.findMany({ where, orderBy: [{ acceptedAt: "desc" }, { id: "desc" }], skip, take, include: { user: { select: { name: true, email: true, id: true } } } });
  return (
    <>
      <AdminHeader title="Acceptance records" description="Each acceptance or acknowledgment, with the exact version and its fingerprint. Records are never edited." />
      <nav aria-label="Filter by document" className="mt-6 flex flex-wrap gap-2 text-sm">
        <Link href="/admin/legal/acceptances" className="rounded-full border border-ink-300 bg-white px-3 py-1" aria-current={!doc ? "page" : undefined}>
          All
        </Link>
        {LEGAL_DOCUMENTS.map((d) => (
          <Link key={d.key} href={`/admin/legal/acceptances?doc=${d.key}`} className="rounded-full border border-ink-300 bg-white px-3 py-1" aria-current={doc === d.key ? "page" : undefined}>
            {d.title}
          </Link>
        ))}
      </nav>
      <div className="mt-4">
        <Table head={["When (UTC)", "Person", "Document", "Kind", "How", "Fingerprint"]} empty={rows.length === 0 ? <Empty>No records.</Empty> : undefined}>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="whitespace-nowrap px-4 py-2.5 text-ink-600">{r.acceptedAt.toISOString().replace("T", " ").slice(0, 16)}</td>
              <td className="px-4 py-2.5">
                <Link href={`/admin/members/${r.user.id}`} className="underline underline-offset-2">
                  {r.user.name}
                </Link>
              </td>
              <td className="px-4 py-2.5">
                {r.documentKey} v{r.version}
              </td>
              <td className="px-4 py-2.5">{r.kind === "ACCEPTED" ? "Accepted" : "Acknowledged"}</td>
              <td className="px-4 py-2.5 text-ink-600">{r.method}</td>
              <td className="px-4 py-2.5 font-mono text-xs">{shortFingerprint(r.contentHash)}</td>
            </tr>
          ))}
        </Table>
      </div>
      <Pager page={page} pages={pages} total={total} href={(p) => pageHref("/admin/legal/acceptances", { doc }, p)} />
    </>
  );
}
