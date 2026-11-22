// Minimal in-process scheduler for daily jobs (retention, backup).
// A Postgres advisory lock makes sure only one server instance runs a job.
import type { PrismaClient } from "@prisma/client";
import path from "node:path";
import { createBackup } from "./backup";
import { runRetention } from "./retention";

type Log = (msg: string, meta?: object) => void;

const LOCKS = { retention: 81_002_001, backup: 81_002_002 } as const;
const HOUR = 3600_000;

async function withLock(db: PrismaClient, key: number, fn: () => Promise<void>) {
  const rows = await db.$queryRaw<{ ok: boolean }[]>`SELECT pg_try_advisory_lock(${key}) AS ok`;
  if (!rows[0]?.ok) return;
  try {
    await fn();
  } finally {
    await db.$queryRaw`SELECT pg_advisory_unlock(${key})`;
  }
}

async function ranRecently(db: PrismaClient, job: string, withinMs: number) {
  const last = await db.jobRun.findFirst({ where: { job, dryRun: false, ok: true }, orderBy: { startedAt: "desc" } });
  return Boolean(last && Date.now() - last.startedAt.getTime() < withinMs);
}

export function startScheduler(db: PrismaClient, opts: { databaseUrl: string; storageDir: string; backupDir: string; backupKeep: number; backupKey?: string; log: Log }) {
  const tick = async () => {
    try {
      await withLock(db, LOCKS.retention, async () => {
        if (await ranRecently(db, "retention", 23 * HOUR)) return;
        const res = await runRetention(db, { dryRun: false, storageDir: opts.storageDir });
        opts.log("job.retention", { deleted: res.categories.reduce((n, c) => n + c.count, 0) });
      });
      await withLock(db, LOCKS.backup, async () => {
        if (await ranRecently(db, "backup", 23 * HOUR)) return;
        const run = await db.jobRun.create({ data: { job: "backup" } });
        try {
          const res = await createBackup({ connectionString: opts.databaseUrl, dir: path.resolve(opts.backupDir), encryptionKey: opts.backupKey, keep: opts.backupKeep });
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
