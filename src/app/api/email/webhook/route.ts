import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { applyProviderEvent, verifyWebhookSignature } from "@/lib/email/webhook";

export const dynamic = "force-dynamic";

/**
 * Delivery events from Resend (configure in Resend → Webhooks with the URL
 * https://<your-domain>/api/email/webhook and put the signing secret in
 * RESEND_WEBHOOK_SECRET). Unsigned or wrongly signed requests are refused.
 */
export async function POST(req: Request) {
  const secret = env().RESEND_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhook not configured" }, { status: 404 });
  const raw = await req.text();
  if (raw.length > 256 * 1024) return NextResponse.json({ error: "Too large" }, { status: 413 });
  const ok = verifyWebhookSignature(raw, { id: req.headers.get("svix-id"), timestamp: req.headers.get("svix-timestamp"), signature: req.headers.get("svix-signature") }, secret);
  if (!ok) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  let event: unknown;
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const res = await applyProviderEvent(db, event as Parameters<typeof applyProviderEvent>[1]);
  logger.info("email.webhook", { type: (event as { type?: string }).type, matched: res.matched });
  // Always 200 for a verified event, so the provider does not retry unmatched ones forever.
  return NextResponse.json({ received: true, matched: res.matched });
}
