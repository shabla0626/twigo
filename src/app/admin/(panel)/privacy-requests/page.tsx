import { AdminHeader, Empty, Flash, fmtDate, smallInput } from "@/components/admin/ui";
import { Badge, buttonClass } from "@/components/ui/primitives";
import { requireAdmin } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { readFlash } from "@/lib/flash";
import { PRIVACY_REQUEST_KINDS, PRIVACY_REQUEST_STATUSES } from "@/lib/labels";
import { privacyRequestStatusAction } from "../../actions/twigo";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function PrivacyRequestsPage({ searchParams }: Props) {
  await requireAdmin("privacy.requests");
  const rows = await db.privacyRequest.findMany({ orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 200 });
  return (
    <>
      <AdminHeader title="Privacy requests" description="Requests from members to access, correct or delete their information, or similar. Every change is recorded. The self-service download stays available to members." />
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
              <Badge tone={r.status === "OPEN" ? "warn" : r.status === "COMPLETED" ? "success" : "neutral"}>{PRIVACY_REQUEST_STATUSES[r.status]}</Badge>
            </div>
            <p className="mt-1 text-xs text-ink-500">Received {fmtDate(r.createdAt, true)}{r.handledAt ? ` · last handled ${fmtDate(r.handledAt, true)}` : ""}</p>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-ink-800">{r.details}</p>
            {r.response && <p className="mt-2 text-sm text-ink-700">Answer: {r.response}</p>}
            <form action={privacyRequestStatusAction} className="mt-3 flex flex-wrap items-end gap-2">
              <input type="hidden" name="id" value={r.id} />
              <label htmlFor={`st-${r.id}`} className="sr-only">
                Status
              </label>
              <select id={`st-${r.id}`} name="status" defaultValue={r.status} className={`${smallInput} w-auto`}>
                {Object.entries(PRIVACY_REQUEST_STATUSES).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
              <label htmlFor={`resp-${r.id}`} className="sr-only">
                Answer to the member
              </label>
              <input id={`resp-${r.id}`} name="response" defaultValue={r.response ?? ""} placeholder="What was done (shown to the member)" maxLength={2000} className={`${smallInput} min-w-64 flex-1`} />
              <button type="submit" className={buttonClass("secondary", "sm")}>
                Save
              </button>
            </form>
          </article>
        ))}
      </div>
    </>
  );
}
