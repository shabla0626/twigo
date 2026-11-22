/** AUDIT DIAGNOSTIC (temporary, READ-ONLY): run one SQL statement. npx tsx scripts/audit/q.ts <db> "<sql>" */
import { Client } from "pg";
(async () => {
  const c = new Client({ connectionString: `postgresql://postgres:postgres@localhost:5433/${process.argv[2]}`, options: "-c default_transaction_read_only=on" });
  await c.connect();
  const r = await c.query(process.argv[3]);
  console.table(r.rows);
  await c.end();
})();
