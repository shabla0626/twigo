/**
 * Data-retention job (also runs daily inside the server when JOBS_ENABLED=true).
 * Retention periods per category are set by the owner at /admin/settings.
 *
 *   npm run purge:retention            # performs deletion
 *   npm run purge:retention -- --dry   # report only, deletes nothing
 */
import path from "node:path";
import { createPrismaClient } from "../src/lib/db-core";
import { runRetention } from "../src/ops/retention";
import { loadDotEnv } from "./load-env";

async function main() {
  loadDotEnv();
  const dryRun = process.argv.includes("--dry");
  const db = createPrismaClient();
  try {
    const res = await runRetention(db, { dryRun, storageDir: path.resolve(process.env.STORAGE_DIR || "storage") });
    for (const c of res.categories) console.log(`${c.days === null ? "keep" : `${c.days}d`.padStart(5)}  ${String(c.count).padStart(5)}  ${c.label}`);
    console.log(dryRun ? "Dry run: nothing was deleted." : "Retention run complete.");
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
