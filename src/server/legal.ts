import "server-only";
import { cache } from "react";
import type { AcceptanceKind, LegalDocumentStatus, Prisma } from "@prisma/client";
import { brand } from "@/config/brand";
import { LEGAL_DOCUMENTS, REGISTRATION_ACCEPT, REGISTRATION_ACK, isLegalKey, legalDefinition, type LegalKey } from "@/content/legal";
import { audit } from "@/lib/audit";
import { sha256 } from "@/lib/crypto";
import { db } from "@/lib/db";

/**
 * Legal documents: versions, states, fingerprints and acceptance records.
 *
 * Rules (decided for the Twigo transformation, see docs/TWIGO-IMPLEMENTATION-REPORT.md):
 * - Version 1 of each document is created from src/content/legal the first time it is needed, with
 *   status PENDING_LEGAL_REVIEW. Nothing generated is ever marked APPROVED automatically.
 * - The text of a version is frozen once it leaves DRAFT; its fingerprint is SHA-256 of that text.
 * - The version shown to the public is the latest PUBLISHED one; while none is published, the latest
 *   one awaiting review (or approved) is shown with a clear notice that it is a draft.
 * - DRAFT versions are never public.
 * - Only APPROVED versions can be published. Publishing supersedes the previous published version.
 */

export const STATUS_LABELS: Record<LegalDocumentStatus, string> = {
  DRAFT: "Draft",
  PENDING_LEGAL_REVIEW: "Pending legal review",
  APPROVED: "Approved",
  PUBLISHED: "Published",
  SUPERSEDED: "Superseded",
};

export const fingerprint = (content: string) => sha256(content);
/** A short form for display: the full fingerprint is always available too. */
export const shortFingerprint = (hash: string) => `${hash.slice(0, 8)} ${hash.slice(8, 16)}`;

/** Creates any document (and its version 1) that does not exist yet. Safe to call at any time. */
export const ensureLegalDocuments = cache(async () => {
  const existing = await db.legalDocument.findMany({ select: { key: true } });
  const have = new Set(existing.map((d) => d.key));
  const missing = LEGAL_DOCUMENTS.filter((d) => !have.has(d.key));
  if (!missing.length) return;
  const name = brand().name;
  for (const [i, def] of LEGAL_DOCUMENTS.entries()) {
    if (have.has(def.key)) continue;
    const content = def.text(name);
    try {
      await db.legalDocument.create({
        data: {
          key: def.key,
          title: def.title,
          summary: def.summary,
          sortOrder: i,
          versions: {
            create: {
              version: 1,
              status: "PENDING_LEGAL_REVIEW",
              content,
              contentHash: fingerprint(content),
              changeSummary: "First version, prepared for the Twigo community. Not reviewed by a lawyer.",
              submittedAt: new Date(),
            },
          },
        },
      });
    } catch (err) {
      // Another request created it at the same moment: fine.
      if ((err as { code?: string }).code !== "P2002") throw err;
    }
  }
});

const SHOWN: LegalDocumentStatus[] = ["PUBLISHED", "APPROVED", "PENDING_LEGAL_REVIEW"];

/** The version visitors see: the latest published one, otherwise the latest one awaiting review or approved. */
export async function displayedVersion(key: LegalKey, client: Prisma.TransactionClient = db) {
  await ensureLegalDocuments();
  const doc = await client.legalDocument.findUnique({ where: { key } });
  if (!doc) return null;
  const published = await client.legalDocumentVersion.findFirst({ where: { documentId: doc.id, status: "PUBLISHED" }, orderBy: { version: "desc" } });
  const version =
    published ?? (await client.legalDocumentVersion.findFirst({ where: { documentId: doc.id, status: { in: SHOWN } }, orderBy: { version: "desc" } }));
  return version ? { doc, version } : null;
}

