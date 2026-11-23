/**
 * DIAGNOSTIC (READ-ONLY): lists every text column of a database that contains a given word.
 *   npx tsx scripts/audit/find-text.ts <database> <word>
 */
import { Client } from "pg";

(async () => {
  const [db, word] = [process.argv[2] ?? "cowork", process.argv[3] ?? ""];
  if (!word) throw new Error("give a word to look for");
  const c = new Client({ connectionString: `postgresql://postgres:postgres@localhost:5433/${db}`, options: "-c default_transaction_read_only=on" });
  await c.connect();
  const cols = await c.query<{ table_name: string; column_name: string }>(
    `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='public' AND data_type IN ('text','character varying','jsonb','json')`,
  );
  for (const { table_name: t, column_name: col } of cols.rows) {
    const r = await c.query(`SELECT count(*)::int AS n FROM "${t}" WHERE "${col}"::text ILIKE $1`, [`%${word}%`]);
    if (r.rows[0].n) console.log(`${t}.${col}: ${r.rows[0].n}`);
  }
  await c.end();
})();
