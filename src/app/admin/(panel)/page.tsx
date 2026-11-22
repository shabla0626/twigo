import Link from "next/link";
import { AdminHeader, Panel, StatCard, fmtDate } from "@/components/admin/ui";
import { Badge } from "@/components/ui/primitives";
import { requireAdmin } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { emailConfigured } from "@/lib/email";
import { APPLICATION_STATUSES } from "@/lib/labels";
import { getOverviewStats } from "@/server/admin/applications";

export default async function OverviewPage() {
  await requireAdmin();
  const [s, recent, members, ideas, groups, review, reports] = await Promise.all([
    getOverviewStats(),
    db.application.findMany({
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { id: true, status: true, createdAt: true, applicant: { select: { fullName: true, country: true } } },
    }),
    db.user.count({ where: { status: "ACTIVE", profile: { isNot: null } } }),
    db.businessIdea.count({ where: { status: { in: ["OPEN", "GROUP_FORMED"] } } }),
    db.researchGroup.count({ where: { status: { not: "ARCHIVED" }, suspendedAt: null } }),
    db.researchGroup.count({ where: { status: "READY_FOR_REVIEW" } }),
    db.contentReport.count({ where: { status: "OPEN" } }),
  ]);
  return (
    <>
      <AdminHeader title="Overview" description="Recruitment, community and project status at a glance. All numbers come from the database." />
      {!emailConfigured() && (
        <p className="mt-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Email is not configured. Applications are still saved and listed here, but no notification or confirmation
          emails are sent. Set SMTP_HOST and EMAIL_FROM to enable email.
        </p>
      )}
      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard label="Total applications" value={s.total} href="/admin/applications" />
        <StatCard label="New applications" value={s.new} href="/admin/applications?status=SUBMITTED" />
        <StatCard label="Under review" value={s.underReview} href="/admin/applications?status=UNDER_REVIEW" />
        <StatCard label="Accepted participants (active)" value={s.activeParticipants} href="/admin/participants" />
        <StatCard label="Active projects" value={s.activeProjects} href="/admin/projects" />
        <StatCard label="Completed projects" value={s.completedProjects} href="/admin/projects" />
        <StatCard label="Active community members" value={members} href="/admin/members?status=ACTIVE" />
        <StatCard label="Published ideas" value={ideas} href="/admin/ideas" />
        <StatCard label="Active research groups" value={groups} href="/admin/groups" />
        <StatCard label="Groups ready for review" value={review} href="/admin/groups" />
        <StatCard label="Open reports" value={reports} href="/admin/reports" />
      </div>
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Panel title="Recent applications">
          {recent.length === 0 ? (
            <p className="text-sm text-ink-500">No applications yet.</p>
          ) : (
            <ul className="divide-y divide-ink-100">
              {recent.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-4 py-2.5">
                  <Link href={`/admin/applications/${a.id}`} className="min-w-0 truncate text-sm font-medium text-ink-900 hover:underline">
                    {a.applicant.fullName} <span className="font-normal text-ink-500">· {a.applicant.country}</span>
                  </Link>
                  <span className="flex shrink-0 items-center gap-2 text-xs text-ink-500">
                    <Badge>{APPLICATION_STATUSES[a.status]}</Badge>
                    {fmtDate(a.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Other">
          <ul className="space-y-2 text-sm">
            <li>
              Applications in interview stage: <strong>{s.interview}</strong>
            </li>
            <li>
              Applications accepted (all time): <strong>{s.accepted}</strong>
            </li>
            <li>
              Open contact inquiries:{" "}
              <Link href="/admin/inquiries" className="font-semibold text-accent-700 hover:underline">
                {s.openInquiries}
              </Link>
            </li>
          </ul>
        </Panel>
      </div>
    </>
  );
}
