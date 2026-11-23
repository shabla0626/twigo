import { NextResponse, type NextRequest } from "next/server";
import { audit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth/guard";
import { can } from "@/lib/auth/permissions";
import { env } from "@/lib/env";
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
  // The owner may open any group's financial terms, but only with the same safeguards as the admin area
  // (two-step verification) and with an audit entry; members use their own group or participant access.
  const ownerAccess = can(user.role, "compensation.view") && (!env().ADMIN_REQUIRE_2FA || user.totpEnabled);
  const asMember = await agreementForDownload(user.id, id);
  const v = asMember ?? (ownerAccess ? await agreementForDownload(user.id, id, { owner: true }) : null);
  if (!v || v.status === "DRAFT") return new NextResponse("Not found", { status: 404 });
  if (!asMember) await audit(user.id, "agreement.downloaded_by_owner", "ProjectAgreementVersion", v.id, { projectId: v.projectId, version: v.version });
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
