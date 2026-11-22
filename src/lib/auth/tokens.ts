import "server-only";
import type { Prisma, TokenKind } from "@prisma/client";
import { db } from "../db";
import { randomToken, sha256 } from "../crypto";
import { TOKEN_TTL_HOURS } from "./constants";

/**
 * Issues a single-use token and returns the raw value (only its hash is stored).
 * Any earlier unused token of the same kind for the user is invalidated.
 */
export async function issueToken(
  userId: string,
  kind: TokenKind,
  opts: { email?: string; createdById?: string; ttlHours?: number } = {},
  tx: Prisma.TransactionClient = db,
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + (opts.ttlHours ?? TOKEN_TTL_HOURS[kind]) * 3600_000);
  await tx.accountToken.updateMany({ where: { userId, kind, usedAt: null }, data: { usedAt: new Date() } });
  await tx.accountToken.create({
    data: { userId, kind, tokenHash: sha256(token), email: opts.email ?? null, expiresAt, createdById: opts.createdById ?? null },
  });
  return { token, expiresAt };
}

export type TokenCheck =
  | { ok: true; id: string; userId: string; email: string | null }
  | { ok: false; reason: "invalid" | "expired" | "used" };

/** Looks a token up without consuming it (to render the activation form). */
export async function inspectToken(raw: string, kind: TokenKind, now = new Date()): Promise<TokenCheck> {
  if (!raw || raw.length > 100) return { ok: false, reason: "invalid" };
  const t = await db.accountToken.findUnique({ where: { tokenHash: sha256(raw) } });
  if (!t || t.kind !== kind) return { ok: false, reason: "invalid" };
  if (t.usedAt) return { ok: false, reason: "used" };
  if (t.expiresAt <= now) return { ok: false, reason: "expired" };
  return { ok: true, id: t.id, userId: t.userId, email: t.email };
}

/**
 * Atomically consumes a token inside a transaction. Two concurrent uses of
 * the same token cannot both succeed (conditional update on usedAt IS NULL).
 */
export async function consumeToken(tx: Prisma.TransactionClient, raw: string, kind: TokenKind, now = new Date()): Promise<TokenCheck> {
  if (!raw || raw.length > 100) return { ok: false, reason: "invalid" };
  const hash = sha256(raw);
  const t = await tx.accountToken.findUnique({ where: { tokenHash: hash } });
  if (!t || t.kind !== kind) return { ok: false, reason: "invalid" };
  if (t.usedAt) return { ok: false, reason: "used" };
  if (t.expiresAt <= now) return { ok: false, reason: "expired" };
  const res = await tx.accountToken.updateMany({ where: { id: t.id, usedAt: null }, data: { usedAt: now } });
  if (res.count !== 1) return { ok: false, reason: "used" };
  return { ok: true, id: t.id, userId: t.userId, email: t.email };
}

export function describeTtl(hours: number): string {
  if (hours < 24) return hours === 1 ? "1 hour" : `${hours} hours`;
  const days = Math.round(hours / 24);
  return days === 1 ? "24 hours" : `${days} days`;
}