/** A specific version, as long as it is not a private draft. */
export async function publicVersion(key: string, versionNo: number) {
  if (!isLegalKey(key) || !Number.isInteger(versionNo) || versionNo < 1) return null;
  await ensureLegalDocuments();
  const doc = await db.legalDocument.findUnique({ where: { key } });
  if (!doc) return null;
  const version = await db.legalDocumentVersion.findUnique({ where: { documentId_version: { documentId: doc.id, version: versionNo } } });
  if (!version || version.status === "DRAFT") return null;
  return { doc, version };
}

/** All non-draft versions of a document, newest first. */
export async function publicHistory(key: LegalKey) {
  await ensureLegalDocuments();
  return db.legalDocumentVersion.findMany({
    where: { document: { key }, status: { not: "DRAFT" } },
    orderBy: { version: "desc" },
    select: { version: true, status: true, effectiveDate: true, publishedAt: true, createdAt: true, changeSummary: true, contentHash: true },
  });
}

/** The displayed version of several documents in one query (same rule as displayedVersion). */
async function displayedVersions(keys: readonly LegalKey[]) {
  await ensureLegalDocuments();
  const docs = await db.legalDocument.findMany({
    where: { key: { in: [...keys] } },
    include: { versions: { where: { status: { in: SHOWN } }, orderBy: { version: "desc" } } },
  });
  const out = new Map<string, { doc: (typeof docs)[number]; version: (typeof docs)[number]["versions"][number] }>();
  for (const d of docs) {
    const version = d.versions.find((v) => v.status === "PUBLISHED") ?? d.versions[0];
    if (version) out.set(d.key, { doc: d, version });
  }
  return out;
}

/** Overview of every document with its displayed version (for /legal). */
export async function legalIndex() {
  const shown = await displayedVersions(LEGAL_DOCUMENTS.map((d) => d.key));
  return LEGAL_DOCUMENTS.flatMap((def) => {
    const x = shown.get(def.key);
    return x ? [{ key: def.key, title: x.doc.title, summary: x.doc.summary, acceptance: def.acceptance, version: x.version }] : [];
  });
}

/** The versions a person must accept or acknowledge at registration, as shown on the form. */
export async function registrationDocuments() {
  const shown = await displayedVersions([...REGISTRATION_ACCEPT, ...REGISTRATION_ACK]);
  const pick = (keys: readonly LegalKey[]) =>
    keys.flatMap((k) => {
      const x = shown.get(k);
      return x ? [{ key: k, title: x.doc.title, version: x.version.version, versionId: x.version.id }] : [];
    });
  return { accept: pick(REGISTRATION_ACCEPT), ack: pick(REGISTRATION_ACK) };
}

type RecordInput = { userId: string; key: LegalKey; kind: AcceptanceKind; method: string; context?: string | null; versionId?: string };

/**
 * Records an acceptance or acknowledgment of the displayed version (or of `versionId`, which must be
 * that same displayed version: a form shown earlier must not accept a text the person never saw).
 * Returns null when the version shown on the form is no longer current.
 */
export async function recordAcceptance(input: RecordInput, client: Prisma.TransactionClient = db) {
  const shown = await displayedVersion(input.key, client);
  if (!shown) return null;
  if (input.versionId && input.versionId !== shown.version.id) return null;
  return client.legalAcceptance.create({
    data: {
      userId: input.userId,
      versionId: shown.version.id,
      documentKey: input.key,
      version: shown.version.version,
      contentHash: shown.version.contentHash,
      kind: input.kind,
      method: input.method,
      context: input.context ?? null,
    },
  });
}

/** Everything a person has accepted or acknowledged, newest first. */
export async function acceptancesOf(userId: string) {
  return db.legalAcceptance.findMany({
    where: { userId },
    orderBy: { acceptedAt: "desc" },
    include: { legalVersion: { select: { status: true, document: { select: { title: true, key: true } } } } },
  });
}

/**
 * Published versions that ask everyone to accept again and that this person has not accepted yet
 * (only documents accepted at registration). An empty list means nothing is waiting.
 */
