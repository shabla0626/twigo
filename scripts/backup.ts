/**
 * Database backup / restore CLI.
 *
 *   npm run db:backup                                  create a backup in BACKUP_DIR (default ./backups)
 *   npm run db:backup -- --label before-phase1         add a label to the file name
 *   npm run db:restore -- <file> --into cowork_restore_check [--replace]
 *
 * Restore ALWAYS creates a new, separate database and verifies row counts and
 * checksums. It refuses to target the database in DATABASE_URL.
 */
import path from "node:path";
import { createBackup, restoreBackup } from "../src/ops/backup";
import { deploy } from "./migrate";
import { loadDotEnv } from "./load-env";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  loadDotEnv();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const cmd = process.argv[2];
  const key = process.env.BACKUP_ENCRYPTION_KEY || undefined;

  if (cmd === "backup") {
    const res = await createBackup({
      connectionString: url,
      dir: path.resolve(process.env.BACKUP_DIR || "backups"),
      encryptionKey: key,
      keep: Number(process.env.BACKUP_KEEP || 14),
      label: arg("label"),
    });
    const rows = res.manifest.tables.reduce((n, t) => n + t.rows, 0);
    console.log(`Backup written: ${res.file} (${res.bytes} bytes, ${res.manifest.tables.length} tables, ${rows} rows)`);
    if (res.deleted.length) console.log(`Removed old backups: ${res.deleted.join(", ")}`);
    return;
  }

  if (cmd === "restore") {
    const file = process.argv[3];
    const into = arg("into");
    if (!file || !into) throw new Error("Usage: restore <file> --into <new_database_name> [--replace]");
    const live = decodeURIComponent(new URL(url).pathname.slice(1));
    const res = await restoreBackup({
      file: path.resolve(file),
      serverConnectionString: url,
      targetDb: into,
      protectedDbs: [live],
      encryptionKey: key,
      replaceExisting: process.argv.includes("--replace"),
      migrate: (cs) => deploy(cs, () => {}),
    });
    for (const t of res.tables) console.log(`${t.ok ? "ok  " : "FAIL"} ${t.name}: ${t.restored}/${t.expected} rows`);
    console.log(res.ok ? `Restore verified into "${res.targetDb}".` : "Restore verification FAILED.");
    if (!res.ok) process.exit(1);
    return;
  }
  throw new Error("Usage: backup | restore <file> --into <db>");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
