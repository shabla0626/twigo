import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { exportApplicantData } from "@/server/privacy";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin("data.export");
  const { id } = await params;
  const app = await db.application.findUnique({ where: { id }, select: { applicantId: true } });
  const data = app ? await exportApplicantData(app.applicantId) : null;
  if (!data) return new NextResponse("Not found", { status: 404 });
  await audit(admin.id, "privacy.applicant_export", "Applicant", app!.applicantId);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="applicant-${app!.applicantId}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
