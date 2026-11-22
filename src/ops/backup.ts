/**
 * Logical PostgreSQL backup and restore that does not need pg_dump.
 *
 * Format (gzip-compressed text, optionally AES-256-GCM encrypted):
 *   {"type":"manifest", ...}\n
 *   {"type":"table","name":"X","columns":[...],"rows":N,"sha256":"..."}\n
 *   <rows in COPY text format, one per line>
 *   \.\n
 *   ...repeated per table
 *
 * COPY text format escapes backslashes and newlines, so a line containing
 * only `\.` can never be data. Restores only ever go into a NEW database and
 * are verified by comparing row counts and per-table checksums.
 *
 * Kept free of `server-only` so CLI scripts and the server scheduler can use it.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from "node:crypto";
import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";
import { createUtf8Database } from "./create-database";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip, createGzip } from "node:zlib";
import { Client } from "pg";
import { from as copyFrom, to as copyTo } from "pg-copy-streams";

const MAGIC = Buffer.from("CWBAK1");
const SKIP_DATA = new Set(["_prisma_migrations"]);

export type TableInfo = { name: string; columns: string[]; rows: number; sha256: string };
export type Manifest = {
  type: "manifest";
  format: 1;
  createdAt: string;
  database: string;
  schema: string;
  migrations: string[];
  tables: { name: string; rows: number; sha256: string }[];
};

function parseConn(connectionString: string) {
  const url = new URL(connectionString);
  const schema = url.searchParams.get("schema") ?? "public";
  url.searchParams.delete("schema");
  return { url, schema, database: decodeURIComponent(url.pathname.replace(/^\//, "")) };
}

function q(ident: string) {
  return `"${ident.replace(/"/g, '""')}"`;
}

async function listTables(client: Client, schema: string): Promise<string[]> {
  const { rows } = await client.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_type = 'BASE TABLE' ORDER BY table_name`,
    [schema],
  );
  return rows.map((r) => r.table_name);
}

async function listColumns(client: Client, schema: string, table: string): Promise<string[]> {
  const { rows } = await client.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position`,
    [schema, table],
  );
  return rows.map((r) => r.column_name);
}

/** Streams one table in COPY text format and returns its lines (sorted hash computed separately). */
async function copyTableLines(client: Client, schema: string, table: string, columns: string[]): Promise<string[]> {
  const cols = columns.map(q).join(", ");
  const stream = client.query(copyTo(`COPY (SELECT ${cols} FROM ${q(schema)}.${q(table)}) TO STDOUT`));
  const lines: string[] = [];
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) lines.push(line);
  return lines;
}

function hashLines(lines: string[]): string {
  const h = createHash("sha256");
  for (const l of [...lines].sort()) h.update(l).update("\n");
  return h.digest("hex");
}

function encKey(secret: string, salt: Buffer) {
  return scryptSync(secret, salt, 32);
}

function encrypt(buf: Buffer, secret: string): Buffer {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encKey(secret, salt), iv);
  const body = Buffer.concat([cipher.update(buf), cipher.final()]);
  return Buffer.concat([MAGIC, salt, iv, cipher.getAuthTag(), body]);
}

function decrypt(buf: Buffer, secret: string): Buffer {
  const salt = buf.subarray(6, 22);
  const iv = buf.subarray(22, 34);
  const tag = buf.subarray(34, 50);
  const decipher = createDecipheriv("aes-256-gcm", encKey(secret, salt), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(buf.subarray(50)), decipher.final()]);
}

export type BackupOptions = { connectionString: string; dir: string; encryptionKey?: string; keep?: number; label?: string };
export type BackupResult = { file: string; manifest: Manifest; bytes: number; deleted: string[] };

export async function createBackup(opts: BackupOptions): Promise<BackupResult> {
  const { url, schema, database } = parseConn(opts.connectionString);
  mkdirSync(opts.dir, { recursive: true });
  const client = new Client({ connectionString: url.toString() });
  await client.connect();
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
  const base = `${database}-${stamp}${opts.label ? `-${opts.label}` : ""}.cwbak.gz`;
  const gzPath = path.join(opts.dir, base);
  try {
    // A repeatable-read snapshot gives a consistent view across all tables.
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const tables = await listTables(client, schema);
    const migrations = tables.includes("_prisma_migrations")
      ? (
          await client.query<{ migration_name: string }>(
            `SELECT migration_name FROM ${q(schema)}."_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name`,
          )
        ).rows.map((r) => r.migration_name)
      : [];

    const sections: { info: TableInfo; lines: string[] }[] = [];
    for (const name of tables) {
      if (SKIP_DATA.has(name)) continue;
      const columns = await listColumns(client, schema, name);
      const lines = await copyTableLines(client, schema, name, columns);
      sections.push({ info: { name, columns, rows: lines.length, sha256: hashLines(lines) }, lines });
    }
    await client.query("COMMIT");

    const manifest: Manifest = {
      type: "manifest",
      format: 1,
      createdAt: new Date().toISOString(),
      database,
      schema,
      migrations,
      tables: sections.map((s) => ({ name: s.info.name, rows: s.info.rows, sha256: s.info.sha256 })),
    };

    async function* generate() {
      yield JSON.stringify(manifest) + "\n";
      for (const s of sections) {
        yield JSON.stringify({ type: "table", ...s.info }) + "\n";
        for (const l of s.lines) yield l + "\n";
        yield "\\.\n";
      }
    }
    await pipeline(Readable.from(generate()), createGzip(), createWriteStream(gzPath));

    let file = gzPath;
    if (opts.encryptionKey) {
      file = `${gzPath}.enc`;
      writeFileSync(file, encrypt(readFileSync(gzPath), opts.encryptionKey));
      unlinkSync(gzPath);
    }
    const deleted = opts.keep ? pruneBackups(opts.dir, database, opts.keep) : [];
    return { file, manifest, bytes: statSync(file).size, deleted };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
}

/** Keeps the newest `keep` backups of a database and deletes older ones. */
export function pruneBackups(dir: string, database: string, keep: number): string[] {
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir)
    .filter((f) => f.startsWith(`${database}-`) && /\.cwbak\.gz(\.enc)?$/.test(f))
    .sort()
    .reverse();
  const old = files.slice(keep);
  for (const f of old) unlinkSync(path.join(dir, f));
  return old;
}

