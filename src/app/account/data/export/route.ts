import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { getCurrentUser, isRecentlyAuthenticated } from "@/lib/auth/guard";
import { exportUserData } from "@/server/privacy";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!(await isRecentlyAuthenticated())) return NextResponse.redirect(new URL("/account/confirm?next=/account/data", process.env.SITE_URL));
  const data = await exportUserData(user.id);
  await audit(user.id, "privacy.self_export", "User", user.id);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="my-data-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
