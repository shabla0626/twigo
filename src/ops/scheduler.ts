// Minimal in-process scheduler for daily jobs (retention, backup).
// A Postgres advisory lock makes sure only one server instance runs a job.
import { currentLedgerHead } from "./erasure-ledger";
import type { PrismaClient } from "@prisma/client";
import path from "node:path";
import { Client } from "pg";
import { createBackup } from "./backup";
import { runHousekeeping } from "./housekeeping";
import { runRetention } from "./retention";

type Log = (msg: string, meta?: object) => void;

export const LOCKS = { retention: 81_002_001, backup: 81_002_002, housekeeping: 81_002_003 } as const;
const HOUR = 3600_000;

/**
 * Runs `fn` only if no other server instance is running the same job.
 *
 * The lock belongs to ONE database connection, so it is taken, held and
 * released on a connection of its own. (Taking and releasing it through the
 * shared connection pool could release it on a different connection: the lock
 * would then stay held and later runs would be skipped without any message.)
 * Closing the connection releases the lock even if the job crashed.
 * Returns false when another instance holds the lock.
 */
export async function withJobLock(databaseUrl: string, key: number, fn: () => Promise<void>): Promise<boolean> {
  const url = new URL(databaseUrl);
  url.searchParams.delete("schema");
  const client = new Client({ connectionString: url.toString() });
  await client.connect();
  try {
    const { rows } = await client.query<{ ok: boolean }>("SELECT pg_try_advisory_lock($1) AS ok", [key]);
    if (!rows[0]?.ok) return false;
    try {
      await fn();
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [key]).catch(() => {});
    }
    return true;
  } finally {
    await client.end().catch(() => {});
  }
}

async function ranRecently(db: PrismaClient, job: string, withinMs: number) {
  const last = await db.jobRun.findFirst({ where: { job, dryRun: false, ok: true }, orderBy: { startedAt: "desc" } });
  return Boolean(last && Date.now() - last.startedAt.getTime() < withinMs);
}

export function startScheduler(db: PrismaClient, opts: { databaseUrl: string; storageDir: string; backupDir: string; backupKeep: number; backupKey?: string; log: Log }) {
  const tick = async () => {
    try {
      await withJobLock(opts.databaseUrl, LOCKS.housekeeping, async () => {
        const res = await runHousekeeping(db, { storageDir: opts.storageDir });
        if (res.unsentAttachments || res.meetingsEnded || res.groupAccessExpired) opts.log("job.housekeeping", res);
      });
      await withJobLock(opts.databaseUrl, LOCKS.retention, async () => {
        if (await ranRecently(db, "retention", 23 * HOUR)) return;
        const res = await runRetention(db, { dryRun: false, storageDir: opts.storageDir });
        opts.log("job.retention", { deleted: res.categories.reduce((n, c) => n + c.count, 0) });
      });
      await withJobLock(opts.databaseUrl, LOCKS.backup, async () => {
        if (await ranRecently(db, "backup", 23 * HOUR)) return;
        const run = await db.jobRun.create({ data: { job: "backup" } });
        try {
          const res = await createBackup({ connectionString: opts.databaseUrl, dir: path.resolve(opts.backupDir), encryptionKey: opts.backupKey, keep: opts.backupKeep, ledgerHead: () => currentLedgerHead() });
          await db.jobRun.update({
            where: { id: run.id },
            data: { finishedAt: new Date(), ok: true, summary: { file: path.basename(res.file), bytes: res.bytes, tables: res.manifest.tables.length, pruned: res.deleted.length } },
          });
          opts.log("job.backup", { file: path.basename(res.file), bytes: res.bytes });
        } catch (err) {
          await db.jobRun.update({ where: { id: run.id }, data: { finishedAt: new Date(), ok: false, error: String(err).slice(0, 1000) } });
          throw err;
        }
      });
    } catch (err) {
      opts.log("job.failed", { err: String(err) });
    }
  };
  // First check shortly after start, then hourly (jobs themselves run at most daily).
  const first = setTimeout(() => void tick(), 60_000);
  const timer = setInterval(() => void tick(), HOUR);
  first.unref();
  timer.unref();
  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
}
