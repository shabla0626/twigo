import Link from "next/link";
import { AdminHeader, Empty, Pager, fmtDate, smallInput } from "@/components/admin/ui";
import { Badge, buttonClass } from "@/components/ui/primitives";
import { requireAdmin } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { INQUIRY_CATEGORIES, INQUIRY_STATUSES } from "@/lib/labels";
import { pageHref, pageNumber, pageWindow } from "@/lib/paging";
import { inquiryStatusAction } from "../../actions/content";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
type Status = keyof typeof INQUIRY_STATUSES;

export default async function InquiriesPage({ searchParams }: Props) {
  await requireAdmin("inquiries.manage");
  const sp = await searchParams;
  const asked = Array.isArray(sp.status) ? sp.status[0] : sp.status;
  const status = asked && asked in INQUIRY_STATUSES ? (asked as Status) : undefined;
  const where = status ? { status } : undefined;
  const total = await db.contactInquiry.count({ where });
  const { page, pages, skip, take } = pageWindow(pageNumber(sp.page), total);
  const inquiries = await db.contactInquiry.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip, take });
  const tab = (active: boolean) =>
    active ? "rounded-full bg-ink-900 px-3 py-1 text-sm font-medium text-white" : "rounded-full border border-ink-300 bg-white px-3 py-1 text-sm font-medium text-ink-800 hover:bg-ink-50";
  return (
    <>
      <AdminHeader title="Contact inquiries" description="Messages from the public contact form, newest first." />
      <nav aria-label="Filter by status" className="mt-6 flex flex-wrap gap-2">
        <Link href="/admin/inquiries" aria-current={!status ? "page" : undefined} className={tab(!status)}>
          All
        </Link>
        {(Object.keys(INQUIRY_STATUSES) as Status[]).map((s) => (
          <Link key={s} href={`/admin/inquiries?status=${s}`} aria-current={status === s ? "page" : undefined} className={tab(status === s)}>
            {INQUIRY_STATUSES[s]}
          </Link>
        ))}
      </nav>
      <div className="mt-4 space-y-4">
        {inquiries.length === 0 && (
          <div className="rounded-lg border border-ink-200 bg-white">
            <Empty>{status ? "No inquiries with this status." : "No inquiries yet."}</Empty>
          </div>
        )}
        {inquiries.map((q) => (
          <article key={q.id} className="rounded-lg border border-ink-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">{q.subject}</h2>
                <p className="text-sm text-ink-600">
                  {q.name} ·{" "}
                  <a href={`mailto:${q.email}`} className="text-accent-700 underline underline-offset-2">
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
      <Pager page={page} pages={pages} total={total} href={(p) => pageHref("/admin/inquiries", { status }, p)} />
    </>
  );
}
