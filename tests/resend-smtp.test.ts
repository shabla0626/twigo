/**
 * Resend SMTP integration (founder instructions, part 1.9). Nothing here contacts Resend: the provider is
 * stood in for by a local SMTP server on 127.0.0.1, and the empty-key case is checked before any connection.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { SMTPServer } from "smtp-server";
import { db } from "@/lib/db";
import { resetEnvCache } from "@/lib/env";
import { deliver, emailConfigProblem, resetEmailTransport, smtpSettings, verifyEmailConnection } from "@/lib/email";
import { EMAIL_STATUS_INFO, RETRYABLE, classifySmtpError, devMailCatcherPort } from "@/lib/email/status";
import { webhookSecretProblem } from "@/lib/email/webhook";
import { requestPasswordReset } from "@/server/accounts";
import { retryDelivery } from "@/server/email-retry";
import { registerAccount } from "@/server/onboarding";
import { parseMessage } from "../scripts/dev-mail";
import { createUser, resetDb } from "./helpers";

const RESEND = { SMTP_HOST: "smtp.resend.com", SMTP_PORT: "465", SMTP_SECURE: "true", SMTP_USER: "resend", SMTP_PASSWORD: "", EMAIL_FROM: "Twigo <noreply@twigo.space>" };
const KEYS = ["SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER", "SMTP_PASSWORD", "EMAIL_FROM", "SITE_URL", "NODE_ENV", "DEV_MAIL_CATCHER", "DEV_MAIL_PORT", "RESEND_WEBHOOK_SECRET"] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
const PORT = 2741;

function setEnv(over: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(over)) {
    if (v === undefined) delete (process.env as Record<string, string | undefined>)[k];
    else (process.env as Record<string, string>)[k] = v;
  }
  resetEnvCache();
  resetEmailTransport();
}

/** A stand-in SMTP server: records connections, logins and messages. */
async function fakeProvider(opts: { key?: string } = {}) {
  const seen = { connections: 0, logins: [] as string[], messages: [] as ReturnType<typeof parseMessage>[] };
  const server = new SMTPServer({
    authOptional: !opts.key,
    disabledCommands: ["STARTTLS"],
    allowInsecureAuth: true,
    logger: false,
    onConnect: (_s, cb) => {
      seen.connections++;
      cb();
    },
    onAuth: (auth, _s, cb) => {
      seen.logins.push(auth.username ?? "");
      return auth.password === opts.key ? cb(null, { user: auth.username }) : cb(Object.assign(new Error("Invalid API key"), { responseCode: 535 }));
    },
    onData: (stream, _s, cb) => {
      let raw = "";
      stream.on("data", (c: Buffer) => (raw += c.toString("utf8")));
      stream.on("end", () => {
        seen.messages.push(parseMessage(raw));
        cb();
      });
    },
  });
  await new Promise<void>((r) => server.listen(PORT, "127.0.0.1", r));
  return { seen, close: () => new Promise<void>((r) => server.close(() => r())) };
}

beforeEach(async () => {
  await resetDb();
});
afterEach(() => setEnv(saved));
afterAll(async () => {
  setEnv(saved);
  await db.$disconnect();
});

describe("1. SMTP configuration parsing", () => {
  it("reads the Resend settings exactly, with TLS from the start, and never exposes the key", () => {
    setEnv({ ...RESEND, SMTP_PASSWORD: "re_test_not_a_real_key" });
    const s = smtpSettings();
    expect(s).toMatchObject({ provider: "Resend", host: "smtp.resend.com", port: 465, secure: true, user: "resend", hasPassword: true, from: "Twigo <noreply@twigo.space>", local: false, devCatcher: false });
    expect(JSON.stringify(s)).not.toContain("re_test_not_a_real_key");
    expect(emailConfigProblem()).toBeNull();
  });
});

