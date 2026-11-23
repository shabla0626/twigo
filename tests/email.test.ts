import { createHmac } from "node:crypto";
import { readdirSync, readFileSync, rmSync } from "node:fs";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SMTPServer } from "smtp-server";
import { db } from "@/lib/db";
import { resetEnvCache } from "@/lib/env";
import { deliver, deliverTemplate, resetEmailTransport, verifyEmailConnection } from "@/lib/email";
import { classifySmtpError, isValidSender } from "@/lib/email/status";
import { applyProviderEvent, verifyWebhookSignature } from "@/lib/email/webhook";
import { requestEmailChange, requestPasswordReset, resetPassword } from "@/server/accounts";
import { updateApplicationStatus } from "@/server/admin/applications";
import { retryDelivery } from "@/server/email-retry";
import { saveApplicationStep, submitMyApplication } from "@/server/membership-application";
import { registerAccount, verifyEmailToken } from "@/server/onboarding";
import { sendApplicantEmailAction } from "@/app/admin/actions/community";
import { POST as webhookPOST } from "@/app/api/email/webhook/route";
import { parseMessage, startDevMail, startMailInbox } from "../scripts/dev-mail";
import { applicationAnswers, createUser, resetDb, signIn } from "./helpers";

const ctx = { host: "smtp.example.test", port: 465, secure: true, local: false };

describe("email error classification (unit)", () => {
  it("distinguishes unreachable server, login, sender, recipient and other errors", () => {
    expect(classifySmtpError({ code: "ESOCKET", message: "connect ECONNREFUSED 127.0.0.1:2525" }, { ...ctx, host: "127.0.0.1", port: 2525, local: true }).status).toBe("SERVER_UNAVAILABLE");
    expect(classifySmtpError({ code: "ESOCKET", message: "connect ECONNREFUSED 127.0.0.1:2525" }, { ...ctx, local: true }).message).toMatch(/npm run mail:dev/);
    expect(classifySmtpError({ code: "ETIMEDOUT", message: "Connection timeout" }, ctx).status).toBe("SERVER_UNAVAILABLE");
    expect(classifySmtpError({ code: "EAUTH", responseCode: 535, message: "Invalid login: 535 Authentication failed" }, ctx).status).toBe("AUTH_FAILED");
    expect(classifySmtpError({ code: "EENVELOPE", command: "MAIL FROM", responseCode: 550, message: "550 The example.com domain is not verified" }, ctx).status).toBe("SENDER_REJECTED");
    expect(classifySmtpError({ code: "EMESSAGE", responseCode: 450, message: "You can only send testing emails to your own email address" }, ctx).status).toBe("SENDER_REJECTED");
    expect(classifySmtpError({ code: "EENVELOPE", command: "RCPT TO", responseCode: 550, message: "550 Mailbox unavailable" }, ctx).status).toBe("RECIPIENT_REJECTED");
    expect(classifySmtpError({ code: "EMESSAGE", responseCode: 554, message: "554 Message rejected" }, ctx).status).toBe("FAILED");
  });
  it("validates sender addresses", () => {
    expect(isValidSender("no-reply@cowork.test")).toBe(true);
    expect(isValidSender('"CoWork" <team@example.org>')).toBe(true);
    expect(isValidSender("not-an-address")).toBe(false);
  });
  it("verifies webhook signatures and refuses forged or old ones", () => {
    const secret = `whsec_${Buffer.from("super-secret-key-material").toString("base64")}`;
    const body = '{"type":"email.delivered"}';
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = createHmac("sha256", Buffer.from("super-secret-key-material")).update(`msg_1.${ts}.${body}`).digest("base64");
    expect(verifyWebhookSignature(body, { id: "msg_1", timestamp: ts, signature: `v1,${sig}` }, secret)).toBe(true);
    expect(verifyWebhookSignature(body.replace("delivered", "bounced"), { id: "msg_1", timestamp: ts, signature: `v1,${sig}` }, secret)).toBe(false);
    expect(verifyWebhookSignature(body, { id: "msg_1", timestamp: String(Number(ts) - 3600), signature: `v1,${sig}` }, secret)).toBe(false);
    expect(verifyWebhookSignature(body, { id: "msg_1", timestamp: ts, signature: null }, secret)).toBe(false);
  });
  it("reads quoted-printable bodies and encoded subjects", () => {
    const raw = 'Subject: =?UTF-8?Q?Welcome_=E2=80=9CTeam=E2=80=9D?=\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\nOpen https://example.test/activate/abc=\r\ndef =E2=80=94 thanks\r\n';
    const m = parseMessage(raw);
    expect(m.subject).toBe("Welcome “Team”");
    expect(m.text).toBe("Open https://example.test/activate/abcdef — thanks");
  });
});