export const pendingReacceptance = cache(async (userId: string) => {
  const required = [...REGISTRATION_ACCEPT, ...REGISTRATION_ACK];
  // For each document: the newest version that was ever published with "ask everyone to accept again"
  // (still published, or since replaced by a later minor version), and the version published now.
  const flagged = await db.legalDocumentVersion.findMany({
    where: { requiresReacceptance: true, publishedAt: { not: null }, document: { key: { in: required } } },
    orderBy: { version: "desc" },
    select: { version: true, documentId: true },
  });
  if (!flagged.length) return [];
  const needFrom = new Map<string, number>();
  for (const f of flagged) if (!needFrom.has(f.documentId)) needFrom.set(f.documentId, f.version);
  const current = await db.legalDocumentVersion.findMany({
    where: { status: "PUBLISHED", documentId: { in: [...needFrom.keys()] } },
    orderBy: { version: "desc" },
    select: { id: true, version: true, documentId: true, document: { select: { key: true, title: true } } },
  });
  const out = [];
  const seen = new Set<string>();
  for (const v of current) {
    if (seen.has(v.documentId)) continue;
    seen.add(v.documentId);
    // Accepting the flagged version or any later one satisfies the requirement.
    const ok = await db.legalAcceptance.count({ where: { userId, legalVersion: { documentId: v.documentId, version: { gte: needFrom.get(v.documentId)! } } } });
    if (!ok) out.push({ key: v.document.key as LegalKey, title: v.document.title, version: v.version, versionId: v.id, kind: (REGISTRATION_ACK as string[]).includes(v.document.key) ? ("ACKNOWLEDGED" as const) : ("ACCEPTED" as const) });
  }
  return out;
});

// ---------------------------------------------------------------- owner: versions and states

type Result = { ok: true; id?: string } | { ok: false; error: string };

/** A new draft, starting from the text of the latest version. */
export async function createDraftVersion(ownerId: string, key: LegalKey): Promise<Result> {
  await ensureLegalDocuments();
  const doc = await db.legalDocument.findUniqueOrThrow({ where: { key } });
  const open = await db.legalDocumentVersion.findFirst({ where: { documentId: doc.id, status: "DRAFT" } });
  if (open) return { ok: false, error: `Version ${open.version} is already a draft. Edit it instead of starting another.` };
  const latest = await db.legalDocumentVersion.findFirstOrThrow({ where: { documentId: doc.id }, orderBy: { version: "desc" } });
  const v = await db.legalDocumentVersion.create({
    data: { documentId: doc.id, version: latest.version + 1, status: "DRAFT", content: latest.content, contentHash: latest.contentHash, createdById: ownerId },
  });
  await audit(ownerId, "legal.draft_created", "LegalDocument", doc.id, { key, version: v.version });
  return { ok: true, id: v.id };
}

/** Only a draft can be edited. The fingerprint follows the text. */
export async function editDraft(ownerId: string, versionId: string, input: { content: string; changeSummary: string; materialChange: boolean; requiresReacceptance: boolean }): Promise<Result> {
  const v = await db.legalDocumentVersion.findUnique({ where: { id: versionId } });
  if (!v) return { ok: false, error: "Version not found." };
  if (v.status !== "DRAFT") return { ok: false, error: "Only a draft can be edited. Start a new version instead." };
  const content = input.content.replace(/\r\n/g, "\n").trim() + "\n";
  if (content.length < 50) return { ok: false, error: "The text is too short." };
  // A bracketed text that is not a link, such as "[Company Name]", is an unfinished placeholder.
  if (/\[[A-Z][^\]\n]{2,60}\](?!\()/.test(content)) {
    return { ok: false, error: "The text contains a bracketed placeholder such as [Company Name]. Write the real information, or say in words that it is not yet decided." };
  }
  await db.legalDocumentVersion.update({
    where: { id: versionId },
    data: {
      content,
      contentHash: fingerprint(content),
      changeSummary: input.changeSummary.trim().slice(0, 500) || null,
      materialChange: input.materialChange,
      requiresReacceptance: input.materialChange && input.requiresReacceptance,
    },
  });
  await audit(ownerId, "legal.draft_edited", "LegalDocumentVersion", versionId);
  return { ok: true };
}