async function* readBackupLines(file: string, encryptionKey?: string): AsyncGenerator<string> {
  let input: Readable;
  if (file.endsWith(".enc")) {
    if (!encryptionKey) throw new Error("This backup is encrypted; set BACKUP_ENCRYPTION_KEY.");
    input = Readable.from([decrypt(readFileSync(file), encryptionKey)]);
  } else {
    input = createReadStream(file);
  }
  const rl = createInterface({ input: input.pipe(createGunzip()), crlfDelay: Infinity });
  for await (const line of rl) yield line;
}

export type RestoreOptions = {
  file: string;
  /** Connection string of the server; the database name part is replaced by `targetDb`. */
  serverConnectionString: string;
  targetDb: string;
  /** Name of the live database; restore refuses to target it. */
  protectedDbs: string[];
  encryptionKey?: string;
  /** Allows dropping an existing target only when its name contains "restore". */
  replaceExisting?: boolean;
  migrate: (connectionString: string) => Promise<void>;
};
export type RestoreResult = { targetDb: string; tables: { name: string; expected: number; restored: number; ok: boolean }[]; ok: boolean };

export async function restoreBackup(opts: RestoreOptions): Promise<RestoreResult> {
  if (!/^[a-z0-9_]+$/.test(opts.targetDb)) throw new Error("Target database name must be lower_snake_case.");
  if (opts.protectedDbs.includes(opts.targetDb)) throw new Error(`Refusing to restore into the active database "${opts.targetDb}".`);

  const { url, schema } = parseConn(opts.serverConnectionString);
  const admin = new Client({ connectionString: Object.assign(new URL(url), { pathname: "/postgres" }).toString() });
  await admin.connect();
  try {
    const exists = (await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [opts.targetDb])).rowCount;
    if (exists) {
      if (!opts.replaceExisting || !opts.targetDb.includes("restore")) {
        throw new Error(`Database "${opts.targetDb}" already exists. Choose a new name (restores never overwrite).`);
      }
      await admin.query(`DROP DATABASE ${q(opts.targetDb)} WITH (FORCE)`);
    }
    await createUtf8Database(admin, opts.targetDb);
  } finally {
    await admin.end();
  }

  const target = new URL(url);
  target.pathname = `/${opts.targetDb}`;
  const targetWithSchema = new URL(target);
  targetWithSchema.searchParams.set("schema", schema);
  await opts.migrate(targetWithSchema.toString());

  const client = new Client({ connectionString: target.toString() });
  await client.connect();
  const results: RestoreResult["tables"] = [];
  try {
    await client.query(`SET search_path TO ${q(schema)}`);
    // Drop foreign keys during load (works without superuser), re-add afterwards (re-validates).
    const fks = (
      await client.query<{ table: string; name: string; def: string }>(
        `SELECT c.conrelid::regclass::text AS table, c.conname AS name, pg_get_constraintdef(c.oid) AS def
         FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
         WHERE c.contype = 'f' AND n.nspname = $1`,
        [schema],
      )
    ).rows;
    await client.query("BEGIN");
    for (const fk of fks) await client.query(`ALTER TABLE ${fk.table} DROP CONSTRAINT ${q(fk.name)}`);

    let manifest: Manifest | null = null;
    let current: TableInfo | null = null;
    let buffer: string[] = [];
    const expected = new Map<string, TableInfo>();

    const flush = async () => {
      if (!current) return;
      const cols = current.columns.map(q).join(", ");
      const stream = client.query(copyFrom(`COPY ${q(schema)}.${q(current.name)} (${cols}) FROM STDIN`));
      await pipeline(Readable.from(buffer.map((l) => l + "\n")), stream);
      expected.set(current.name, current);
      buffer = [];
      current = null;
    };

    for await (const line of readBackupLines(opts.file, opts.encryptionKey)) {
      if (!manifest) {
        manifest = JSON.parse(line) as Manifest;
        if (manifest.type !== "manifest") throw new Error("Not a CoWork backup file.");
        continue;
      }
      if (!current) {
        current = JSON.parse(line) as TableInfo;
        continue;
      }
      if (line === "\\.") {
        await flush();
        continue;
      }
      buffer.push(line);
    }
    if (current) throw new Error("Backup file is truncated.");

    for (const fk of fks) await client.query(`ALTER TABLE ${fk.table} ADD CONSTRAINT ${q(fk.name)} ${fk.def}`);
    await client.query("COMMIT");

    for (const [name, info] of expected) {
      const lines = await copyTableLines(client, schema, name, info.columns);
      results.push({ name, expected: info.rows, restored: lines.length, ok: lines.length === info.rows && hashLines(lines) === info.sha256 });
    }
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
  return { targetDb: opts.targetDb, tables: results, ok: results.every((r) => r.ok) };
}

export async function readManifest(file: string, encryptionKey?: string): Promise<Manifest> {
  for await (const line of readBackupLines(file, encryptionKey)) return JSON.parse(line) as Manifest;
  throw new Error("Empty backup file.");
}
