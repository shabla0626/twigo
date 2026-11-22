import path from "node:path";
import Link from "next/link";
import { AdminHeader, Flash, Panel, Table, fmtDate, smallInput } from "@/components/admin/ui";
import { buttonClass } from "@/components/ui/primitives";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { requireAdmin } from "@/lib/auth/guard";
import { can } from "@/lib/auth/permissions";
import { runRetention } from "@/ops/retention";
import { runRetentionAction } from "../../actions/community";

type Props = { searchParams: Promise<Record<string, string | undefined>> };

export default async function PrivacyAdminPage({ searchParams }: Props) {
  const admin = await requireAdmin("retention.preview");
  const sp = await searchParams;
  // Dry run: counts only, nothing is deleted (recorded as a dry-run job).
  const preview = await runRetention(db, { dryRun: true, storageDir: path.resolve(env().STORAGE_DIR) });
  const runs = await db.jobRun.findMany({ where: { job: "retention", dryRun: false }, orderBy: { startedAt: "desc" }, take: 10 });
  return (
    <>
      <AdminHeader title="Privacy & data retention" description="What the daily retention job would delete right now, per category. Periods are set by the owner in Settings." />
      <Flash ok={sp.ok} error={sp.error} />
      <div className="mt-6">
        <Table head={["Category", "Kept for", "Would be deleted now"]}>
          {preview.categories.map((c) => (
            <tr key={c.key}>
              <td className="px-4 py-3">{c.label}</td>
              <td className="px-4 py-3 text-ink-700">{c.days === null ? "Kept (no automatic deletion)" : `${c.days} days`}</td>
              <td className="px-4 py-3 tabular-nums">{c.count}</td>
            </tr>
          ))}
        </Table>
        <p className="mt-2 text-xs text-ink-500">Never deleted automatically: compensation records, projects, active members and their profiles, audit logs.</p>
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel title="Recent retention runs">
          {runs.length ? (
            <ul className="space-y-1 text-sm">
              {runs.map((r) => (
                <li key={r.id}>
                  {fmtDate(r.startedAt, true)} · {r.ok ? "completed" : r.ok === false ? `failed: ${r.error}` : "running"}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-600">No real runs yet. The server runs the job daily when JOBS_ENABLED is on.</p>
          )}
        </Panel>
        {can(admin.role, "retention.run") ? (
          <Panel title="Run retention now">
            <form action={runRetentionAction} className="space-y-2">
              <label htmlFor="confirm" className="block text-sm text-ink-700">
                Permanently deletes the records counted above. Type <strong>DELETE</strong> to confirm.
              </label>
              <input id="confirm" name="confirm" autoComplete="off" className={`${smallInput} max-w-40`} />
              <button className={buttonClass("danger", "sm")}>Run now</button>
            </form>
          </Panel>
        ) : (
          <Panel title="Run retention now">
            <p className="text-sm text-ink-600">Only the owner can run deletions manually.</p>
          </Panel>
        )}
      </div>
      <Panel title="Other privacy tools" className="mt-6">
        <ul className="list-disc space-y-1 pl-5 text-sm text-ink-700">
          <li>
            <Link href="/admin/applications" className="text-accent-700 hover:underline">
              Applications
            </Link>
            : CSV export, per-person JSON export (owner) and erasure.
          </li>
          <li>Members can download their own data and deactivate their account under Account → Your data.</li>
        </ul>
      </Panel>
    </>
  );
}
