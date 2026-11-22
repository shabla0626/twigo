import "server-only";
import { createHash } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FileScope, StoredFile } from "@prisma/client";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { randomToken } from "@/lib/crypto";
import { rateLimit } from "@/lib/rate-limit";
import { ALLOWED_DESCRIPTION, safeFileName, sniff } from "@/lib/files/sniff";
import { groupAccess, requireOpenGroupMember } from "./access";

// Private storage outside /public. Swap this small driver for an
// S3-compatible bucket in production if the server disk is not durable.
function storageRoot() {
  return path.resolve(env().STORAGE_DIR);
}

function fullPath(key: string) {
  const root = storageRoot();
  const p = path.resolve(root, key);
  if (!p.startsWith(root + path.sep)) throw new Error("Invalid storage key");
  return p;
}

export async function readStoredFile(f: StoredFile): Promise<Buffer> {
  return readFile(fullPath(f.storageKey));
}

export async function deleteStoredFile(f: Pick<StoredFile, "storageKey">) {
  await unlink(fullPath(f.storageKey)).catch(() => {});
}

/** Re-encodes raster images to strip metadata such as GPS location. */
async function cleanImage(bytes: Buffer, mime: string, maxSize?: number): Promise<{ bytes: Buffer; mime: string; ext: string }> {
  if (mime === "image/gif") return { bytes, mime, ext: "gif" };
  const sharp = (await import("sharp")).default;
  let img = sharp(bytes, { failOn: "error" }).rotate();
  if (maxSize) img = img.resize(maxSize, maxSize, { fit: "cover" });
  const out = await img.webp({ quality: 85 }).toBuffer();
  return { bytes: out, mime: "image/webp", ext: "webp" };
}

export type UploadInput = { scope: FileScope; groupId?: string; ideaId?: string; name: string; bytes: Buffer };
export type UploadResult = { ok: true; file: { id: string; name: string; mimeType: string; size: number } } | { ok: false; error: string };

export async function storeUpload(userId: string, input: UploadInput): Promise<UploadResult> {
  if (!rateLimit(`upload:${userId}`, 30, 3600_000).ok) return { ok: false, error: "Too many uploads. Please try again later." };
  const max = (input.scope === "PROFILE_PHOTO" ? 5 : env().MAX_UPLOAD_MB) * 1024 * 1024;
  if (input.bytes.length === 0) return { ok: false, error: "The file is empty." };
  if (input.bytes.length > max) return { ok: false, error: `Files can be at most ${Math.round(max / 1024 / 1024)} MB.` };

  // Authorization per scope.
  if (input.scope === "CHAT_ATTACHMENT" || input.scope === "GROUP_FILE") {
    if (!input.groupId) return { ok: false, error: "Missing group." };
    try {
      await requireOpenGroupMember(input.groupId, userId);
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  } else if (input.scope === "IDEA_ATTACHMENT") {
    const idea = input.ideaId ? await db.businessIdea.findUnique({ where: { id: input.ideaId } }) : null;
    if (!idea || idea.authorId !== userId) return { ok: false, error: "Only the author can attach files to an idea." };
  }

  const type = sniff(input.bytes, input.name);
  if (!type) return { ok: false, error: `This file type is not allowed. Allowed: ${ALLOWED_DESCRIPTION}.` };
  if (input.scope === "PROFILE_PHOTO" && type.kind !== "image") return { ok: false, error: "Profile photos must be PNG, JPG, GIF or WebP images." };

  let bytes = input.bytes;
  let mime = type.mime;
  let ext = type.ext;
  if (type.kind === "image") {
    try {
      ({ bytes, mime, ext } = await cleanImage(input.bytes, type.mime, input.scope === "PROFILE_PHOTO" ? 512 : undefined));
    } catch {
      return { ok: false, error: "The image could not be read. It may be damaged." };
    }
  }

  const key = `${input.scope.toLowerCase()}/${new Date().toISOString().slice(0, 7)}/${randomToken(18)}`;
  const target = fullPath(key);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes, { flag: "wx" });
  const file = await db.storedFile.create({
    data: {
      ownerId: userId,
      scope: input.scope,
      groupId: input.groupId ?? null,
      ideaId: input.ideaId ?? null,
      originalName: safeFileName(input.name, ext),
      mimeType: mime,
      size: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      storageKey: key,
    },
  });
  return { ok: true, file: { id: file.id, name: file.originalName, mimeType: file.mimeType, size: file.size } };
}

/**
 * Authorization for downloads. Profile photos: any active member. Idea
 * attachments: any active member (ideas are community-visible). Chat and
 * group files: ACTIVE group members only.
 */
export async function authorizeDownload(userId: string, fileId: string): Promise<StoredFile | null> {
  const f = await db.storedFile.findUnique({ where: { id: fileId } });
  if (!f || f.deletedAt) return null;
  if (f.scope === "PROFILE_PHOTO" || f.scope === "IDEA_ATTACHMENT") return f;
  if (!f.groupId) return null;
  const a = await groupAccess(f.groupId, userId);
  return a?.isMember ? f : null;
}

export async function listGroupFiles(groupId: string) {
  return db.storedFile.findMany({
    where: { groupId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { id: true, originalName: true, mimeType: true, size: true, createdAt: true, scope: true, ownerId: true, owner: { select: { profile: { select: { displayName: true } } } } },
  });
}

export async function deleteGroupFile(userId: string, groupId: string, fileId: string) {
  const a = await requireOpenGroupMember(groupId, userId);
  const f = await db.storedFile.findUnique({ where: { id: fileId } });
  if (!f || f.groupId !== groupId || f.deletedAt) return { ok: false as const, error: "File not found." };
  if (f.ownerId !== userId && !a.isCoordinator) return { ok: false as const, error: "Only the uploader or the coordinator can delete a file." };
  await db.storedFile.update({ where: { id: fileId }, data: { deletedAt: new Date() } });
  await deleteStoredFile(f);
  return { ok: true as const };
}
