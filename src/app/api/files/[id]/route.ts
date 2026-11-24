import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/guard";
import { pendingAcknowledgment } from "@/server/legal";
import { authorizeDownload, readStoredFile } from "@/server/community/files";

export const dynamic = "force-dynamic";

const INLINE = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

/**
 * Authorized file download. Unknown, deleted and unauthorized files all
 * return 404 (no hint that a file exists). Only raster images may display
 * inline; everything else is forced to download.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !user.communityAccess) return new NextResponse("Not found", { status: 404 });
  if (await pendingAcknowledgment(user.id)) return new NextResponse("Please review and accept the updated policies first (/legal/review).", { status: 403 });
  const { id } = await params;
  const file = await authorizeDownload(user.id, id);
  if (!file) return new NextResponse("Not found", { status: 404 });
  const body = await readStoredFile(file).catch(() => null);
  if (!body) return new NextResponse("Not found", { status: 404 });
  const inline = INLINE.has(file.mimeType) && !req.nextUrl.searchParams.has("download");
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Length": String(body.length),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${file.originalName.replace(/"/g, "")}"`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; sandbox",
      "Cache-Control": "private, max-age=300",
      "Cross-Origin-Resource-Policy": "same-origin",
    },
  });
}
