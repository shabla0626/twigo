import { AdminHeader, Empty, fmtDate, smallInput } from "@/components/admin/ui";
import { Badge, buttonClass } from "@/components/ui/primitives";
import { requireAdmin } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { INQUIRY_CATEGORIES, INQUIRY_STATUSES } from "@/lib/labels";
import { inquiryStatusAction } from "../../actions/content";

export default async function InquiriesPage() {
  await requireAdmin("inquiries.manage");
  const inquiries = await db.contactInquiry.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
  return (
    <>
      <AdminHeader title="Contact inquiries" description="Messages from the public contact form (latest 200)." />
      <div className="mt-6 space-y-4">
        {inquiries.length === 0 && (
          <div className="rounded-lg border border-ink-200 bg-white">
            <Empty>No inquiries yet.</Empty>
          </div>
        )}
        {inquiries.map((q) => (
          <article key={q.id} className="rounded-lg border border-ink-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">{q.subject}</h2>
                <p className="text-sm text-ink-600">
                  {q.name} ·{" "}
                  <a href={`mailto:${q.email}`} className="text-accent-700 hover:underline">
                    {q.email}
                  </a>{" "}
                  · {fmtDate(q.createdAt, true)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={q.category === "BUSINESS" ? "accent" : "neutral"}>{INQUIRY_CATEGORIES[q.category]}</Badge>
                <form action={inquiryStatusAction} className="flex items-center gap-1">
                  <input type="hidden" name="id" value={q.id} />
                  <label htmlFor={`st-${q.id}`} className="sr-only">
                    Status
                  </label>
                  <select id={`st-${q.id}`} name="status" defaultValue={q.status} className={`${smallInput} w-auto py-1`}>
                    {Object.entries(INQUIRY_STATUSES).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                  <button type="submit" className={buttonClass("secondary", "sm")}>
                    Set
                  </button>
                </form>
              </div>
            </div>
            {(q.organization || q.timeline) && (
              <p className="mt-2 text-sm text-ink-600">
                {q.organization && <>Organization: {q.organization}</>} {q.timeline && <>· Timeline: {q.timeline}</>}
              </p>
            )}
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-ink-800">{q.message}</p>
          </article>
        ))}
      </div>
    </>
  );
}
