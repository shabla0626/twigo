// Small cryptographic helpers. No `server-only` import: the realtime server
// (outside Next's bundler) uses these too. Never import from client code.
import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";

/** URL-safe random token with `bytes` bytes of entropy. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function dataKey(): Buffer {
  const explicit = process.env.ENCRYPTION_KEY;
  const material = explicit && explicit.length >= 32 ? explicit : process.env.AUTH_SECRET;
  if (!material) throw new Error("ENCRYPTION_KEY or AUTH_SECRET must be set");
  // Domain-separated derivation, so the raw secret is never used directly as a key.
  return Buffer.from(hkdfSync("sha256", material, "cowork-at-rest", "aes-256-gcm v1", 32));
}

/** AES-256-GCM encryption for small secrets stored in the database. */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", dataKey(), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), body.toString("base64url")].join(".");
}

export function decryptSecret(blob: string): string {
  const [v, iv, tag, body] = blob.split(".");
  if (v !== "v1" || !iv || !tag || !body) throw new Error("Unsupported secret format");
  const decipher = createDecipheriv("aes-256-gcm", dataKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
}
