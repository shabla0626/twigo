import { Client } from "pg";
import { deploy } from "../scripts/migrate";
import { createUtf8Database, databaseEncoding } from "../src/ops/create-database";

export default async function setup() {
  const url =
    process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5433/cowork_test?schema=public";
  if (!/test/i.test(url)) throw new Error("Refusing to run tests against a database whose URL does not contain 'test'.");
  const u = new URL(url);
  const name = u.pathname.slice(1);
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
