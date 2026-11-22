/** AUDIT DIAGNOSTIC (read-only): compares row counts and a content checksum of every table in two databases. */
import { Client } from "pg";
const url = (n: string) => `postgresql://postgres:postgres@localhost:5433/${n}`;
async function sums(name: string) {
  const c = new Client({ connectionString: url(name), options: "-c default_transaction_read_only=on" });
  await c.connect();
  const tables = (await c.query(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations' ORDER BY 1`)).rows.map((r) => r.tablename as string);
  const out: Record<string, string> = {};
  for (const t of tables) {
    const r = await c.query(`SELECT count(*)::text n, coalesce(md5(string_agg(md5(x::text), '' ORDER BY md5(x::text))), '-') h FROM "${t}" x`);
    out[t] = `${r.rows[0].n}:${r.rows[0].h}`;
  }
  const enc = (await c.query(`SELECT pg_encoding_to_char(encoding) e FROM pg_database WHERE datname=current_database()`)).rows[0].e;
  await c.end();
  return { out, enc };
}
(async () => {
  const [a, b] = [await sums(process.argv[2]), await sums(process.argv[3])];
  const names = [...new Set([...Object.keys(a.out), ...Object.keys(b.out)])];
  const diff = names.filter((n) => a.out[n] !== b.out[n]);
  const rows = Object.values(a.out).reduce((n, v) => n + Number(v.split(":")[0]), 0);
  console.log(`${process.argv[2]} (${a.enc}) vs ${process.argv[3]} (${b.enc}): ${names.length} tables, ${rows} rows, ${diff.length} tables differ`);
  for (const d of diff) console.log("  differs:", d, a.out[d]?.split(":")[0], b.out[d]?.split(":")[0]);
})();