describe("2. missing API key", () => {
  it("does not connect, records 'not set up' with the reason, never reports success, and does not throw", async () => {
    const provider = await fakeProvider();
    try {
      // Same settings as production, pointed at the stand-in so a connection attempt would be counted.
      setEnv({ ...RESEND, SMTP_HOST: "127.0.0.1", SMTP_PORT: String(PORT), SMTP_SECURE: "false" });
      expect(emailConfigProblem()).toMatchObject({ status: "NOT_CONFIGURED" });
      const res = await deliver({ to: "member@example.test", subject: "Hello", text: "Body" });
      expect(res.status).toBe("not_configured");
      expect(res.status !== "sent" && res.error).toMatch(/SMTP_PASSWORD is empty/);
      expect((await verifyEmailConnection()).ok).toBe(false);
      expect(provider.seen.connections).toBe(0);
      const row = await db.emailDelivery.findUniqueOrThrow({ where: { id: res.deliveryId } });
      expect(row.status).toBe("NOT_CONFIGURED");
      expect(EMAIL_STATUS_INFO[row.status].sent).toBe(false);
      expect(RETRYABLE).toContain(row.status);
    } finally {
      await provider.close();
    }
  });

  it("with the real Resend host the message names the Resend API key", () => {
    setEnv(RESEND);
    expect(emailConfigProblem()?.message).toMatch(/Resend API key is missing/);
  });
});

describe("3–4. wrong key and unreachable server", () => {
  it("a refused login is 'login refused', not 'sent'", async () => {
    const provider = await fakeProvider({ key: "re_right" });
    try {
      setEnv({ ...RESEND, SMTP_HOST: "127.0.0.1", SMTP_PORT: String(PORT), SMTP_SECURE: "false", SMTP_PASSWORD: "re_wrong" });
      const res = await deliver({ to: "member@example.test", subject: "Hello", text: "Body" });
      expect(res.status === "failed" && res.kind).toBe("AUTH_FAILED");
      expect(provider.seen.logins).toEqual(["resend"]);
      expect(provider.seen.messages).toHaveLength(0);
    } finally {
      await provider.close();
    }
  });

  it("an unreachable Resend server is reported with host and port", () => {
    const c = classifySmtpError({ code: "ETIMEDOUT", message: "Connection timeout" }, { host: "smtp.resend.com", port: 465, secure: true, local: false });
    expect(c.status).toBe("SERVER_UNAVAILABLE");
    expect(c.message).toContain("smtp.resend.com:465");
  });
});

describe("5. development keeps the local test inbox; production never uses it", () => {
  it("development sends to the local inbox without the provider's login, even with a key in .env", async () => {
    const catcher = await fakeProvider();
    try {
      setEnv({ ...RESEND, SMTP_PASSWORD: "re_should_never_be_used", NODE_ENV: "development", DEV_MAIL_CATCHER: undefined, DEV_MAIL_PORT: String(PORT) });
      expect(devMailCatcherPort()).toBe(PORT);
      expect(smtpSettings()).toMatchObject({ devCatcher: true, host: "127.0.0.1", port: PORT, local: true });
      expect(smtpSettings().configured).toMatchObject({ provider: "Resend", host: "smtp.resend.com" });
      const res = await deliver({ to: "real.person@example.com", subject: "Dev", text: "Body" });
      expect(res.status === "sent" && res.local).toBe(true);
      expect((await db.emailDelivery.findUniqueOrThrow({ where: { id: res.deliveryId } })).status).toBe("CAPTURED_LOCALLY");
      expect(catcher.seen.logins).toEqual([]); // the key was never sent anywhere
      expect(catcher.seen.messages).toHaveLength(1);
    } finally {
      await catcher.close();
    }
  });

  it("the switch only works in development", () => {
    setEnv({ ...RESEND, NODE_ENV: "development", DEV_MAIL_CATCHER: "false" });
    expect(devMailCatcherPort()).toBeNull();
    expect(smtpSettings().host).toBe("smtp.resend.com");
    setEnv({ ...RESEND, NODE_ENV: "production", DEV_MAIL_CATCHER: "true" });
    expect(devMailCatcherPort()).toBeNull();
    expect(smtpSettings()).toMatchObject({ devCatcher: false, host: "smtp.resend.com", local: false });
    setEnv({ ...RESEND, NODE_ENV: "test" });
    expect(devMailCatcherPort()).toBeNull();
  });
});

