/**
 * Erasure ledger: the durable list of accounts erased at the person's request, kept OUTSIDE the database
 * and outside the database backups, so that restoring an older backup can never bring an erased person's
 * data back.
 *
 * - Location: LEDGER_DIR (Docker: /data/ledger, next to but separate from /data/backups), file
 *   `erasures.ledger`, directory mode 0700, file mode 0600. Append-only: entries are only ever added.
 *   The file is created empty when the server starts (production), so a missing file at a restore means
 *   a lost ledger, and the restore fails.
 * - Content: no names, email addresses or other personal data. Each entry holds the account id (a random
 *   identifier), the time, the operation version and the member's chosen categories.
 * - Encrypted at rest: each entry's data is AES-256-GCM encrypted (backup format, key BACKUP_ENCRYPTION_KEY;
 *   in development without that key, ENCRYPTION_KEY).
 * - Tamper-evident: every line carries an HMAC-SHA-256 (keyed from the ledger key) over its number, the
 *   previous line's hash and its own data; a changed, removed or reordered line breaks the chain and the
 *   ledger is refused as a whole. Without the key the chain cannot be recomputed. Every database backup
 *   records the ledger head (number and hash of the last line) at the time it was made; a restore refuses
 *   a ledger that does not contain that line unchanged (an older copy put back, or a truncated ledger).
 *   Lines appended after the newest backup are protected by the chain only.
 * - Replay after a restore is idempotent (the same erasure applied again changes nothing).
 */
import { createHash, createHmac } from "node:crypto";
import { appendFileSync, chmodSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";
import { decryptBuffer, encryptBuffer, type Manifest } from "./backup";
import { ERASURE_OP_VERSION, eraseAccountData, verifyErased, type ErasureChoices } from "./erasure";

export const LEDGER_FILE = "erasures.ledger";
const GENESIS = "0".repeat(64);

export type LedgerEntry = { userId: string; requestId: string | null; at: string; op: string; choices: ErasureChoices; retainApplicant: boolean };
export type LedgerHead = { seq: number; hash: string };
type Line = { seq: number; prev: string; data: string; hash: string };

const chainKey = (key: string) => createHash("sha256").update(`twigo-erasure-ledger-chain/1\0${key}`).digest();
const lineHash = (key: string, seq: number, prev: string, data: string) => createHmac("sha256", chainKey(key)).update(`${seq}\n${prev}\n${data}`).digest("hex");

export function ledgerKey(env: { BACKUP_ENCRYPTION_KEY?: string; ENCRYPTION_KEY?: string }): string {
  const k = env.BACKUP_ENCRYPTION_KEY || env.ENCRYPTION_KEY || "";
  if (k.length < 16) throw new Error("The erasure ledger needs BACKUP_ENCRYPTION_KEY (or, in development, ENCRYPTION_KEY).");
  return k;
}

function rawLines(dir: string): string[] | null {
  const file = path.join(dir, LEDGER_FILE);
  return existsSync(file) ? readFileSync(file, "utf8").split("\n").filter(Boolean) : null;
}

/** Verifies the chain (fast: no decryption). Throws when a line is unreadable or the chain is broken. */
function verifiedLines(raw: string[], key: string): Line[] {
  const out: Line[] = [];
  let prev = GENESIS;
  for (const [i, r] of raw.entries()) {
    let l: Line;
    try {
      l = JSON.parse(r) as Line;
    } catch {
      throw new Error(`Erasure ledger line ${i + 1} is not readable.`);
    }
    if (l.seq !== i + 1 || l.prev !== prev || typeof l.data !== "string" || l.hash !== lineHash(key, l.seq, l.prev, l.data)) throw new Error(`Erasure ledger chain is broken at line ${i + 1}.`);
    out.push(l);
    prev = l.hash;
  }
  return out;
}

/** Creates the empty ledger (folder 0700, file 0600) if it does not exist yet. */
export function ensureLedger(dir: string) {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, LEDGER_FILE);
  if (!existsSync(file)) {
    try {
      writeFileSync(file, "", { mode: 0o600, flag: "wx" });
    } catch (e) {
      if ((e as { code?: string }).code !== "EEXIST") throw e;
    }
  }
}

/** The verified head of the ledger (number and hash of its last line); null when there is no ledger file. */
export function ledgerHead(dir: string, key: string): LedgerHead | null {
  const raw = rawLines(dir);
  if (!raw) return null;
  const v = verifiedLines(raw, key);
  const last = v[v.length - 1];
  return last ? { seq: last.seq, hash: last.hash } : { seq: 0, hash: GENESIS };
}

/** The ledger head from the process settings (LEDGER_DIR, BACKUP_ENCRYPTION_KEY / ENCRYPTION_KEY), recorded in backups. */
export function currentLedgerHead(env: NodeJS.ProcessEnv = process.env): LedgerHead | null {
  let key: string;
  try {
    key = ledgerKey({ BACKUP_ENCRYPTION_KEY: env.BACKUP_ENCRYPTION_KEY, ENCRYPTION_KEY: env.ENCRYPTION_KEY });
  } catch {
    return null;
  }
  return ledgerHead(path.resolve(env.LEDGER_DIR || "ledger"), key);
}

/**
 * Reads and verifies the whole ledger. Throws when it cannot be read, decrypted or its chain is broken.
 * A missing file gives an empty list only with `allowMissing`.
 */
