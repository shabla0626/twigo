import { createHmac, timingSafeEqual } from "node:crypto";
import type { EmailStatus, PrismaClient } from "@prisma/client";

/**
 * Resend sends delivery events (email.delivered, email.bounced, ...) as signed
 * webhooks (Svix format). Only a correctly signed, recent event may change a
 * delivery's status; that is the ONLY way a row becomes "Delivered".
 */
export function verifyWebhookSignature(
  rawBody: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  if (!secret || !headers.id || !headers.timestamp || !headers.signature) return false;
  const ts = Number(headers.timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowSeconds - ts) > 5 * 60) return false; // replay protection
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${headers.id}.${headers.timestamp}.${rawBody}`).digest();
  return headers.signature.split(" ").some((part) => {
    const [version, sig] = part.split(",");
    if (version !== "v1" || !sig) return false;
    const got = Buffer.from(sig, "base64");
    return got.length === expected.length && timingSafeEqual(got, expected);
  });
}

/**
 * The webhook signing secret must be its own value ("whsec_..."), never the SMTP API key: a key that
 * can send email must not also be able to forge delivery reports.
 */
export function webhookSecretProblem(secret: string, smtpPassword: string): string | null {
  if (!secret) return null;
  if (secret === smtpPassword || /^re_/i.test(secret)) return "RESEND_WEBHOOK_SECRET contains an API key. Use the webhook's own signing secret (it starts with whsec_).";
  return null;
}

type ProviderEvent = {
  type?: string;
  created_at?: string;
  data?: { email_id?: string; to?: string[] | string; subject?: string; headers?: { name?: string; value?: string }[] | Record<string, string> };
};

// The current header name, and the one used before the organization's name was removed
// from it (emails sent earlier may still be reported with the old one).
const DELIVERY_HEADERS = ["x-delivery-id", "x-cowork-delivery-id"];

function deliveryIdFrom(headers: NonNullable<ProviderEvent["data"]>["headers"]): string | null {
  if (!headers) return null;
  if (Array.isArray(headers)) return headers.find((h) => DELIVERY_HEADERS.includes(h.name?.toLowerCase() ?? ""))?.value ?? null;
  const key = Object.keys(headers).find((k) => DELIVERY_HEADERS.includes(k.toLowerCase()));
  return key ? headers[key]! : null;
}

const EVENT_STATUS: Record<string, EmailStatus | null> = {
  "email.delivered": "DELIVERED",
  "email.bounced": "DELIVERY_FAILED",
  "email.failed": "DELIVERY_FAILED",
  // Informational only: these do not change the delivery status.
  "email.sent": null,
  "email.delivery_delayed": null,
  "email.complained": null,
  "email.opened": null,
  "email.clicked": null,
};

/**
 * Applies a verified provider event to exactly one EmailDelivery row, matched
 * by a stable identifier: our own delivery id (sent as a header) or the
 * provider's email id. Events that cannot be matched with certainty are
 * ignored, so the wrong email is never marked as delivered.
 */
export async function applyProviderEvent(db: PrismaClient, event: ProviderEvent): Promise<{ matched: boolean; deliveryId?: string; status?: EmailStatus }> {
  const type = event.type ?? "";
  if (!(type in EVENT_STATUS)) return { matched: false };
  const providerId = event.data?.email_id;
  const ownId = deliveryIdFrom(event.data?.headers);
  const at = event.created_at ? new Date(event.created_at) : new Date();
  const sentStatuses: EmailStatus[] = ["ACCEPTED", "DELIVERED", "DELIVERY_FAILED"];

  let row = ownId ? await db.emailDelivery.findFirst({ where: { id: ownId, status: { in: sentStatuses } } }) : null;
  if (!row && providerId) {
    const candidates = await db.emailDelivery.findMany({
      where: { status: { in: sentStatuses }, OR: [{ providerMessageId: providerId }, { providerResponse: { contains: providerId } }] },
      take: 2,
    });
    if (candidates.length === 1) row = candidates[0]!; // ambiguous matches are ignored
  }
  if (!row) return { matched: false };

  const next = EVENT_STATUS[type];
  // A failure report always wins; "delivered" never overrides a reported failure.
  const status = next && !(next === "DELIVERED" && row.status === "DELIVERY_FAILED") ? next : row.status;
  await db.emailDelivery.update({
    where: { id: row.id },
    data: {
      status,
      providerEvent: type,
      providerEventAt: at,
      ...(providerId && !(row.providerResponse ?? "").includes(providerId) ? { providerResponse: `${row.providerResponse ?? ""} [provider id ${providerId}]`.trim().slice(0, 300) } : {}),
    },
  });
  return { matched: true, deliveryId: row.id, status };
}
