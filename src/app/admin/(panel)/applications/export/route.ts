import { NextResponse, type NextRequest } from "next/server";
import type { ApplicationStatus } from "@prisma/client";
import { audit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth/guard";
import { APPLICATION_STATUSES } from "@/lib/labels";
import { applicationsCsv } from "@/server/privacy";

export const dynamic = "force-dynamic";

/** CSV export of applications (formula-injection safe). */
export async function GET(req: NextRequest) {
  // Owner only: this file takes every applicant's details out of the system at once.
  const admin = await requireAdmin("applications.export");
  const s = req.nextUrl.searchParams.get("status");
  const status = s && s in APPLICATION_STATUSES ? (s as ApplicationStatus) : undefined;
  const csv = await applicationsCsv({ status });
  await audit(admin.id, "privacy.applications_csv", "Application", null, { status: status ?? "all" });
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="applications-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
