import "server-only";
import { Secret, TOTP } from "otpauth";
import QRCode from "qrcode";
import { randomBytes } from "node:crypto";
import { brand } from "@/config/brand";
import { sha256 } from "../crypto";

// RFC 6238 TOTP (30 s, 6 digits, SHA-1: what authenticator apps support).
function totp(secretBase32: string, label: string) {
  return new TOTP({ issuer: brand().name, label, algorithm: "SHA1", digits: 6, period: 30, secret: Secret.fromBase32(secretBase32) });
}

export function generateTotpSecret(): string {
  return new Secret({ size: 20 }).base32;
}

export async function totpSetupData(secretBase32: string, accountEmail: string) {
  const uri = totp(secretBase32, accountEmail).toString();
  // Rendered as a data: URL so no external service and no CSP change are needed.
  const qrDataUrl = await QRCode.toDataURL(uri, { margin: 1, width: 220 });
  return { uri, qrDataUrl, manualKey: secretBase32.replace(/(.{4})/g, "$1 ").trim() };
}

// Replay protection: a code that was accepted cannot be used again while valid.
const usedCodes = new Map<string, number>();

export function verifyTotp(secretBase32: string, code: string, replayKey: string, now = Date.now()): boolean {
  const clean = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(clean)) return false;
  const delta = totp(secretBase32, "x").validate({ token: clean, timestamp: now, window: 1 });
  if (delta === null) return false;
  const key = `${replayKey}:${clean}`;
  for (const [k, exp] of usedCodes) if (exp < now) usedCodes.delete(k);
  if (usedCodes.has(key)) return false;
  usedCodes.set(key, now + 90_000);
  return true;
}

/** Ten single-use recovery codes in the form xxxx-xxxx-xx (shown once, stored hashed). */
export function generateRecoveryCodes(count = 10): string[] {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  return Array.from({ length: count }, () => {
    const bytes = randomBytes(10);
    const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
    return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 10)}`;
  });
}

export function normalizeRecoveryCode(code: string): string {
  return code.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function hashRecoveryCode(code: string): string {
  return sha256(`recovery:${normalizeRecoveryCode(code)}`);
}