export function readLedger(dir: string, key: string, opts: { allowMissing?: boolean } = { allowMissing: true }): LedgerEntry[] {
  const raw = rawLines(dir);
  if (!raw) {
    if (opts.allowMissing) return [];
    throw new Error(`The erasure ledger ${path.join(dir, LEDGER_FILE)} does not exist; a restore without it could bring erased data back.`);
  }
  return verifiedLines(raw, key).map((l, i) => {
    try {
      return JSON.parse(decryptBuffer(Buffer.from(l.data, "base64"), key).toString("utf8")) as LedgerEntry;
    } catch {
      throw new Error(`Erasure ledger line ${i + 1} cannot be decrypted (wrong key or changed data).`);
    }
  });
}

/** Appends one entry, after verifying the existing chain. One process writes at a time (the site enforces a single instance). */
export function appendLedger(dir: string, key: string, entry: LedgerEntry) {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, LEDGER_FILE);
  const head = ledgerHead(dir, key) ?? { seq: 0, hash: GENESIS }; // throws: a ledger that does not verify is never extended
  const seq = head.seq + 1;
  const data = encryptBuffer(Buffer.from(JSON.stringify(entry), "utf8"), key).toString("base64");
  appendFileSync(file, JSON.stringify({ seq, prev: head.hash, data, hash: lineHash(key, seq, head.hash, data) }) + "\n", { mode: 0o600 });
  try {
    chmodSync(file, 0o600);
  } catch {
    /* not supported on every file system (for example Windows); the directory mode still applies */
  }
}

export type ReplayReport = { entries: number; applied: { userId: string; changed: boolean }[]; problems: { userId: string; problems: string[] }[]; filesRemoved: number };

/**
 * Re-applies every erasure in the ledger to a (restored) database and verifies the result. Erasures that
 * happened after the backup was made are re-done; erasures already contained in the backup are confirmed.
 * Profile photo files of erased accounts found in `storageDir` are removed. The outcome is recorded in
 * that database's audit log. `ok` is false when any account still shows erased data.
 */
export async function replayErasures(db: PrismaClient, entries: LedgerEntry[], opts: { storageDir?: string; backupCreatedAt?: string; now?: Date }): Promise<{ ok: boolean; report: ReplayReport }> {
  const now = opts.now ?? new Date();
  const report: ReplayReport = { entries: entries.length, applied: [], problems: [], filesRemoved: 0 };
  for (const e of entries) {
    if (e.op !== ERASURE_OP_VERSION) throw new Error(`Unknown erasure operation ${e.op}.`);
    const exists = await db.user.findUnique({ where: { id: e.userId }, select: { erasedAt: true } });
    if (!exists) continue; // the account did not exist yet when the backup was made
    const photoKeys: string[] = [];
    const changed = !exists.erasedAt;
    await db.$transaction(async (tx) => {
      const r = await eraseAccountData(tx, e.userId, { ...e.choices, retainApplicant: e.retainApplicant, now });
      photoKeys.push(...r.photoKeys);
    });
    if (opts.storageDir) {
      const root = path.resolve(opts.storageDir);
      for (const k of photoKeys) {
        const p = path.resolve(root, k);
        if (p.startsWith(root + path.sep) && existsSync(p)) {
          unlinkSync(p);
          report.filesRemoved++;
        }
      }
    }
    report.applied.push({ userId: e.userId, changed });
    const problems = await db.$transaction((tx) => verifyErased(tx, e.userId, e.choices));
    if (problems.length) report.problems.push({ userId: e.userId, problems });
  }
  const ok = report.problems.length === 0;
  await db.auditLog.create({
    data: { actorId: null, action: "privacy.erasure_ledger_replayed", entityType: "Database", entityId: null, metadata: { entries: report.entries, reapplied: report.applied.filter((a) => a.changed).length, filesRemoved: report.filesRemoved, ok, backupCreatedAt: opts.backupCreatedAt ?? null } },
  });
  return { ok, report };
}

/**
 * The restore step (RestoreOptions.reconcile): reads the ledger (it must exist unless `allowMissing`),
 * checks it against the head recorded in the backup (that line must be present and unchanged: an older,
 * truncated or different ledger is refused), then replays every erasure into the restored database.
 */
export async function reconcileRestore(
  db: PrismaClient,
  manifest: Pick<Manifest, "createdAt" | "ledger">,
  opts: { dir: string; key: string; storageDir?: string; allowMissing?: boolean },
): Promise<{ ok: boolean; detail: ReplayReport | string }> {
  let entries: LedgerEntry[];
  try {
    entries = readLedger(opts.dir, opts.key, { allowMissing: opts.allowMissing });
    const recorded = manifest.ledger;
    if (recorded && recorded.seq > 0) {
      const raw = rawLines(opts.dir) ?? [];
      const at = raw.length >= recorded.seq ? (JSON.parse(raw[recorded.seq - 1]!) as Line) : null;
      if (!at || at.hash !== recorded.hash)
        throw new Error(`The erasure ledger is older than, or different from, the one this backup was made with (the backup saw ${recorded.seq} entr${recorded.seq === 1 ? "y" : "ies"}; this ledger has ${raw.length}).`);
    }
  } catch (e) {
    return { ok: false, detail: (e as Error).message };
  }
  const r = await replayErasures(db, entries, { storageDir: opts.storageDir, backupCreatedAt: manifest.createdAt });
  return { ok: r.ok, detail: r.report };
}
