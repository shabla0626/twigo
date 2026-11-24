/**
 * The legal documents' state as defined by the release. Framework-free (no server-only imports): used by
 * the web app (src/server/legal.ts), by the server at start-up (server.ts), by the one-time publication
 * script (scripts/legal-publish-reviewed.ts) and by the chat server.
 *
 *  1. Version 1 of every document exists (status PENDING_LEGAL_REVIEW until a review is recorded).
 *  2. Later versions prepared in the release (LegalDefinition.later) are added as PENDING_LEGAL_REVIEW,
 *     only on top of exactly the previous release text (an owner's own version is never numbered over).
 *  3. A later version carrying a `releaseApproval` (the founder's confirmation that counsel approved that
 *     exact text) is approved and published: only when its stored fingerprint equals the approved
 *     fingerprint, never when a newer version exists. The approval statement is stored with the version
 *     and in the audit history; approvedById/publishedById stay empty (no person is invented). The
 *     effective date is the publication date. Running it again changes nothing.
 */
import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { LEGAL_DOCUMENTS, REGISTRATION_ACCEPT, REGISTRATION_ACK, publicationProblem } from "../content/legal";

type Client = PrismaClient | Prisma.TransactionClient;
const fp = (s: string) => createHash("sha256").update(s).digest("hex");

export type ReleaseApprovalOutcome = { key: string; version: number; result: "published" | "already-published" | "not-applicable" | "newer-version-exists" | "text-differs" };

/** Step 1 alone: version 1 of every missing document (also used to prepare test databases "as before version 2"). */
export async function ensureFirstVersions(db: PrismaClient, name: string, now = new Date()) {
  const existing = new Set((await db.legalDocument.findMany({ select: { key: true } })).map((d) => d.key));
  for (const [i, def] of LEGAL_DOCUMENTS.entries()) {
    if (existing.has(def.key)) continue;
    const content = def.text(name);
    try {
      await db.legalDocument.create({
        data: {
          key: def.key,
          title: def.title,
          summary: def.summary,
          sortOrder: i,
          versions: { create: { version: 1, status: "PENDING_LEGAL_REVIEW", content, contentHash: fp(content), changeSummary: "First version, prepared for the Twigo community.", submittedAt: now } },
        },
      });
    } catch (err) {
      if ((err as { code?: string }).code !== "P2002") throw err; // created at the same moment elsewhere
    }
  }
}

