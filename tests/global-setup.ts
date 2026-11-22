import { Client } from "pg";
import { deploy } from "../scripts/migrate";
import { createUtf8Database, databaseEncoding } from "../src/ops/create-database";

/** Only databases named "…_test" may be emptied by the tests. */
export function isTestDatabaseName(name: string): boolean {
  return /^[A-Za-z0-9_]+_test$/.test(name);
}

export default async function setup() {
  const url =
    process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5433/cowork_test?schema=public";
  const u = new URL(url);
  const name = u.pathname.slice(1);
  // The tests empty every table. Only the NAME of the database decides whether that is allowed:
  // a password, user or host that happens to contain "test" must not unlock another database.
  if (!isTestDatabaseName(name)) throw new Error(`Refusing to run tests against the database "${name}": its name must end in "_test".`);
  const admin = new Client({ connectionString: Object.assign(new URL(u), { pathname: "/postgres", search: "" }).toString() });
  await admin.connect();
  const enc = await databaseEncoding(admin, name);
  if (enc !== "UTF8") {
    if (enc) await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    await createUtf8Database(admin, name);
  }
  await admin.end();
  await deploy(url, () => {});
}
