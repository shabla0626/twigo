import "server-only";
import { randomUUID } from "node:crypto";
import nodemailer, { type Transporter } from "nodemailer";
import type { EmailStatus } from "@prisma/client";
import { brand } from "@/config/brand";
import { db } from "../db";
import { env } from "../env";
import { logger } from "../logger";
import { SECRET_TEMPLATES, classifySmtpError, isLocalTestMail, isValidSender } from "./status";
import { TEMPLATES, renderTemplate, type EmailMessage, type TemplateKey } from "./templates";

/**
 * "sent" ONLY means the SMTP server accepted the message. It is not proof
 * that it reached an inbox; confirmed delivery comes later from the
 * provider's webhook (see ./webhook.ts). Every other result says why nothing
 * was sent, in words an administrator can act on (`error`).
 */
export type SendResult =
  | { status: "sent"; messageId: string; response?: string; local: boolean }
  | { status: "not_configured"; error: string }
  | { status: "failed"; kind: EmailStatus; error: string; detail?: string };

let transporter: Transporter | null = null;

export function smtpSettings() {
  const e = env();
  const secure = e.SMTP_SECURE ?? e.SMTP_PORT === 465;
  return {
    host: e.SMTP_HOST,
    port: e.SMTP_PORT,
    secure,
    user: e.SMTP_USER,
    hasPassword: Boolean(e.SMTP_PASSWORD),
    from: e.EMAIL_FROM,
    local: isLocalTestMail(e.SMTP_HOST),
    provider: /resend\.com$/i.test(e.SMTP_HOST) ? "Resend" : isLocalTestMail(e.SMTP_HOST) ? "Local test mail server" : e.SMTP_HOST ? "SMTP" : "None",
  };
}

export function emailConfigured(): boolean {
  const e = env();
  return Boolean(e.SMTP_HOST && e.EMAIL_FROM);
}

/** Configuration problems that make sending impossible, before any connection is tried. */
export function emailConfigProblem(): { status: EmailStatus; message: string } | null {
  const e = env();
  if (!e.SMTP_HOST || !e.EMAIL_FROM)
    return { status: "NOT_CONFIGURED", message: "Email is not set up (SMTP_HOST and EMAIL_FROM in the server settings). Nothing was sent." };
  if (!isValidSender(e.EMAIL_FROM))
    return { status: "SENDER_REJECTED", message: `EMAIL_FROM ("${e.EMAIL_FROM}") is not a valid email address. Nothing was sent.` };
  if (e.SMTP_USER && !e.SMTP_PASSWORD)
    return { status: "AUTH_FAILED", message: "SMTP_USER is set but SMTP_PASSWORD (the API key) is empty. Nothing was sent." };
  return null;
}

function getTransporter(): Transporter {
  if (transporter) return transporter;
  const e = env();
  const s = smtpSettings();
  transporter = nodemailer.createTransport({
    host: s.host,
    port: s.port,
    secure: s.secure,
    auth: e.SMTP_USER ? { user: e.SMTP_USER, pass: e.SMTP_PASSWORD } : undefined,
    // Fail fast instead of hanging a request when the server is down.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
  });
  return transporter;
}

/** Test hook: forget the cached transport after changing SMTP settings. */
export function resetEmailTransport() {
  transporter = null;
}

