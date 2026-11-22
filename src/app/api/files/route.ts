import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/guard";
import { env } from "@/lib/env";
import { storeUpload } from "@/server/community/files";

export const dynamic = "force-dynamic";

/** Reads the request body, giving up (null) as soon as it grows past `limit` bytes. */
async function readLimited(req: NextRequest, limit: number): Promise<Uint8Array<ArrayBuffer> | null> {
  const reader = req.body?.getReader();
  if (!reader) return new Uint8Array(new ArrayBuffer(0));
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(new ArrayBuffer(size));
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

/** Same-origin check (CSRF protection for this non-server-action endpoint). */
function sameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  return origin !== null && origin === new URL(req.url).origin;
}

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ ok: false, error: "Invalid origin." }, { status: 403 });
  const user = await getCurrentUser();
  if (!user || !user.communityAccess || !user.displayName) return NextResponse.json({ ok: false, error: "Only approved members can upload files." }, { status: 401 });
  // The size limit is enforced while the upload is being read, not taken from what the
  // request says about itself: an upload without a declared size is refused, and reading
  // stops as soon as the limit is passed, so an oversized upload never fills the memory.
  const limit = (env().MAX_UPLOAD_MB + 1) * 1024 * 1024; // the file plus the form around it
  const declared = Number(req.headers.get("content-length"));
  if (!Number.isFinite(declared) || declared <= 0) return NextResponse.json({ ok: false, error: "The upload did not state its size." }, { status: 411 });
  if (declared > limit) return NextResponse.json({ ok: false, error: `Files can be at most ${env().MAX_UPLOAD_MB} MB.` }, { status: 413 });
  const body = await readLimited(req, limit);
  if (!body) return NextResponse.json({ ok: false, error: `Files can be at most ${env().MAX_UPLOAD_MB} MB.` }, { status: 413 });

  const form = await new Response(body, { headers: { "content-type": req.headers.get("content-type") ?? "" } }).formData().catch(() => null);
  const file = form?.get("file");
  const scope = String(form?.get("scope") ?? "");
  if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "No file received." }, { status: 400 });
  if (!["GROUP_FILE", "CHAT_ATTACHMENT", "PROFILE_PHOTO"].includes(scope)) return NextResponse.json({ ok: false, error: "Invalid upload." }, { status: 400 });

  const res = await storeUpload(user.id, {
    scope: scope as "GROUP_FILE" | "CHAT_ATTACHMENT" | "PROFILE_PHOTO",
    groupId: String(form?.get("groupId") ?? "") || undefined,
    name: file.name.slice(0, 200),
    bytes: Buffer.from(await file.arrayBuffer()),
  });
  if (!res.ok) return NextResponse.json(res, { status: 400 });

  if (scope === "PROFILE_PHOTO") {
    const prior = await db.memberProfile.findUnique({ where: { userId: user.id }, select: { photoFileId: true } });
    await db.memberProfile.update({ where: { userId: user.id }, data: { photoFileId: res.file.id } });
    if (prior?.photoFileId) await db.storedFile.update({ where: { id: prior.photoFileId }, data: { deletedAt: new Date() } }).catch(() => {});
  }
  return NextResponse.json(res);
}
