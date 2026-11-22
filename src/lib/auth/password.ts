import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";
import bcrypt from "bcryptjs";

/**
 * Password hashing with Node's built-in scrypt.
 *
 * scrypt runs on libuv's thread pool, so checking a password does not block
 * the server. (The previous pure-JavaScript bcrypt held the whole process,
 * including live chat, for about 230 ms per check.)
 *
 * Format: scrypt$<N>$<r>$<p>$<salt base64url>$<hash base64url>
 * Older bcrypt hashes ($2a$/$2b$) are still accepted; they are replaced with
 * scrypt the next time the person signs in (see needsRehash).
 */
const N = 1 << 15; // CPU/memory cost (32 MiB with r = 8)
const R = 8;
const P = 1;
const KEY_LEN = 32;
const SALT_LEN = 16;
const MAXMEM = 64 * 1024 * 1024;

function scryptAsync(password: string, salt: Buffer, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => scrypt(password, salt, KEY_LEN, opts, (err, key) => (err ? reject(err) : resolve(key))));
}

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(SALT_LEN);
  const key = await scryptAsync(plain, salt, { N, r: R, p: P, maxmem: MAXMEM });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  if (stored.startsWith("scrypt$")) {
    const [, n, r, p, saltB64, keyB64] = stored.split("$");
    const expected = Buffer.from(keyB64 ?? "", "base64url");
    if (!n || !r || !p || !saltB64 || expected.length !== KEY_LEN) return false;
    const key = await scryptAsync(plain, Buffer.from(saltB64, "base64url"), { N: Number(n), r: Number(r), p: Number(p), maxmem: MAXMEM });
    return timingSafeEqual(key, expected);
  }
  if (stored.startsWith("$2")) return bcrypt.compare(plain, stored); // legacy hashes
  return false;
}

/** True for hashes made with older or weaker settings; replace them after a successful sign-in. */
export function needsRehash(stored: string): boolean {
  return !stored.startsWith(`scrypt$${N}$${R}$${P}$`);
}

/** Admin password policy: at least 12 characters with letters and numbers. */
export function passwordPolicyError(plain: string): string | null {
  if (plain.length < 12) return "Password must be at least 12 characters.";
  if (plain.length > 128) return "Password must be at most 128 characters.";
  if (!/[a-zA-Z]/.test(plain) || !/\d/.test(plain)) return "Password must contain letters and numbers.";
  return null;
}

// Hash used to equalize timing when an account does not exist (computed once).
let dummy: Promise<string> | null = null;
function dummyHash(): Promise<string> {
  dummy ??= hashPassword("timing-equalizer-not-a-real-password");
  return dummy;
}

/**
 * Spends the same time as a real password check, so responses for unknown
 * accounts cannot be told apart by timing.
 */
export async function simulatePasswordCheck(plain = "x"): Promise<void> {
  await verifyPassword(plain, await dummyHash());
}