function fromAddress() {
  const e = env();
  const name = brand().emailFromName.replace(/["<>]/g, "");
  return e.EMAIL_FROM.includes("<") ? e.EMAIL_FROM : `"${name}" <${e.EMAIL_FROM}>`;
}

function failure(err: unknown): Extract<SendResult, { status: "failed" }> {
  const s = smtpSettings();
  const c = classifySmtpError(err, s);
  return { status: "failed", kind: c.status, error: c.message, detail: c.detail };
}

/** Header that ties a sent message to its EmailDelivery row (for provider delivery reports). */
export const DELIVERY_HEADER = "X-CoWork-Delivery-Id";

export async function sendEmail(message: EmailMessage, deliveryId?: string): Promise<SendResult> {
  const problem = emailConfigProblem();
  if (problem) {
    if (problem.status === "NOT_CONFIGURED") {
      // Development convenience only: show what would have been sent.
      if (process.env.NODE_ENV === "development") logger.info("email.dev_outbox", { to: message.to, subject: message.subject, text: message.text });
      return { status: "not_configured", error: problem.message };
    }
    return { status: "failed", kind: problem.status, error: problem.message };
  }
  try {
    const info = await getTransporter().sendMail({ from: fromAddress(), ...message, headers: deliveryId ? { [DELIVERY_HEADER]: deliveryId } : undefined });
    if (info.rejected && info.rejected.length > 0) {
      logger.warn("email.rejected", { subject: message.subject });
      return { status: "failed", kind: "RECIPIENT_REJECTED", error: "The provider refused the recipient address." };
    }
    return { status: "sent", messageId: info.messageId, response: typeof info.response === "string" ? info.response.slice(0, 300) : undefined, local: smtpSettings().local };
  } catch (err) {
    const f = failure(err);
    logger.error("email.send_failed", { subject: message.subject, kind: f.kind, err });
    return f;
  }
}

/** Connects and logs in without sending anything (Admin → Email → "Check connection"). */
export async function verifyEmailConnection(): Promise<{ ok: true } | { ok: false; status: EmailStatus; error: string }> {
  const problem = emailConfigProblem();
  if (problem) return { ok: false, status: problem.status, error: problem.message };
  try {
    await getTransporter().verify();
    return { ok: true };
  } catch (err) {
    const f = failure(err);
    return { ok: false, status: f.kind, error: f.error };
  }
}

/** Effective template (admin override, else built-in default). */
export async function getTemplate(key: TemplateKey): Promise<{ subject: string; body: string; customized: boolean }> {
  const row = await db.emailTemplate.findUnique({ where: { key } });
  if (row) return { subject: row.subject, body: row.body, customized: true };
  return { subject: TEMPLATES[key].subject, body: TEMPLATES[key].body, customized: false };
}

export async function renderEmail(key: TemplateKey, vars: Record<string, string | undefined>) {
  const t = await getTemplate(key);
  const all = { orgName: brand().name, contactEmail: brand().contactEmail || "(contact address not yet configured)", ...vars };
  return { subject: renderTemplate(t.subject, all).replace(/\s+/g, " "), text: renderTemplate(t.body, all) };
}

export function resultStatus(res: SendResult): EmailStatus {
  if (res.status === "sent") return res.local ? "CAPTURED_LOCALLY" : "ACCEPTED";
  return res.status === "not_configured" ? "NOT_CONFIGURED" : res.kind;
}

export type DeliverInput = {
  to: string;
  subject: string;
  text: string;
  templateKey?: TemplateKey;
  sentById?: string | null;
  applicationId?: string | null;
  userId?: string | null;
  retryOfId?: string | null;
};

/**
 * Sends and records the attempt in EmailDelivery (recipient, template,
 * status, provider response). The text is stored only when it contains no
 * secret link, so that failed messages can be retried safely.
 */
export async function deliver(input: DeliverInput): Promise<SendResult & { deliveryId: string }> {
  const id = randomUUID();
  const res = await sendEmail({ to: input.to, subject: input.subject, text: input.text }, id);
  const keepBody = !input.templateKey || !SECRET_TEMPLATES.includes(input.templateKey);
  const data = {
    id,
    to: input.to,
    subject: input.subject.slice(0, 300),
    templateKey: input.templateKey ?? null,
    status: resultStatus(res),
    providerMessageId: res.status === "sent" ? res.messageId : null,
    providerResponse: res.status === "sent" ? (res.response ?? null) : null,
    error: res.status === "sent" ? null : `${res.error}${res.status === "failed" && res.detail && !res.error.includes(res.detail) ? ` (${res.detail})` : ""}`.slice(0, 600),
    body: keepBody ? input.text.slice(0, 20000) : null,
    sentById: input.sentById ?? null,
    applicationId: input.applicationId ?? null,
    userId: input.userId ?? null,
    retryOfId: input.retryOfId ?? null,
  };
  const row = await db.emailDelivery.create({ data });
  return { ...res, deliveryId: row.id };
}

/** Render a template and deliver it in one step. */
export async function deliverTemplate(
  key: TemplateKey,
  to: string,
  vars: Record<string, string | undefined>,
  meta: Omit<DeliverInput, "to" | "subject" | "text" | "templateKey"> = {},
) {
  const msg = await renderEmail(key, vars);
  return deliver({ to, ...msg, templateKey: key, ...meta });
}

/** One sentence for the person who triggered the send. Never claims inbox delivery. */
export function describeSend(res: SendResult): string {
  if (res.status === "sent")
    return res.local
      ? `${LOCAL_CAPTURE_MESSAGE}${localInboxUrl() ? ` Read it at ${localInboxUrl()}.` : ""}`
      : "Accepted by the email provider. This confirms hand-off, not delivery to the inbox.";
  return res.error;
}

export const LOCAL_CAPTURE_MESSAGE = "Test email captured locally. This message was not sent to the recipient's real email inbox.";

/** Address of the local test inbox: development only, never shown in production. */
export function localInboxUrl(): string | null {
  if (process.env.NODE_ENV === "production" || !smtpSettings().local) return null;
  return `http://127.0.0.1:${process.env.DEV_MAIL_UI_PORT ?? 8025}`;
}
