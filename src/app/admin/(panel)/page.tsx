import Link from "next/link";
import { AdminHeader, Panel, StatCard, fmtDate } from "@/components/admin/ui";
import { Badge } from "@/components/ui/primitives";
import { outstandingLaunchItems } from "@/config/launch-placeholders";
import { requireAdmin } from "@/lib/auth/guard";
import { can } from "@/lib/auth/permissions";
import { getSiteContent } from "@/lib/content";
import { db } from "@/lib/db";
import { emailConfigured } from "@/lib/email";
import { RETRYABLE } from "@/lib/email/status";
import { env } from "@/lib/env";
import { APPLICATION_STATUSES } from "@/lib/labels";
import { daysAgo } from "@/lib/time";
import { MEMBERS_WITH_ACCESS, MEMBERS_WITH_ACCESS_HREF, memberListWhere } from "@/server/admin/members";

/**
 * The owner's start page: first what is waiting for a decision, then a few
 * counters. Every number links to a list that shows exactly that many entries
 * (each count uses the same filter as its list).
 */
export default async function OverviewPage() {
  const admin = await requireAdmin();
  const e = env();
  const [received, underReview, interview, openReports, groupsToCheck, failedEmails, openInquiries, membersWithAccess, groups, projects, recent, content] = await Promise.all([
    db.application.count({ where: { status: "SUBMITTED" } }),
    db.application.count({ where: { status: "UNDER_REVIEW" } }),
    db.application.count({ where: { status: "INTERVIEW_REQUESTED" } }),
    db.contentReport.count({ where: { status: "OPEN" } }),
    db.researchGroup.count({ where: { OR: [{ status: "READY_FOR_REVIEW" }, { adminManaged: true, status: { not: "ARCHIVED" } }] } }),
    db.emailDelivery.count({ where: { status: { in: RETRYABLE }, createdAt: { gt: daysAgo(7) } } }),
    db.contactInquiry.count({ where: { status: "OPEN" } }),
    db.user.count({ where: memberListWhere(MEMBERS_WITH_ACCESS) }),
    db.researchGroup.count(),
    db.project.count(),
    db.application.findMany({
      where: { status: { not: "DRAFT" } },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { id: true, status: true, createdAt: true, applicant: { select: { fullName: true, country: true } } },
    }),
    getSiteContent(),
  ]);

  // Things that need a decision or a look. Only those the administrator may open are shown.
  const waiting = [
    { n: received, one: "application received", many: "applications received", href: "/admin/applications?status=SUBMITTED", perm: "applications.view" as const },
    { n: openReports, one: "open report", many: "open reports", href: "/admin/reports", perm: "moderation.act" as const },
    { n: groupsToCheck, one: "research group asks for review or has no coordinator", many: "research groups ask for review or have no coordinator", href: "/admin/groups", perm: "groups.manage" as const },
    { n: failedEmails, one: "email could not be delivered in the last 7 days", many: "emails could not be delivered in the last 7 days", href: "/admin/email?filter=problems", perm: "email.send" as const },
    { n: openInquiries, one: "open customer inquiry", many: "open customer inquiries", href: "/admin/inquiries", perm: "inquiries.manage" as const },
  ].filter((w) => w.n > 0 && can(admin.role, w.perm));

  const launch = outstandingLaunchItems({ legalName: e.ORG_LEGAL_NAME, jurisdiction: e.ORG_JURISDICTION, contactEmail: content.contact.email || e.ORG_CONTACT_EMAIL });

  return (
    <>
      <AdminHeader title="Overview" description="What is waiting for you, and where things stand. Every number opens the list it counts." />
      {!emailConfigured() && (
        <p className="mt-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Email is not configured. Applications are still saved and listed here, but no notification or confirmation
          emails are sent. Set SMTP_HOST and EMAIL_FROM to enable email.
        </p>
      )}

      <Panel title="Waiting for you" className="mt-6">
        {waiting.length === 0 ? (
          <p className="text-sm text-ink-600">Nothing is waiting right now.</p>
        ) : (
          <ul className="divide-y divide-ink-100">
            {waiting.map((w) => (
              <li key={w.href}>
                <Link href={w.href} className="flex items-center gap-3 py-2.5 text-sm hover:underline">
                  <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-accent-100 px-2 font-semibold tabular-nums text-accent-900">{w.n}</span>
                  <span className="text-ink-900">{w.n === 1 ? w.one : w.many}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard label="Members with community access" value={membersWithAccess} href={MEMBERS_WITH_ACCESS_HREF} />
        <StatCard label="Applications received" value={received} href="/admin/applications?status=SUBMITTED" />
        <StatCard label="Applications under review" value={underReview} href="/admin/applications?status=UNDER_REVIEW" />
        <StatCard label="Applications with an interview requested" value={interview} href="/admin/applications?status=INTERVIEW_REQUESTED" />
        <StatCard label="Research groups" value={groups} href="/admin/groups" />
        <StatCard label="Projects" value={projects} href="/admin/projects" />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Panel title="Latest applications">
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

        <Panel title={`Before launch (${launch.length} open)`}>
          {launch.length === 0 ? (
            <p className="text-sm text-ink-600">Nothing is open: the public pages show no placeholder.</p>
          ) : (
            <>
              <p className="text-sm leading-6 text-ink-700">
                The public pages never invent missing facts. Where something is missing they show a highlighted placeholder. These are still open:
              </p>
              <ul className="mt-3 space-y-3 text-sm">
                {launch.map((item) => (
                  <li key={item.what}>
                    <p className="font-medium text-ink-950">{item.what}</p>
                    <p className="text-ink-600">
                      Shown on{" "}
                      {item.pages.map((p, i) => (
                        <span key={p.href}>
                          {i > 0 && ", "}
                          <Link href={p.href} className="text-accent-700 hover:underline">
                            {p.label}
                          </Link>
                        </span>
                      ))}
                      . {item.how}.
                    </p>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Panel>
      </div>
    </>
  );
}