/**
 * State changes. The owner states who reviewed the text when approving; the application never
 * marks a version approved on its own.
 */
export async function changeStatus(
  ownerId: string,
  versionId: string,
  to: "PENDING_LEGAL_REVIEW" | "APPROVED" | "PUBLISHED" | "DRAFT",
  input: { approvalNote?: string; effectiveDate?: Date | null } = {},
): Promise<Result> {
  return db.$transaction(async (tx) => {
    const v = await tx.legalDocumentVersion.findUnique({ where: { id: versionId }, include: { _count: { select: { acceptances: true } } } });
    if (!v) return { ok: false as const, error: "Version not found." };
    const now = new Date();
    if (to === "PENDING_LEGAL_REVIEW") {
      if (v.status !== "DRAFT") return { ok: false as const, error: "Only a draft can be sent for legal review." };
      await tx.legalDocumentVersion.update({ where: { id: v.id }, data: { status: "PENDING_LEGAL_REVIEW", submittedAt: now } });
    } else if (to === "DRAFT") {
      if (v.status !== "PENDING_LEGAL_REVIEW") return { ok: false as const, error: "Only a version awaiting review can return to draft." };
      if (v._count.acceptances > 0) return { ok: false as const, error: "People have already accepted this exact text, so it cannot be changed. Start a new version instead." };
      const otherDraft = await tx.legalDocumentVersion.count({ where: { documentId: v.documentId, status: "DRAFT" } });
      if (otherDraft) return { ok: false as const, error: "Another version is already a draft. Finish or discard that one first." };
      await tx.legalDocumentVersion.update({ where: { id: v.id }, data: { status: "DRAFT", submittedAt: null } });
    } else if (to === "APPROVED") {
      if (v.status !== "PENDING_LEGAL_REVIEW") return { ok: false as const, error: "Only a version awaiting legal review can be approved." };
      const note = (input.approvalNote ?? "").trim();
      if (note.length < 10) return { ok: false as const, error: "Say who reviewed this exact version and when (at least 10 characters)." };
      await tx.legalDocumentVersion.update({ where: { id: v.id }, data: { status: "APPROVED", approvedAt: now, approvedById: ownerId, approvalNote: note.slice(0, 1000) } });
    } else if (to === "PUBLISHED") {
      if (v.status !== "APPROVED") return { ok: false as const, error: "Only an approved version can be published." };
      const newer = await tx.legalDocumentVersion.count({ where: { documentId: v.documentId, status: "PUBLISHED", version: { gt: v.version } } });
      if (newer) return { ok: false as const, error: "A newer version is already published. Start a new version from it instead." };
      // Every earlier version that was shown or published is replaced by this one (an older text that was
      // still awaiting review would otherwise stay listed as current next to the published one).
      await tx.legalDocumentVersion.updateMany({
        where: { documentId: v.documentId, id: { not: v.id }, OR: [{ status: "PUBLISHED" }, { version: { lt: v.version }, status: { in: ["APPROVED", "PENDING_LEGAL_REVIEW"] } }] },
        data: { status: "SUPERSEDED", supersededAt: now },
      });
      await tx.legalDocumentVersion.update({ where: { id: v.id }, data: { status: "PUBLISHED", publishedAt: now, publishedById: ownerId, effectiveDate: input.effectiveDate ?? now } });
    }
    await tx.auditLog.create({ data: { actorId: ownerId, action: `legal.status_${to.toLowerCase()}`, entityType: "LegalDocumentVersion", entityId: v.id, metadata: { from: v.status, version: v.version } } });
    return { ok: true as const };
  });
}

/** Owner overview: each document, its versions and how many acceptances each version has. */
export async function adminLegalOverview() {
  await ensureLegalDocuments();
  return db.legalDocument.findMany({
    orderBy: { sortOrder: "asc" },
    include: { versions: { orderBy: { version: "desc" }, include: { _count: { select: { acceptances: true } } } } },
  });
}

export const definitionOf = (key: LegalKey) => legalDefinition(key);