export async function ensureLegalState(db: PrismaClient, name: string, now = new Date()): Promise<ReleaseApprovalOutcome[]> {
  // 1. Version 1.
  await ensureFirstVersions(db, name, now);
  const out: ReleaseApprovalOutcome[] = [];
  for (const def of LEGAL_DOCUMENTS) {
    if (!def.later?.length) continue;
    const doc = await db.legalDocument.findUnique({ where: { key: def.key }, select: { id: true } });
    if (!doc) continue;
    const texts = [def.text, ...def.later.map((l) => l.text)];
    // 2. Later versions.
    for (let n = 1; n < texts.length; n++) {
      const latest = await db.legalDocumentVersion.findFirst({ where: { documentId: doc.id }, orderBy: { version: "desc" } });
      if (!latest || latest.version !== n || latest.contentHash !== fp(texts[n - 1]!(name))) break;
      const later = def.later[n - 1]!;
      const content = later.text(name);
      try {
        await db.$transaction(async (tx) => {
          const v = await tx.legalDocumentVersion.create({
            data: {
              documentId: doc.id,
              version: n + 1,
              status: "PENDING_LEGAL_REVIEW",
              content,
              contentHash: fp(content),
              changeSummary: later.changeSummary,
              materialChange: later.materialChange,
              requiresReacceptance: later.materialChange && later.requiresReacceptance,
              submittedAt: now,
            },
          });
          // An older version that was only shown (never published) is replaced, as publication would do.
          await tx.legalDocumentVersion.updateMany({ where: { documentId: doc.id, version: { lt: n + 1 }, status: { in: ["PENDING_LEGAL_REVIEW", "APPROVED"] } }, data: { status: "SUPERSEDED", supersededAt: now } });
          await tx.auditLog.create({ data: { actorId: null, action: "legal.release_version_added", entityType: "LegalDocumentVersion", entityId: v.id, metadata: { key: def.key, version: n + 1, contentHash: v.contentHash } } });
        });
      } catch (err) {
        if ((err as { code?: string }).code !== "P2002") throw err;
      }
    }
    // 3. Release approvals.
    for (const [i, later] of def.later.entries()) {
      if (!later.releaseApproval) continue;
      const number = i + 2;
      const approved = later.releaseApproval;
      const v = await db.legalDocumentVersion.findUnique({ where: { documentId_version: { documentId: doc.id, version: number } } });
      if (!v) {
        out.push({ key: def.key, version: number, result: "not-applicable" });
        continue;
      }
      if (v.contentHash !== approved.fingerprint || fp(v.content) !== approved.fingerprint) {
        out.push({ key: def.key, version: number, result: "text-differs" });
        continue;
      }
      if (v.status === "PUBLISHED" || v.status === "SUPERSEDED") {
        out.push({ key: def.key, version: number, result: v.status === "PUBLISHED" ? "already-published" : "newer-version-exists" });
        continue;
      }
      const newer = await db.legalDocumentVersion.count({ where: { documentId: doc.id, version: { gt: number }, status: { in: ["PUBLISHED", "APPROVED", "PENDING_LEGAL_REVIEW"] } } });
      if (newer || publicationProblem(v.content)) {
        out.push({ key: def.key, version: number, result: "newer-version-exists" });
        continue;
      }
      await db.$transaction(async (tx) => {
        const cur = await tx.legalDocumentVersion.findUniqueOrThrow({ where: { id: v.id } });
        if (cur.status === "PUBLISHED" || cur.status === "SUPERSEDED") return;
        if (cur.status !== "APPROVED") {
          await tx.legalDocumentVersion.update({ where: { id: v.id }, data: { status: "APPROVED", approvedAt: now, approvedById: null, approvalNote: approved.statement } });
          await tx.auditLog.create({
            data: { actorId: null, action: "legal.status_approved", entityType: "LegalDocumentVersion", entityId: v.id, metadata: { from: cur.status, version: number, via: "release-approval", confirmedOn: approved.confirmedOn, contentHash: v.contentHash, statement: approved.statement } },
          });
        }
        await tx.legalDocumentVersion.updateMany({
          where: { documentId: doc.id, id: { not: v.id }, OR: [{ status: "PUBLISHED" }, { version: { lt: number }, status: { in: ["APPROVED", "PENDING_LEGAL_REVIEW"] } }] },
          data: { status: "SUPERSEDED", supersededAt: now },
        });
        await tx.legalDocumentVersion.update({ where: { id: v.id }, data: { status: "PUBLISHED", publishedAt: now, publishedById: null, effectiveDate: now } });
        await tx.auditLog.create({
          data: { actorId: null, action: "legal.status_published", entityType: "LegalDocumentVersion", entityId: v.id, metadata: { from: "APPROVED", version: number, via: "release-approval", effectiveDate: now.toISOString(), contentHash: v.contentHash } },
        });
      });
      out.push({ key: def.key, version: number, result: "published" });
    }
  }
  return out;
}

/**
 * True when the person still has to accept or acknowledge a published version that asks everyone to do so
 * (same rule as pendingReacceptance in src/server/legal.ts). Used where the web app's page guard does not
 * run: file and agreement downloads, uploads and the live chat.
 */
export async function hasPendingReacceptance(db: Client, userId: string): Promise<boolean> {
  const required = [...REGISTRATION_ACCEPT, ...REGISTRATION_ACK];
  const flagged = await db.legalDocumentVersion.findMany({
    where: { requiresReacceptance: true, publishedAt: { not: null }, document: { key: { in: required } } },
    orderBy: { version: "desc" },
    select: { version: true, documentId: true },
  });
  const needFrom = new Map<string, number>();
  for (const f of flagged) if (!needFrom.has(f.documentId)) needFrom.set(f.documentId, f.version);
  for (const [documentId, version] of needFrom) {
    const published = await db.legalDocumentVersion.count({ where: { documentId, status: "PUBLISHED" } });
    if (!published) continue;
    const ok = await db.legalAcceptance.count({ where: { userId, legalVersion: { documentId, version: { gte: version } } } });
    if (!ok) return true;
  }
  return false;
}
