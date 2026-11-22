/**
 * Migration tooling that does not depend on Prisma's native schema engine
 * for database connections. On some Windows builds the native engine
 * segfaults when it opens a socket, so this runner gives a portable path.
 *
 *   npm run db:deploy                 apply pending migrations
 *   npm run db:migration -- <name>    create a new migration from schema changes
 *
 * Applied migrations are recorded in Prisma's own `_prisma_migrations`
 * table using the same checksum format (SHA-256 of migration.sql). The
 * standard `npx prisma migrate deploy` therefore sees the same state and
 * can be used instead wherever the native engine works.
 */
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, copyFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";

const root = process.cwd();
const migrationsDir = path.join(root, "prisma", "migrations");
const schemaPath = path.join(root, "prisma", "schema.prisma");
const snapshotPath = path.join(migrationsDir, "schema.snapshot.prisma");

function loadEnv() {
  if (process.env.DATABASE_URL) return;
  const envFile = path.join(root, ".env");
  if (!existsSync(envFile)) return;
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

function listMigrations(): string[] {
  if (!existsSync(migrationsDir)) return [];
  return readdirSync(migrationsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(path.join(migrationsDir, d.name, "migration.sql")))
    .map((d) => d.name)
    .sort();
}

export async function deploy(connectionString: string, log = console.log) {
  // node-postgres does not understand Prisma's ?schema= parameter.
  const url = new URL(connectionString);
  const schema = url.searchParams.get("schema") ?? "public";
  url.searchParams.delete("schema");

  const client = new Client({ connectionString: url.toString() });
  await client.connect();
  try {
    await client.query(`CREATE SCHEMA IF NOT EXISTS "${schema.replace(/"/g, "")}"`);
    await client.query(`SET search_path TO "${schema.replace(/"/g, "")}"`);
    await client.query("SELECT pg_advisory_lock(72707369)");
    await client.query(`CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      "id" VARCHAR(36) PRIMARY KEY NOT NULL,
      "checksum" VARCHAR(64) NOT NULL,
      "finished_at" TIMESTAMPTZ,
      "migration_name" VARCHAR(255) NOT NULL,
      "logs" TEXT,
      "rolled_back_at" TIMESTAMPTZ,
      "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "applied_steps_count" INTEGER NOT NULL DEFAULT 0)`);

    const { rows } = await client.query<{ migration_name: string; checksum: string; finished_at: Date | null }>(
      `SELECT migration_name, checksum, finished_at FROM "_prisma_migrations" WHERE rolled_back_at IS NULL`,
    );
    const applied = new Map(rows.map((r) => [r.migration_name, r]));

    let count = 0;
    for (const name of listMigrations()) {
      const sql = readFileSync(path.join(migrationsDir, name, "migration.sql"), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const prior = applied.get(name);
      if (prior) {
        if (!prior.finished_at) throw new Error(`Migration ${name} previously failed; resolve it manually.`);
        if (prior.checksum !== checksum) log(`warning: ${name} was modified after being applied`);
        continue;
      }
      const id = randomUUID();
      await client.query("BEGIN");
      try {
        await client.query(
          `INSERT INTO "_prisma_migrations" (id, checksum, migration_name, started_at) VALUES ($1,$2,$3,now())`,
          [id, checksum, name],
        );
        await client.query(sql);
        await client.query(
          `UPDATE "_prisma_migrations" SET finished_at = now(), applied_steps_count = 1 WHERE id = $1`,
          [id],
        );
        await client.query("COMMIT");
        log(`applied ${name}`);
        count++;
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(`Migration ${name} failed: ${(err as Error).message}`);
      }
    }
    log(count ? `${count} migration(s) applied.` : "Database is up to date.");
  } finally {
    await client.query("SELECT pg_advisory_unlock(72707369)").catch(() => {});
    await client.end();
  }
}

function createMigration(name: string) {
  if (!/^[a-z0-9_]+$/.test(name)) throw new Error("Migration name must be lower_snake_case.");
  const from = existsSync(snapshotPath) ? ["--from-schema-datamodel", snapshotPath] : ["--from-empty"];
  const sql = execFileSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["prisma", "migrate", "diff", ...from, "--to-schema-datamodel", schemaPath, "--script"],
    { encoding: "utf8", shell: process.platform === "win32" },
  );
  if (!sql.trim() || /empty migration/i.test(sql)) {
    console.log("No schema changes detected.");
    return;
  }
  const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  const dir = path.join(migrationsDir, `${stamp}_${name}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "migration.sql"), sql);
  copyFileSync(schemaPath, snapshotPath);
  console.log(`created ${path.relative(root, dir)}/migration.sql`);
}

async function main() {
  loadEnv();
  const [cmd, arg] = process.argv.slice(2);
  if (cmd === "new") return createMigration(arg ?? "");
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  await deploy(url);
}

if (process.argv[1] && path.resolve(process.argv[1]).includes(`scripts${path.sep}migrate`)) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
