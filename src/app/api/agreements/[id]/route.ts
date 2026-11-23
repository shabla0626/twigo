import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/guard";
import { can } from "@/lib/auth/permissions";
import { AGREEMENT_STATUS_LABELS, agreementForDownload } from "@/server/community/group-projects";

export const dynamic = "force-dynamic";

/**
 * A copy of one agreement version: the exact text, its SHA-256 fingerprint and who accepted it when.
 * Group members only (and the owner, who may see financial records). Drafts are not downloadable.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !user.communityAccess) return new NextResponse("Not found", { status: 404 });
  const { id } = await params;
  const v = await agreementForDownload(user.id, id, { owner: can(user.role, "compensation.view") });
  if (!v || v.status === "DRAFT") return new NextResponse("Not found", { status: 404 });
  const lines = [
    `Project: ${v.project.name}`,
    `Group: ${v.project.group.name}`,
    `Agreement version: ${v.version}`,
    `Status: ${AGREEMENT_STATUS_LABELS[v.status]}`,
    `SHA-256 fingerprint of the agreement text below: ${v.contentHash}`,
    "",
    "Acceptances:",
    ...v.participants.map((p) => `- ${p.displayName}: ${p.acceptedAt ? `accepted ${p.acceptedAt.toISOString()} (fingerprint ${p.acceptedHash})` : p.declinedAt ? `declined ${p.declinedAt.toISOString()}` : "not answered"}${p.withdrewAt ? `; withdrew ${p.withdrewAt.toISOString()}` : ""}`),
    "",
    "This copy is a record kept by the community platform. It does not by itself make the agreement enforceable in every jurisdiction.",
    "",
    "----- AGREEMENT TEXT -----",
    "",
  ];
  const body = lines.join("\n") + v.content;
  const file = `agreement-${v.project.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 40)}-v${v.version}.md`;
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${file}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
