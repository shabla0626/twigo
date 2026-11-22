import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { AdminHeader, Empty, Flash, Panel, Table, fmtDate } from "@/components/admin/ui";
import { buttonClass } from "@/components/ui/primitives";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { requireAdmin } from "@/lib/auth/guard";
import { backupNowAction } from "../../actions/community";

type Props = { searchParams: Promise<Record<string, string | undefined>> };

export default async function BackupsPage({ searchParams }: Props) {
  await requireAdmin("backups.manage");
  const sp = await searchParams;
  const e = env();
  const dir = path.resolve(e.BACKUP_DIR);
  const files = existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => /\.cwbak\.gz(\.enc)?$/.test(f))
        .map((f) => ({ name: f, ...statSync(path.join(dir, f)) }))
        .sort((a, b) => b.mtimeMs - a.mtimeMs)
    : [];
  const runs = await db.jobRun.findMany({ where: { job: "backup" }, orderBy: { startedAt: "desc" }, take: 10 });
  const lastOk = await db.jobRun.findFirst({ where: { job: "backup", ok: true }, orderBy: { startedAt: "desc" }, select: { startedAt: true } });
  return (
    <>
      <AdminHeader
        title="Backups"
        description={`Daily logical backups (all tables) are written to ${e.BACKUP_DIR}/ and the newest ${e.BACKUP_KEEP} are kept. ${e.BACKUP_ENCRYPTION_KEY ? "Backups are encrypted." : "Backups are NOT encrypted (set BACKUP_ENCRYPTION_KEY)."}`}
        actions={
          <form action={backupNowAction}>
            <button className={buttonClass("primary", "sm")}>Back up now</button>
          </form>
        }
      />
      <Flash ok={sp.ok} error={sp.error} />
      <Panel title="What to know" className="mt-6">
        <ul className="space-y-2 text-sm leading-6 text-ink-700">
          <li>
            • Last successful backup: <strong>{lastOk ? fmtDate(lastOk.startedAt, true) : "none recorded yet"}</strong>.
          </li>
          <li>
            • Encryption:{" "}
            {e.BACKUP_ENCRYPTION_KEY ? (
              <strong>on</strong>
            ) : (
              <strong className="text-amber-800">off. A backup contains all personal data and compensation records; set BACKUP_ENCRYPTION_KEY (required in production).</strong>
            )}
          </li>
          <li>
            • These files are on the same disk as the site. A lost disk loses both, so copy them to a second place regularly (docs/DEPLOYMENT.md,
            section 11).
          </li>
          <li>
            • Uploaded files (chat attachments, research files, profile photos) are <strong>not</strong> inside these backups. They are in the folder{" "}
            <span className="font-mono text-xs">{e.STORAGE_DIR}/</span> and must be copied as well.
          </li>
        </ul>
      </Panel>
      <div className="mt-6">
        <Table head={["File", "Size", "Created"]} empty={!files.length && <Empty>No backups yet.</Empty>}>
          {files.map((f) => (
            <tr key={f.name}>
              <td className="px-4 py-3 font-mono text-xs">{f.name}</td>
              <td className="px-4 py-3 tabular-nums">{(f.size / 1024).toFixed(1)} KB</td>
              <td className="px-4 py-3">{fmtDate(f.mtime, true)}</td>
            </tr>
          ))}
        </Table>
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel title="Job history">
          <ul className="space-y-1 text-sm">
            {runs.map((r) => (
              <li key={r.id}>
                {fmtDate(r.startedAt, true)} · {r.ok ? "ok" : r.ok === false ? `failed: ${r.error}` : "running"}
              </li>
            ))}
            {!runs.length && <li className="text-ink-600">No backup jobs recorded yet.</li>}
          </ul>
        </Panel>
        <Panel title="Restore (command line only)">
          <p className="text-sm text-ink-700">Restores always go into a new, separate database and are verified table by table. They never overwrite the live database.</p>
          <pre className="mt-3 overflow-x-auto rounded-md bg-ink-50 p-3 text-xs">npm run db:restore -- backups/&lt;file&gt; --into cowork_restore_check</pre>
          <p className="mt-2 text-xs text-ink-500">Keep copies off this server too (see docs/DEPLOYMENT.md). A backup that only lives on the same disk does not protect against disk loss.</p>
        </Panel>
      </div>
    </>
  );
}
