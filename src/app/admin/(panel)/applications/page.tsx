import Link from "next/link";
import { AdminHeader, Empty, Flash, Pager, Table, fmtDate, membershipTone, smallInput, smallLabel, statusTone } from "@/components/admin/ui";
import { MoreFilters } from "@/components/admin/more-filters";
import { Badge, buttonClass } from "@/components/ui/primitives";
import { requireAdmin } from "@/lib/auth/guard";
import { APPLICATION_STATUSES, EXPERIENCE_LEVELS, HOURS_OPTIONS, MEMBERSHIP_LABELS, WORK_CATEGORIES } from "@/lib/labels";
import { applicationFiltersSchema } from "@/lib/validation/admin";
import { listApplications } from "@/server/admin/applications";

type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function ApplicationsPage({ searchParams }: { searchParams: SP }) {
  await requireAdmin("applications.view");
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) || undefined;
  const filters = applicationFiltersSchema.parse({
    q: one("q"),
    status: one("status"),
    experience: one("experience"),
    category: one("category"),
    skill: one("skill"),
    minHours: one("minHours"),
    page: one("page"),
  });
  const { rows, total, page, pages } = await listApplications(filters);

  const pageHref = (p: number) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) if (v !== undefined && k !== "page") params.set(k, String(v));
    params.set("page", String(p));
    return `/admin/applications?${params}`;
  };

  return (
    <>
      <AdminHeader
        title="Applications"
        description={`${total} matching application${total === 1 ? "" : "s"}`}
        actions={
          <a href="/admin/applications/export" className={buttonClass("secondary", "sm")} download>
            Export CSV
          </a>
        }
      />
      <Flash ok={one("ok")} />

      <form className="mt-6 grid gap-3 rounded-lg border border-ink-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-6" role="search">
        <div className="lg:col-span-2">
          <label htmlFor="q" className={smallLabel}>
            Search name, email, country
          </label>
          <input id="q" name="q" defaultValue={filters.q} className={smallInput} />
        </div>
        <MoreFilters inUse={Boolean(filters.status || filters.experience || filters.category || filters.minHours || filters.skill)}>
        <div>
          <label htmlFor="status" className={smallLabel}>
            Status
          </label>
          <select id="status" name="status" defaultValue={filters.status ?? ""} className={smallInput}>
            <option value="">All</option>
            {Object.entries(APPLICATION_STATUSES)
              .filter(([v]) => v !== "DRAFT")
              .map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="experience" className={smallLabel}>
            Experience
          </label>
          <select id="experience" name="experience" defaultValue={filters.experience ?? ""} className={smallInput}>
            <option value="">All</option>
            {Object.entries(EXPERIENCE_LEVELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="category" className={smallLabel}>
            Category
          </label>
          <select id="category" name="category" defaultValue={filters.category ?? ""} className={smallInput}>
            <option value="">All</option>
            {Object.entries(WORK_CATEGORIES).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="minHours" className={smallLabel}>
            Min. hours/week
          </label>
          <select id="minHours" name="minHours" defaultValue={filters.minHours ?? ""} className={smallInput}>
            <option value="">Any</option>
            {HOURS_OPTIONS.map((h) => (
              <option key={h} value={h}>
                {h}+
              </option>
            ))}
          </select>
        </div>
        <div className="lg:col-span-2">
          <label htmlFor="skill" className={smallLabel}>
            Skill contains
          </label>
          <input id="skill" name="skill" defaultValue={filters.skill} className={smallInput} />
        </div>
        </MoreFilters>
        <div className="flex items-end gap-2 lg:col-span-4">
          <button type="submit" className={buttonClass("primary", "sm")}>
            Apply filters
          </button>
          <Link href="/admin/applications" className={buttonClass("ghost", "sm")}>
            Reset
          </Link>
        </div>
      </form>

      <div className="mt-6">
        <Table
          head={["Applicant", "Application", "Account", "Community access", "Main skills", "Hours", "Submitted"]}
          empty={rows.length === 0 ? <Empty>No applications match these filters.</Empty> : undefined}
        >
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-ink-50">
              <td className="px-4 py-3">
                <Link href={`/admin/applications/${r.id}`} className="font-medium text-ink-950 hover:underline">
                  {r.applicant.fullName}
                </Link>
                <div className="text-xs text-ink-500">
                  {r.applicant.email}
                  {r.applicant.country ? ` · ${r.applicant.country}` : ""}
                </div>
              </td>
              <td className="px-4 py-3">
                <Badge tone={statusTone[r.status]}>{APPLICATION_STATUSES[r.status]}</Badge>
              </td>
              <td className="px-4 py-3 text-ink-700">
                {!r.applicant.user ? <Badge tone="warn">No account yet</Badge> : r.applicant.user.emailVerifiedAt ? "Email confirmed" : <Badge tone="warn">Email not confirmed</Badge>}
              </td>
              <td className="px-4 py-3">
                <Badge tone={membershipTone[r.applicant.user?.membershipStatus ?? "NONE"]}>{MEMBERSHIP_LABELS[r.applicant.user?.membershipStatus ?? "NONE"]}</Badge>
              </td>
              <td className="max-w-xs px-4 py-3 text-ink-700">{r.applicant.skills.map((s) => s.skill.label).join(", ")}</td>
              <td className="px-4 py-3 tabular-nums text-ink-700">{r.availability?.hoursPerWeek ?? "—"}</td>
              <td className="whitespace-nowrap px-4 py-3 text-ink-600">{fmtDate(r.submittedAt ?? r.createdAt)}</td>
            </tr>
          ))}
        </Table>
      </div>

      <Pager page={page} pages={pages} total={total} href={pageHref} />
    </>
  );
}
