import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * Health check for uptime monitors and process managers. Reveals no details.
 * Unhealthy (503) when the database is unreachable OR the settings are invalid,
 * so a wrongly configured release never looks healthy.
 */
export async function GET() {
  const started = Date.now();
  try {
    env();
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", db: "ok", ms: Date.now() - started }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ status: "error" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
