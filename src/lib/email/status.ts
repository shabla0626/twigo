import type { EmailStatus } from "@prisma/client";

/**
 * Turns an SMTP/Nodemailer error into one clear category and a message an
 * administrator can act on. Pure function (no I/O) so it can be unit-tested.
 */
export function classifySmtpError(
  err: unknown,
  ctx: { host: string; port: number; secure: boolean; local: boolean },
): { status: EmailStatus; message: string; detail: string } {
  const e = (err ?? {}) as { code?: string; responseCode?: number; command?: string; message?: string; response?: string };
  const detail = String(e.response || e.message || "Unknown error").slice(0, 300);
  const text = `${e.message ?? ""} ${e.response ?? ""}`.toLowerCase();
  const code = e.code ?? "";
  const rc = e.responseCode ?? 0;
  const where = `${ctx.host}:${ctx.port}`;

  // Could not reach or talk to the server at all.
  const networkCodes = ["ECONNECTION", "ECONNREFUSED", "ETIMEDOUT", "ESOCKET", "EDNS", "ENOTFOUND", "EHOSTUNREACH", "ECONNRESET", "EAI_AGAIN"];
  if (networkCodes.includes(code) || /econnrefused|enotfound|etimedout|getaddrinfo|greeting never received|connection timeout|socket hang up/.test(text)) {
    const tlsHint = /wrong version number|greeting never received/.test(text)
      ? ` The secure-connection setting may not match the port: use SMTP_SECURE="true" with port 465, or "false" with ports 587/2587/25.`
      : "";
    return {
      status: "SERVER_UNAVAILABLE",
      message: ctx.local
        ? `The local test mail server at ${where} is not running. Start it with "npm run mail:dev" (or restart "npm run dev", which starts it automatically).`
        : `Could not connect to the email server at ${where}. Check SMTP_HOST, SMTP_PORT and SMTP_SECURE, and the server's internet connection.${tlsHint}`,
      detail,
    };
  }
  if (code === "ETLS" || /wrong version number|certificate|ssl routines/.test(text)) {
    return {
      status: "SERVER_UNAVAILABLE",
      message: `A secure connection to ${where} could not be established. Use SMTP_SECURE="true" with port 465, or "false" with ports 587/2587/25.`,
      detail,
    };
  }
  // Login refused (wrong user or API key).
  if (code === "EAUTH" || rc === 535 || rc === 534 || rc === 530 || /authentication|invalid login|username and password|api key/.test(text)) {
    return {
      status: "AUTH_FAILED",
      message: `The email server refused the login. Check SMTP_USER and SMTP_PASSWORD (for Resend: user "resend" and an API key that starts with "re_").`,
      detail,
    };
  }
  // Sender refused (unverified domain or bad From address).
  if (
    (e.command === "MAIL FROM" && rc >= 400) ||
    /domain is not verified|not verified|verify a domain|from address|sender address|invalid .*from|testing emails|only send testing emails/.test(text)
  ) {
    return {
      status: "SENDER_REJECTED",
      message: "The provider refused the sender address. EMAIL_FROM must use a domain you have verified with your email provider.",
      detail,
    };
  }
  // Recipient refused.
  if ((e.command === "RCPT TO" && rc >= 400) || /recipient|mailbox unavailable|user unknown|no such user/.test(text)) {
    return { status: "RECIPIENT_REJECTED", message: "The provider refused the recipient address.", detail };
  }
  return { status: "FAILED", message: `The email could not be sent: ${detail}`, detail };
}

/** Labels for the delivery log. "Accepted" never claims inbox delivery. */
export const EMAIL_STATUS_INFO: Record<EmailStatus, { label: string; tone: "success" | "accent" | "warn" | "danger" | "neutral"; sent: boolean }> = {
  CAPTURED_LOCALLY: { label: "Captured locally (test only, not delivered)", tone: "neutral", sent: true },
  NOT_CONFIGURED: { label: "Not sent: email not set up", tone: "warn", sent: false },
  SERVER_UNAVAILABLE: { label: "Not sent: email server unreachable", tone: "danger", sent: false },
  AUTH_FAILED: { label: "Not sent: email login refused", tone: "danger", sent: false },
  SENDER_REJECTED: { label: "Not sent: sender address refused", tone: "danger", sent: false },
  RECIPIENT_REJECTED: { label: "Not sent: recipient refused", tone: "danger", sent: false },
  FAILED: { label: "Not sent: error", tone: "danger", sent: false },
  ACCEPTED: { label: "Accepted by provider (delivery not confirmed)", tone: "accent", sent: true },
  DELIVERED: { label: "Delivered (confirmed by provider)", tone: "success", sent: true },
  DELIVERY_FAILED: { label: "Delivery failed (reported by provider)", tone: "danger", sent: true },
};

/** Statuses for which a manual retry makes sense (nothing reached the recipient). */
export const RETRYABLE: EmailStatus[] = ["NOT_CONFIGURED", "SERVER_UNAVAILABLE", "AUTH_FAILED", "SENDER_REJECTED", "RECIPIENT_REJECTED", "FAILED", "DELIVERY_FAILED"];

/** Templates whose text contains a one-time secret link. Their text is never stored. */
export const SECRET_TEMPLATES = ["account_invitation", "account_verification", "email_verification", "password_reset"];

export function isValidSender(from: string): boolean {
  const addr = /<([^>]+)>/.exec(from)?.[1] ?? from;
  return /^[^@\s<>"]+@[^@\s<>"]+\.[^@\s<>"]+$/.test(addr.trim());
}

export function isLocalHost(host: string) {
  return ["127.0.0.1", "localhost", "::1", "[::1]"].includes(host.trim().toLowerCase());
}
