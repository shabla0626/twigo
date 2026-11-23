/**
 * READ-ONLY: prints the applied migrations and the row count of every table, for one or more databases
 * on the local development server, and the tables whose counts differ between them.
 *
 *   npx tsx scripts/audit/table-counts.ts cowork cowork_m5_rehearsal
 */
import { Client } from "pg";

async function main() {
  const base =
    process.env.PG_BASE ?? "postgresql://postgres:postgres@localhost:5433";
  const names = process.argv.slice(2);
  const result: Record<string, Record<string, number>> = {};
  for (const name of names) {
    const c = new Client({ connectionString: `${base}/${name}` });
    await c.connect();
    const mig = await c.query<{ migration_name: string }>(
      `SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL ORDER BY migration_name`,
    );
    const tables = await c.query<{ t: string }>(
      `SELECT tablename::text AS t FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations' ORDER BY 1`,
    );
    const counts: Record<string, number> = {};
    for (const { t } of tables.rows)
      counts[t] = Number(
        (await c.query<{ n: string }>(`SELECT count(*) AS n FROM "${t}"`))
          .rows[0]!.n,
      );
    result[name] = counts;
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    console.log(
      `${name}: ${mig.rows.length} migrations (last ${mig.rows.at(-1)?.migration_name}), ${tables.rows.length} tables, ${total} rows`,
    );
    await c.end();
  }
  if (names.length === 2) {
    const [a, b] = names as [string, string];
    const all = new Set([
      ...Object.keys(result[a]!),
      ...Object.keys(result[b]!),
    ]);
    const diff = [...all]
      .filter((t) => result[a]![t] !== result[b]![t])
      .map(
        (t) =>
          `${t}: ${result[a]![t] ?? "missing"} vs ${result[b]![t] ?? "missing"}`,
      );
    console.log(
      diff.length ? `differences:\n  ${diff.join("\n  ")}` : "no differences",
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