describe("6–8. workflows, sender and links on twigo.space", () => {
  it("verification and password-reset emails come from Twigo <noreply@twigo.space> and link to https://twigo.space", async () => {
    const provider = await fakeProvider({ key: "re_right" });
    try {
      setEnv({ ...RESEND, SMTP_HOST: "127.0.0.1", SMTP_PORT: String(PORT), SMTP_SECURE: "false", SMTP_PASSWORD: "re_right", SITE_URL: "https://twigo.space" });
      const reg = await registerAccount({ fullName: "Ada Applicant", email: "ada@example.test", password: "a-long-password-123", confirm: "a-long-password-123", acceptTerms: true, acceptGuidelines: true, ackPrivacy: true }, { ipHash: "ip-1" });
      expect(reg.ok).toBe(true);
      if (reg.ok && "done" in reg && reg.done instanceof Promise) await reg.done;
      await createUser({ email: "member@example.test", role: "MEMBER", name: "Mia" });
      const r = await requestPasswordReset("member@example.test", "ip-2");
      await r.done;
      for (let i = 0; i < 50 && provider.seen.messages.length < 2; i++) await new Promise((x) => setTimeout(x, 100));
      expect(provider.seen.messages.length).toBeGreaterThanOrEqual(2);
      for (const m of provider.seen.messages) {
        expect(m.from).toMatch(/Twigo <noreply@twigo\.space>/);
        const links = m.text.match(/https?:\/\/[^\s)>"]+/g) ?? [];
        expect(links.length).toBeGreaterThan(0);
        for (const l of links) expect(l.startsWith("https://twigo.space/")).toBe(true);
      }
      expect(provider.seen.messages.some((m) => /\/verify-email/.test(m.text))).toBe(true);
      expect(provider.seen.messages.some((m) => /\/reset-password\//.test(m.text))).toBe(true);
    } finally {
      await provider.close();
    }
  });
});

describe("9. retry", () => {
  it("an email not sent for lack of a key can be retried once the key is set, and is not duplicated", async () => {
    const owner = await createUser({ email: "owner@example.test", totp: true });
    const provider = await fakeProvider({ key: "re_right" });
    try {
      setEnv({ ...RESEND, SMTP_HOST: "127.0.0.1", SMTP_PORT: String(PORT), SMTP_SECURE: "false" });
      const first = await deliver({ to: "member@example.test", subject: "Hello", text: "Plain text without a secret link" });
      expect(first.status).toBe("not_configured");
      setEnv({ ...RESEND, SMTP_HOST: "127.0.0.1", SMTP_PORT: String(PORT), SMTP_SECURE: "false", SMTP_PASSWORD: "re_right" });
      expect((await retryDelivery(owner.id, first.deliveryId)).ok).toBe(true);
      expect((await retryDelivery(owner.id, first.deliveryId)).ok).toBe(false); // already sent once
      expect(provider.seen.messages).toHaveLength(1);
      const retry = await db.emailDelivery.findFirstOrThrow({ where: { retryOfId: first.deliveryId } });
      expect(retry.status).toBe("CAPTURED_LOCALLY"); // a local stand-in; with smtp.resend.com this is "Accepted by provider"
    } finally {
      await provider.close();
    }
  });
});

describe("10. delivery status", () => {
  it("acceptance is never presented as inbox delivery; the webhook secret cannot be the API key", () => {
    expect(EMAIL_STATUS_INFO.ACCEPTED.label).toMatch(/delivery not confirmed/);
    expect(EMAIL_STATUS_INFO.DELIVERED.label).toMatch(/confirmed by provider/);
    expect(webhookSecretProblem("", "")).toBeNull();
    expect(webhookSecretProblem("whsec_abc", "re_key")).toBeNull();
    expect(webhookSecretProblem("re_key", "re_key")).toMatch(/API key/);
    expect(webhookSecretProblem("re_other", "")).toMatch(/API key/);
  });
});
