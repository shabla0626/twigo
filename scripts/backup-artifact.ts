/**
 * Encrypts or checks a backup artifact with BACKUP_ENCRYPTION_KEY, using the backup file format
 * ("CWBAK1" + salt + iv + tag + data; AES-256-GCM, authenticated; src/ops/backup.ts). Used by the
 * deployment script so that the archive of uploaded files and the settings snapshot are never stored in
 * plain text. Streaming: large archives are never held in memory.
 *
 *   ... | npm run -s backup:artifact -- encrypt <out file>     read stdin, write <out file> (mode 0600), verified
 *   npm run -s backup:artifact -- verify <file> [<sha256>]       decrypt and check; print the plain SHA-256
 *   npm run -s backup:artifact -- decrypt <file>                 write the plain content to stdout (restore);
 *                                                                exits non-zero if the data was changed
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from "node:crypto";
import { closeSync, createReadStream, createWriteStream, openSync, readSync, renameSync, unlinkSync, writeSync } from "node:fs";
import { Transform, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { loadDotEnv } from "./load-env";

const MAGIC = Buffer.from("CWBAK1");
const HEADER = 50; // magic 6 + salt 16 + iv 12 + tag 16
// The same key derivation as src/ops/backup.ts (encKey), so these files decrypt with decryptBuffer too.
const encKey = (secret: string, salt: Buffer) => scryptSync(secret, salt, 32);

async function encryptStream(out: string, key: string): Promise<{ bytes: number; sha: string }> {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encKey(key, salt), iv);
  const hash = createHash("sha256");
  let bytes = 0;
  const tmp = `${out}.partial`;
  const ws = createWriteStream(tmp, { mode: 0o600 });
  ws.write(Buffer.concat([MAGIC, salt, iv, Buffer.alloc(16)])); // the tag is written once it is known
  const count = new Transform({
    transform(chunk: Buffer, _e, cb) {
      bytes += chunk.length;
      hash.update(chunk);
      cb(null, chunk);
    },
  });
  await pipeline(process.stdin, count, cipher, ws);
  if (!bytes) {
    unlinkSync(tmp);
    throw new Error("Nothing to encrypt (empty input).");
  }
  const fd = openSync(tmp, "r+");
  writeSync(fd, cipher.getAuthTag(), 0, 16, 34);
  closeSync(fd);
  const sha = hash.digest("hex");
  // Verified before it counts: decrypting must give back exactly the input.
  const check = await decryptTo(tmp, key, null);
  if (check.sha !== sha || check.bytes !== bytes) throw new Error("Encrypted artifact did not verify.");
  renameSync(tmp, out);
  return { bytes, sha };
}

/** Decrypts `file`, streaming the plain data to `sink` (or nowhere); throws at the end if it was changed or the key is wrong. */
async function decryptTo(file: string, key: string, sink: NodeJS.WritableStream | null): Promise<{ bytes: number; sha: string }> {
  const fd = openSync(file, "r");
  const head = Buffer.alloc(HEADER);
  const n = readSync(fd, head, 0, HEADER, 0);
  closeSync(fd);
  if (n < HEADER || !head.subarray(0, 6).equals(MAGIC)) throw new Error("Not an encrypted Twigo backup artifact.");
  const decipher = createDecipheriv("aes-256-gcm", encKey(key, head.subarray(6, 22)), head.subarray(22, 34));
  decipher.setAuthTag(head.subarray(34, 50));
  const hash = createHash("sha256");
  let bytes = 0;
  const out =
    sink ??
    new Writable({
      write(_c, _e, cb) {
        cb();
      },
    });
  const count = new Transform({
    transform(chunk: Buffer, _e, cb) {
      bytes += chunk.length;
      hash.update(chunk);
      cb(null, chunk);
    },
  });
  await pipeline(createReadStream(file, { start: HEADER }), decipher, count, out);
  return { bytes, sha: hash.digest("hex") };
}

async function main() {
  loadDotEnv();
  const key = process.env.BACKUP_ENCRYPTION_KEY || "";
  if (key.length < 16) throw new Error("BACKUP_ENCRYPTION_KEY is not set (at least 16 characters): artifacts are never written unencrypted.");
  const [cmd, file, expected] = process.argv.slice(2);
  const usage = "Usage: encrypt <out> | verify <file> [sha256] | decrypt <file>";
  if (!file) throw new Error(usage);
  if (cmd === "encrypt") {
    const r = await encryptStream(file, key);
    console.log(`encrypted ${r.bytes} bytes, sha256 ${r.sha}`);
    return;
  }
  if (cmd === "verify") {
    const r = await decryptTo(file, key, null);
    if (expected && expected !== r.sha) throw new Error(`Checksum differs: expected ${expected}, got ${r.sha}.`);
    console.log(`ok ${r.bytes} bytes, sha256 ${r.sha}`);
    return;
  }
  if (cmd === "decrypt") {
    await decryptTo(file, key, process.stdout);
    return;
  }
  throw new Error(usage);
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