describe("email delivery (integration, local test mail server)", () => {
  const mailDir = path.join(tmpdir(), `cowork-email-test-${Date.now()}`);
  let catcher: SMTPServer | null = null;
  const PORT = 2737;

  const setSmtp = (over: Record<string, string>) => {
    Object.assign(process.env, { SMTP_HOST: "127.0.0.1", SMTP_PORT: String(PORT), SMTP_SECURE: "false", SMTP_USER: "", SMTP_PASSWORD: "", EMAIL_FROM: "no-reply@cowork.test" }, over);
    resetEnvCache();
    resetEmailTransport();
  };
  const startCatcher = async () => {
    catcher = await startDevMail({ port: PORT, dir: mailDir, quiet: true });
  };
  const stopCatcher = async () => {
    if (catcher) await new Promise<void>((r) => catcher!.close(() => r()));
    catcher = null;
  };
  function lastMailTo(addr: string) {
    const files = readdirSync(mailDir).filter((f) => f.endsWith(".json")).sort().reverse();
    for (const f of files) {
      const meta = JSON.parse(readFileSync(path.join(mailDir, f), "utf8")) as { to: string[] };
      if (meta.to.includes(addr)) return parseMessage(readFileSync(path.join(mailDir, f.replace(".json", ".eml")), "utf8"));
    }
    throw new Error(`no mail to ${addr}`);
  }
  const link = (text: string, route: string) => new RegExp(`${route}/([A-Za-z0-9_-]+)`).exec(text)?.[1];

  beforeAll(() => {
    process.env.SEND_APPLICANT_CONFIRMATION = "true";
  });
  beforeEach(async () => {
    await resetDb();
    setSmtp({});
    await startCatcher();
  });
  afterEach(stopCatcher);
  afterAll(() => {
    process.env.SMTP_HOST = "";
    process.env.SEND_APPLICANT_CONFIRMATION = "false";
    resetEnvCache();
    resetEmailTransport();
    rmSync(mailDir, { recursive: true, force: true });
  });

  it("sends every onboarding email: verification, application received, interview, waiting list, declined, accepted, email change, password reset", async () => {
    const owner = await createUser({ email: "owner@example.test", totp: true });
    await signIn(owner.id, "OWNER");

    // 1. Welcome + email verification (sent on registration).
    const reg = await registerAccount({ fullName: "Ada Applicant", email: "applicant@example.test", password: "a-long-password-123", confirm: "a-long-password-123", acceptTerms: true, acceptGuidelines: true, ackPrivacy: true }, { ipHash: "ip-1" });
    expect(reg.ok && reg.mailStatus).toBe("sent");
    const verification = link(lastMailTo("applicant@example.test").text, "/verify-email");
    expect(verification).toBeTruthy();
    const verified = await verifyEmailToken(verification!);
    expect(verified.ok).toBe(true);
    const account = await db.user.findUniqueOrThrow({ where: { email: "applicant@example.test" } });
    expect(account.emailVerifiedAt).not.toBeNull();

    // 2. Application received (automatic, after the data is saved).
    const answers = applicationAnswers();
    await saveApplicationStep(account.id, 1, answers.about);
    await saveApplicationStep(account.id, 2, answers.skills);
    await saveApplicationStep(account.id, 3, answers.motivation);
    expect((await submitMyApplication(account.id, { confirm: true })).ok).toBe(true);
    const received = lastMailTo("applicant@example.test");
    expect(received.subject).toMatch(/received your application/i);
    expect(received.text).toContain("/application");
    const app = await db.application.findFirstOrThrow();

    // 3–5. Administrator-written emails never change the application status.
    for (const key of ["interview_invitation", "application_waitlisted", "application_declined"]) {
      const fd = new FormData();
      fd.set("applicationId", app.id);
      fd.set("template", key);
      fd.set("subject", `Subject for ${key}`);
      fd.set("body", `Hello Ada, this is the ${key} message.`);
      fd.set("confirm", "on");
      const res = await sendApplicantEmailAction(undefined, fd);
      expect(res?.ok).toMatch(/Test email captured locally/);
      expect(lastMailTo("applicant@example.test").text).toContain(`${key} message`);
    }
    expect((await db.application.findUniqueOrThrow({ where: { id: app.id } })).status).toBe("SUBMITTED");

    // 6. Approve and notify: membership is granted and the acceptance email points to the community.
    const approved = await updateApplicationStatus(owner.id, app.id, "ACCEPTED", { notify: true });
    expect(approved.ok && approved.membership).toBe("granted");
    expect(approved.ok && approved.email?.status).toBe("sent");
    expect(lastMailTo("applicant@example.test").text).toContain("/community");

    // 7. Email change verification.
    await requestEmailChange(account.id, "ada.new@example.test");
    const change = link(lastMailTo("ada.new@example.test").text, "/verify-email");
    expect(change).toBeTruthy();
    const changed = await verifyEmailToken(change!);
    expect(changed.ok && changed.kind).toBe("change");
    expect((await db.user.findUniqueOrThrow({ where: { id: account.id } })).email).toBe("ada.new@example.test");

    // 8. Password reset.
    await (await requestPasswordReset("ada.new@example.test", "ip-2")).done;
    const reset = link(lastMailTo("ada.new@example.test").text, "/reset-password");
    expect(reset).toBeTruthy();
    expect((await resetPassword(reset!, "another-long-password-456")).ok).toBe(true);

    // Every attempt is logged as CAPTURED LOCALLY (never "accepted" or "delivered"), and secret links are never stored.
    const rows = await db.emailDelivery.findMany();
    expect(rows.length).toBeGreaterThanOrEqual(8);
    expect(rows.every((r) => r.status === "CAPTURED_LOCALLY")).toBe(true);
    for (const r of rows.filter((r) => ["account_verification", "email_verification", "password_reset"].includes(r.templateKey ?? ""))) expect(r.body).toBeNull();
    expect(rows.find((r) => r.templateKey === "interview_invitation")?.body).toContain("interview_invitation message");
  });

  it("records the exact reason when nothing could be sent", async () => {
    setSmtp({ SMTP_HOST: "" });
    expect((await deliver({ to: "a@example.test", subject: "s", text: "t" })).status).toBe("not_configured");

    setSmtp({ EMAIL_FROM: "not-an-address" });
    const bad = await deliver({ to: "a@example.test", subject: "s", text: "t" });
    expect(bad.status === "failed" && bad.kind).toBe("SENDER_REJECTED");

    await stopCatcher();
    setSmtp({});
    const down = await deliver({ to: "a@example.test", subject: "s", text: "t" });
    expect(down.status === "failed" && down.kind).toBe("SERVER_UNAVAILABLE");
    expect(down.status === "failed" && down.error).toMatch(/npm run mail:dev/);

    // A server that refuses the login, and one that refuses an unverified sender domain.
    const strict = new SMTPServer({
      authOptional: false,
      disabledCommands: ["STARTTLS"],
      allowInsecureAuth: true,
      logger: false,
      onAuth: (auth, _s, cb) => (auth.password === "right-key" ? cb(null, { user: "resend" }) : cb(Object.assign(new Error("Authentication failed"), { responseCode: 535 }))),
      onMailFrom: (addr, _s, cb) => (addr.address.endsWith("@verified.test") ? cb() : cb(Object.assign(new Error("The cowork.test domain is not verified"), { responseCode: 550 }))),
      onData: (s, _x, cb) => s.on("end", () => cb()).resume(),
    });
    await new Promise<void>((r) => strict.listen(PORT, "127.0.0.1", r));
    try {
      setSmtp({ SMTP_USER: "resend", SMTP_PASSWORD: "wrong-key" });
      const auth = await deliver({ to: "a@example.test", subject: "s", text: "t" });
      expect(auth.status === "failed" && auth.kind).toBe("AUTH_FAILED");
      expect((await verifyEmailConnection()).ok).toBe(false);

      setSmtp({ SMTP_USER: "resend", SMTP_PASSWORD: "right-key" });
      expect((await verifyEmailConnection()).ok).toBe(true);
      const sender = await deliver({ to: "a@example.test", subject: "s", text: "t" });
      expect(sender.status === "failed" && sender.kind).toBe("SENDER_REJECTED");

      setSmtp({ SMTP_USER: "resend", SMTP_PASSWORD: "right-key", EMAIL_FROM: "no-reply@verified.test" });
      expect((await deliver({ to: "a@example.test", subject: "s", text: "t" })).status).toBe("sent");
    } finally {
      await new Promise<void>((r) => strict.close(() => r()));
    }
    const statuses = (await db.emailDelivery.findMany({ orderBy: { createdAt: "asc" } })).map((r) => r.status);
    expect(statuses).toEqual(["NOT_CONFIGURED", "SENDER_REJECTED", "SERVER_UNAVAILABLE", "AUTH_FAILED", "SENDER_REJECTED", "CAPTURED_LOCALLY"]);
  });

  it("retries failed emails safely: same text when it has no secret, a new link otherwise", async () => {
    const owner = await createUser({ email: "owner@example.test" });
    await stopCatcher();
    const failed = await deliver({ to: "x@example.test", subject: "Interview", text: "See you Tuesday.", templateKey: "interview_invitation" });
    expect(failed.status).toBe("failed");
    // Not retryable while the problem persists: the retry is logged as failed too, and the original row stays as it was.
    const stillDown = await retryDelivery(owner.id, failed.deliveryId);
    expect(stillDown.ok).toBe(false);

    await startCatcher();
    const ok = await retryDelivery(owner.id, failed.deliveryId);
    expect(ok.ok).toBe(true);
    expect(lastMailTo("x@example.test").text).toBe("See you Tuesday.");
    const again = await retryDelivery(owner.id, failed.deliveryId);
    expect(again.ok).toBe(false); // already retried: no duplicates
    const original = await db.emailDelivery.findUniqueOrThrow({ where: { id: failed.deliveryId } });
    expect(original.status).toBe("SERVER_UNAVAILABLE");
    expect(await db.emailDelivery.count({ where: { retryOfId: failed.deliveryId } })).toBe(2);
    // Accepted emails cannot be retried (prevents duplicates).
    const accepted = await db.emailDelivery.findFirstOrThrow({ where: { status: "CAPTURED_LOCALLY" } });
    expect((await retryDelivery(owner.id, accepted.id)).ok).toBe(false);

    // Password reset: the failed link is never stored; a retry issues a new one.
    const user = await createUser({ email: "member@example.test", role: "MEMBER" });
    await stopCatcher();
    await (await requestPasswordReset("member@example.test", "ip-9")).done;
    const failedReset = await db.emailDelivery.findFirstOrThrow({ where: { templateKey: "password_reset" } });
    expect(failedReset.body).toBeNull();
    await startCatcher();
    expect((await retryDelivery(owner.id, failedReset.id)).ok).toBe(true);
    const token = link(lastMailTo("member@example.test").text, "/reset-password");
    expect((await resetPassword(token!, "brand-new-password-789")).ok).toBe(true);
    expect(user.id).toBeTruthy();
  });

  it("marks an email Delivered or Bounced only from a correctly signed webhook that identifies the exact message", async () => {
    const secretKey = "webhook-signing-key-0123456789";
    process.env.RESEND_WEBHOOK_SECRET = `whsec_${Buffer.from(secretKey).toString("base64")}`;
    resetEnvCache();
    try {
      // Two emails to the same person with the same subject, as an external provider would have accepted them.
      const mk = (id: string) => db.emailDelivery.create({ data: { id, to: "pat@example.test", subject: "An update on your application", status: "ACCEPTED", providerMessageId: `<${id}@mail>` } });
      const first = await mk("11111111-1111-4111-8111-111111111111");
      const second = await mk("22222222-2222-4222-8222-222222222222");
      const post = (event: object, sign = true) => {
        const body = JSON.stringify(event);
        const ts = String(Math.floor(Date.now() / 1000));
        const sig = createHmac("sha256", Buffer.from(secretKey)).update(`evt_1.${ts}.${body}`).digest("base64");
        return webhookPOST(
          new Request("http://localhost/api/email/webhook", {
            method: "POST",
            body,
            headers: { "svix-id": "evt_1", "svix-timestamp": ts, "svix-signature": sign ? `v1,${sig}` : "v1,forged" },
          }),
        );
      };
      const status = async (id: string) => (await db.emailDelivery.findUniqueOrThrow({ where: { id } })).status;
      const base = { to: ["pat@example.test"], subject: "An update on your application" };

      // Forged signature: refused.
      expect((await post({ type: "email.delivered", data: { ...base, email_id: "re_1", headers: [{ name: "X-CoWork-Delivery-Id", value: second.id }] } }, false)).status).toBe(401);
      // Recipient and subject alone are NOT enough: nothing is updated.
      expect(await (await post({ type: "email.delivered", data: base })).json()).toMatchObject({ matched: false });
      expect([await status(first.id), await status(second.id)]).toEqual(["ACCEPTED", "ACCEPTED"]);

      // Our own delivery id (sent as a header) identifies exactly one message.
      expect((await post({ type: "email.delivered", created_at: new Date().toISOString(), data: { ...base, email_id: "re_2", headers: [{ name: "X-CoWork-Delivery-Id", value: second.id }] } })).status).toBe(200);
      expect([await status(first.id), await status(second.id)]).toEqual(["ACCEPTED", "DELIVERED"]);

      // Later events can use the provider's id; a bounce wins over "delivered" and is never overwritten by it.
      await applyProviderEvent(db, { type: "email.bounced", data: { email_id: "re_2", to: ["someone-else@example.test"] } });
      expect(await status(second.id)).toBe("DELIVERY_FAILED");
      await applyProviderEvent(db, { type: "email.delivered", data: { email_id: "re_2" } });
      expect(await status(second.id)).toBe("DELIVERY_FAILED");
      expect(await status(first.id)).toBe("ACCEPTED");

      // A locally captured email can never become "delivered".
      const local = await deliverTemplate("application_received", "pat@example.test", { name: "Pat" });
      expect(await status(local.deliveryId)).toBe("CAPTURED_LOCALLY");
      await applyProviderEvent(db, { type: "email.delivered", data: { headers: { "X-CoWork-Delivery-Id": local.deliveryId } } });
      expect(await status(local.deliveryId)).toBe("CAPTURED_LOCALLY");
    } finally {
      process.env.RESEND_WEBHOOK_SECRET = "";
      resetEnvCache();
    }
  });

  it("stores text in any language exactly as written (UTF-8 database)", async () => {
    const subject = "Next step \u2192 interview \u{1F600} \u674e\u5c0f\u9f8d \u041e\u043b\u0435\u043d\u0430";
    const res = await deliver({ to: "a@example.test", subject, text: "Arrow \u2192 here" });
    expect(res.status).toBe("sent");
    const row = await db.emailDelivery.findUniqueOrThrow({ where: { id: res.deliveryId } });
    expect(row.subject).toBe(subject);
    expect(row.body).toBe("Arrow \u2192 here");
  });

  it("shows captured emails in the local web inbox with clickable links", async () => {
    await deliver({ to: "inbox@example.test", subject: "Reset your password", text: "Open https://example.test/reset-password/tok123 to continue." });
    const ui: Server = await startMailInbox({ port: 8737, dir: mailDir });
    try {
      const list = await (await fetch("http://127.0.0.1:8737/")).text();
      expect(list).toContain("Reset your password");
      expect(list).toContain("not</strong> delivered");
      const id = /\/message\/([0-9]+-[0-9]+)/.exec(list)?.[1];
      const msg = await (await fetch(`http://127.0.0.1:8737/message/${id}`)).text();
      expect(msg).toContain('<a href="https://example.test/reset-password/tok123"');
    } finally {
      await new Promise<void>((r) => ui.close(() => r()));
    }
  });
});
