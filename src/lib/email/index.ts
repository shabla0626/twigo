import "server-only";
import { randomUUID } from "node:crypto";
import nodemailer, { type Transporter } from "nodemailer";
import type { EmailStatus } from "@prisma/client";
import { brand } from "@/config/brand";
import { db } from "../db";
import { env } from "../env";
import { logger } from "../logger";
import { SECRET_TEMPLATES, classifySmtpError, devMailCatcherPort, isLocalTestMail, isValidSender } from "./status";
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

const providerName = (host: string) => (/(^|\.)resend\.com$/i.test(host) ? "Resend" : isLocalTestMail(host) ? "Local test mail server" : host ? "SMTP" : "None");

/**
 * The settings actually used to send (`configured` = what the server settings say). In development the
 * local test inbox is used instead of the configured provider (see devMailCatcherPort). Never contains
 * the password: only whether one is set.
 */
export function smtpSettings() {
  const e = env();
  const configured = {
    provider: providerName(e.SMTP_HOST),
    host: e.SMTP_HOST,
    port: e.SMTP_PORT,
    secure: e.SMTP_SECURE ?? e.SMTP_PORT === 465,
    user: e.SMTP_USER,
    hasPassword: Boolean(e.SMTP_PASSWORD),
  };
  const catcher = devMailCatcherPort();
  if (catcher !== null) {
    return { ...configured, provider: "Local test mail server (development)", host: "127.0.0.1", port: catcher, secure: false, user: "", hasPassword: false, from: e.EMAIL_FROM, local: true, devCatcher: true, configured };
  }
  return { ...configured, from: e.EMAIL_FROM, local: isLocalTestMail(e.SMTP_HOST), devCatcher: false, configured };
}

export function emailConfigured(): boolean {
  return emailConfigProblem() === null;
}

/**
 * Configuration problems that make sending impossible. When one is found no connection is attempted,
 * the attempt is recorded with this status and message, and nothing is reported as sent.
 */
export function emailConfigProblem(): { status: EmailStatus; message: string } | null {
  const e = env();
  const s = smtpSettings();
  if (!e.EMAIL_FROM) return { status: "NOT_CONFIGURED", message: "Email is not set up: EMAIL_FROM is empty in the server settings (.env). Nothing was sent." };
  if (!isValidSender(e.EMAIL_FROM))
    return { status: "SENDER_REJECTED", message: `EMAIL_FROM ("${e.EMAIL_FROM}") is not a valid email address. Nothing was sent.` };
  if (s.devCatcher) return null;
  if (!e.SMTP_HOST) return { status: "NOT_CONFIGURED", message: "Email is not set up: SMTP_HOST is empty in the server settings (.env). Nothing was sent." };
  if (e.SMTP_USER && !e.SMTP_PASSWORD)
    return {
      status: "NOT_CONFIGURED",
      message: `The ${s.provider === "Resend" ? "Resend API key" : "email password"} is missing: SMTP_PASSWORD is empty in the server settings (.env). No connection was attempted and nothing was sent.`,
    };
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
    // The local development inbox needs no login; the provider's login is never sent to it.
    auth: !s.devCatcher && e.SMTP_USER ? { user: e.SMTP_USER, pass: e.SMTP_PASSWORD } : undefined,
    // Encrypted from the start on port 465; on other ports STARTTLS is required, except for the local test inbox.
    requireTLS: !s.secure && !s.local,
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
/** Carries our own delivery id, so a provider's delivery report can be matched to the exact message. */
export const DELIVERY_HEADER = "X-Delivery-Id";

/** A short technical code of a send error ("ECONNREFUSED", "EAUTH", 550…), never its text. */
function errorCode(err: unknown): string | number | null {
  const e = err as { code?: unknown; responseCode?: unknown } | null;
  if (e && (typeof e.code === "string" || typeof e.code === "number")) return e.code;
  if (e && typeof e.responseCode === "number") return e.responseCode;
  return null;
}

export async function sendEmail(message: EmailMessage, deliveryId?: string): Promise<SendResult> {
  const problem = emailConfigProblem();
  if (problem) {
    if (problem.status === "NOT_CONFIGURED") {
      // Development convenience only: show what would have been sent. The reason (never a secret) is logged everywhere.
      if (process.env.NODE_ENV === "development") logger.info("email.dev_outbox", { to: message.to, subject: message.subject, text: message.text });
      logger.warn("email.not_configured", { deliveryId: deliveryId ?? null, reason: problem.message });
      return { status: "not_configured", error: problem.message };
    }
    return { status: "failed", kind: problem.status, error: problem.message };
  }
  try {
    const info = await getTransporter().sendMail({ from: fromAddress(), ...message, headers: deliveryId ? { [DELIVERY_HEADER]: deliveryId } : undefined });
    if (info.rejected && info.rejected.length > 0) {
      logger.warn("email.rejected", { deliveryId: deliveryId ?? null });
      return { status: "failed", kind: "RECIPIENT_REJECTED", error: "The provider refused the recipient address." };
    }
    return { status: "sent", messageId: info.messageId, response: typeof info.response === "string" ? info.response.slice(0, 300) : undefined, local: smtpSettings().local };
  } catch (err) {
    const f = failure(err);
    // Provider errors often quote the recipient's address, so the error itself is not logged:
    // the kind of failure and the delivery id are enough to find the row in Admin, Email.
    logger.error("email.send_failed", { kind: f.kind, deliveryId: deliveryId ?? null, code: errorCode(err) });
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
