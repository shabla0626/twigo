// One running instance per database.
//
// A PostgreSQL advisory lock is taken on a connection that stays open for the
// life of the process. A second instance on the same database cannot take it.
// The lock disappears by itself when the process ends or crashes (its
// connection closes), so a restart is never blocked by a dead instance.
import { Client } from "pg";

export const INSTANCE_LOCK = 81_002_000;

let held: Client | null = null;

/** Returns true when this process now holds the lock (or already held it), false when another instance does. */
export async function holdInstanceLock(databaseUrl: string): Promise<boolean> {
  if (held) return true;
  const url = new URL(databaseUrl);
  url.searchParams.delete("schema");
  const client = new Client({ connectionString: url.toString() });
  await client.connect();
  const { rows } = await client.query<{ ok: boolean }>("SELECT pg_try_advisory_lock($1) AS ok", [INSTANCE_LOCK]);
  if (!rows[0]?.ok) {
    await client.end().catch(() => {});
    return false;
  }
  // Keep the connection open on purpose; if it drops, the lock is gone and may be taken again.
  client.on("error", () => {
    held = null;
  });
  held = client;
  return true;
}

/** For tests and shutdown. */
export async function releaseInstanceLock(): Promise<void> {
  const c = held;
  held = null;
  await c?.end().catch(() => {});
}
