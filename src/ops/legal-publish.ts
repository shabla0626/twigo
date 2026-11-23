/**
 * Publishes the legal documents after the founder confirmed that a lawyer reviewed them.
 *
 * Used once on a new production database (scripts/legal-publish-reviewed.ts), where the documents
 * start as version 1 "Pending legal review". For every document it acts ONLY on the version whose
 * text is exactly the reviewed text (same SHA-256 fingerprint as the text in this release): that
 * version is marked Approved, with the reviewer statement, and then Published. Any other text is
 * left alone and reported. No server-only imports: runs outside the web app.
 */
import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { LEGAL_DOCUMENTS } from "../content/legal";

export type PublishOutcome = { key: string; title: string; result: "published" | "already-published" | "text-differs"; version?: number; fingerprint: string };

export async function publishReviewedDocuments(
  db: PrismaClient,
  opts: { ownerId: string; orgName: string; approvalNote: string; effectiveDate: Date; dryRun?: boolean },
): Promise<PublishOutcome[]> {
  if (opts.approvalNote.trim().length < 10) throw new Error("Say who reviewed the documents and when (at least 10 characters).");
  const owner = await db.user.findUnique({ where: { id: opts.ownerId }, select: { role: true } });
  if (owner?.role !== "OWNER") throw new Error("Only the owner can approve and publish legal documents.");
  const out: PublishOutcome[] = [];
  for (const [i, def] of LEGAL_DOCUMENTS.entries()) {
    const content = def.text(opts.orgName);
    const fingerprint = createHash("sha256").update(content).digest("hex");
    // Same seeding as the web app (src/server/legal.ts): version 1, pending legal review.
    let doc = await db.legalDocument.findUnique({ where: { key: def.key } });
    if (!doc && !opts.dryRun) {
      doc = await db.legalDocument.create({
        data: {
          key: def.key, title: def.title, summary: def.summary, sortOrder: i,
          versions: { create: { version: 1, status: "PENDING_LEGAL_REVIEW", content, contentHash: fingerprint, changeSummary: "First version, prepared for the Twigo community.", submittedAt: new Date() } },
        },
      });
    }
    const version = doc ? await db.legalDocumentVersion.findFirst({ where: { documentId: doc.id, contentHash: fingerprint }, orderBy: { version: "desc" } }) : null;
    if (!doc || !version) {
      out.push({ key: def.key, title: def.title, result: doc ? "text-differs" : "published", fingerprint, version: doc ? undefined : 1 });
      continue;
    }
    if (version.status === "PUBLISHED") {
      out.push({ key: def.key, title: def.title, result: "already-published", version: version.version, fingerprint });
      continue;
    }
    if (version.status !== "PENDING_LEGAL_REVIEW" && version.status !== "APPROVED") {
      out.push({ key: def.key, title: def.title, result: "text-differs", version: version.version, fingerprint });
      continue;
    }
    if (!opts.dryRun) {
      await db.$transaction(async (tx) => {
        const now = new Date();
        if (version.status === "PENDING_LEGAL_REVIEW") {
          await tx.legalDocumentVersion.update({ where: { id: version.id }, data: { status: "APPROVED", approvedAt: now, approvedById: opts.ownerId, approvalNote: opts.approvalNote.trim().slice(0, 1000) } });
          await tx.auditLog.create({ data: { actorId: opts.ownerId, action: "legal.status_approved", entityType: "LegalDocumentVersion", entityId: version.id, metadata: { from: "PENDING_LEGAL_REVIEW", version: version.version, via: "legal-publish-reviewed", contentHash: fingerprint } } });
        }
        await tx.legalDocumentVersion.updateMany({
          where: { documentId: version.documentId, id: { not: version.id }, OR: [{ status: "PUBLISHED" }, { version: { lt: version.version }, status: { in: ["APPROVED", "PENDING_LEGAL_REVIEW"] } }] },
          data: { status: "SUPERSEDED", supersededAt: now },
        });
        await tx.legalDocumentVersion.update({ where: { id: version.id }, data: { status: "PUBLISHED", publishedAt: now, publishedById: opts.ownerId, effectiveDate: opts.effectiveDate } });
        await tx.auditLog.create({ data: { actorId: opts.ownerId, action: "legal.status_published", entityType: "LegalDocumentVersion", entityId: version.id, metadata: { from: "APPROVED", version: version.version, via: "legal-publish-reviewed" } } });
      });
    }
    out.push({ key: def.key, title: def.title, result: "published", version: version.version, fingerprint });
  }
  return out;
}
