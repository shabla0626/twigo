import type { Client } from "pg";

const ident = (name: string) => {
  if (!/^[a-z0-9_]+$/.test(name)) throw new Error(`Invalid database name "${name}"`);
  return `"${name}"`;
};

/**
 * Creates a database that stores text as UTF-8, so every language, symbol and
 * emoji can be saved. (On Windows the server's default can be WIN1252.)
 * Uses template0, which allows choosing the encoding. If the server's locale
 * cannot be combined with UTF-8 (some Linux setups), falls back to the
 * neutral "C" locale.
 */
export async function createUtf8Database(admin: Client, name: string) {
  try {
    await admin.query(`CREATE DATABASE ${ident(name)} WITH TEMPLATE template0 ENCODING 'UTF8'`);
  } catch (err) {
    if (!/encoding .* does not match locale|incompatible with/i.test((err as Error).message)) throw err;
    await admin.query(`CREATE DATABASE ${ident(name)} WITH TEMPLATE template0 ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C'`);
  }
}

/** The character encoding of a database ("UTF8", "WIN1252", ...). */
export async function databaseEncoding(admin: Client, name: string): Promise<string | null> {
  const r = await admin.query<{ enc: string }>("SELECT pg_encoding_to_char(encoding) AS enc FROM pg_database WHERE datname = $1", [name]);
  return r.rows[0]?.enc ?? null;
}
