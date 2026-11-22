/**
 * Local development PostgreSQL using the `embedded-postgres` package.
 * Use this only when you don't have PostgreSQL installed. Production must use
 * a real managed or self-hosted PostgreSQL server.
 *
 *   npm run db:up      # keeps running until Ctrl+C
 */
import EmbeddedPostgres from "embedded-postgres";
import { createUtf8Database } from "../src/ops/create-database";
import { existsSync } from "node:fs";
import path from "node:path";

const dataDir = path.resolve(process.cwd(), ".pgdata");
const port = Number(process.env.DEV_DB_PORT ?? 5433);

async function main() {
  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: "postgres",
    password: "postgres",
    port,
    persistent: true,
    // Store text as UTF-8 so every language and symbol can be saved.
    initdbFlags: ["--encoding=UTF8"],
    onLog: () => {},
  });

  const fresh = !existsSync(path.join(dataDir, "PG_VERSION"));
  if (fresh) await pg.initialise();
  await pg.start();

  const admin = pg.getPgClient();
  await admin.connect();
  for (const db of ["cowork", "cowork_test"]) {
    const exists = (await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [db])).rowCount;
    if (!exists) {
      await createUtf8Database(admin, db);
      console.log(`created database ${db} (UTF-8)`);
    }
  }
  await admin.end();
  console.log(`PostgreSQL (dev) running on port ${port}. Press Ctrl+C to stop.`);

  const stop = async () => {
    await pg.stop();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  setInterval(() => {}, 1 << 30);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
