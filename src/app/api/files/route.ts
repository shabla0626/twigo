import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/guard";
import { storeUpload } from "@/server/community/files";

export const dynamic = "force-dynamic";

/** Same-origin check (CSRF protection for this non-server-action endpoint). */
function sameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  return origin !== null && origin === new URL(req.url).origin;
}

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ ok: false, error: "Invalid origin." }, { status: 403 });
  const user = await getCurrentUser();
  if (!user || !user.communityAccess || !user.displayName) return NextResponse.json({ ok: false, error: "Only approved members can upload files." }, { status: 401 });
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > 110 * 1024 * 1024) return NextResponse.json({ ok: false, error: "File too large." }, { status: 413 });

  const form = await req.formData().catch(() => null);
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
