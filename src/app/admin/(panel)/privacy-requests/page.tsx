import Link from "next/link";
import { AdminHeader, Empty, Flash, fmtDate } from "@/components/admin/ui";
import { Badge } from "@/components/ui/primitives";
import { requireAdmin } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { readFlash } from "@/lib/flash";
import { PRIVACY_REQUEST_KINDS, PRIVACY_REQUEST_STATUSES } from "@/lib/labels";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function PrivacyRequestsPage({ searchParams }: Props) {
  await requireAdmin("privacy.requests");
  const rows = await db.privacyRequest.findMany({ orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 200 });
  return (
    <>
      <AdminHeader title="Privacy requests" description="Requests from members to access, correct or delete their information. Deletion requests arrive only after the member confirmed their identity; nothing is deleted until you review the plan and carry it out. Every change is recorded and the member is notified." />
      <Flash {...readFlash(await searchParams)} />
      <div className="mt-6 space-y-4">
        {rows.length === 0 && (
          <div className="rounded-lg border border-ink-200 bg-white">
            <Empty>No privacy requests.</Empty>
          </div>
        )}
        {rows.map((r) => (
          <article key={r.id} className="rounded-lg border border-ink-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">
                {PRIVACY_REQUEST_KINDS[r.kind]} · {r.email}
              </h2>
              <Badge tone={r.status === "COMPLETED" ? "success" : r.status === "REJECTED" ? "neutral" : "warn"}>{PRIVACY_REQUEST_STATUSES[r.status]}</Badge>
            </div>
            <p className="mt-1 text-xs text-ink-500">Received {fmtDate(r.createdAt, true)}{r.handledAt ? ` · last handled ${fmtDate(r.handledAt, true)}` : ""}</p>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-ink-800">{r.details}</p>
            {r.response && <p className="mt-2 text-sm text-ink-700">Answer: {r.response}</p>}
            <p className="mt-3 text-sm">
              {r.kind === "DELETION" && (
                <span className="mr-3 text-xs text-ink-600">{r.verifiedAt ? `Identity verified (${r.verificationMethod})` : "Identity not verified"}</span>
              )}
              <Link href={`/admin/privacy-requests/${r.id}`} className="font-medium text-accent-700 underline underline-offset-2">
                {r.kind === "DELETION" ? "Review, plan and status" : "Open"}
              </Link>
            </p>
          </article>
        ))}
      </div>
    </>
  );
}
