import "server-only";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { deliver, describeSend } from "@/lib/email";
import { RETRYABLE } from "@/lib/email/status";
import { isTemplateKey } from "@/lib/email/templates";
import { invitationDraft, requestPasswordReset, sendInvitation } from "./accounts";
import { sendVerificationEmail } from "./onboarding";

type Result = { ok: true; message: string } | { ok: false; error: string };

/**
 * Manually re-sends a delivery that did not reach the recipient.
 * - Messages without secrets are re-sent with their original text.
 * - Messages with a one-time link are never re-sent as stored (the text is not
 *   kept); a NEW link is issued instead, which invalidates the old one.
 * Each retry creates a new log row linked to the original; the original row
 * is never changed, so the history stays complete.
 */
export async function retryDelivery(adminId: string, deliveryId: string): Promise<Result> {
  const d = await db.emailDelivery.findUnique({ where: { id: deliveryId } });
  if (!d) return { ok: false, error: "That email was not found." };
  if (!RETRYABLE.includes(d.status)) return { ok: false, error: "Only emails that were not sent (or that bounced) can be retried. This prevents duplicates." };
  const done = await db.emailDelivery.findFirst({ where: { retryOfId: d.id, status: { in: ["ACCEPTED", "DELIVERED", "CAPTURED_LOCALLY"] } } });
  if (done) return { ok: false, error: "This email was already retried successfully." };

  let message: string;
  if (d.body) {
    const res = await deliver({
      to: d.to,
      subject: d.subject,
      text: d.body,
      templateKey: d.templateKey && isTemplateKey(d.templateKey) ? d.templateKey : undefined,
      sentById: adminId,
      applicationId: d.applicationId,
      userId: d.userId,
      retryOfId: d.id,
    });
    if (res.status !== "sent") return { ok: false, error: `Retry failed. ${res.error}` };
    message = describeSend(res);
  } else if (d.templateKey === "account_invitation" && d.applicationId && d.userId) {
    const user = await db.user.findUnique({ where: { id: d.userId }, select: { name: true, status: true } });
    if (!user) return { ok: false, error: "The account no longer exists." };
    if (user.status !== "INVITED") return { ok: false, error: "This person has already activated their account." };
    const draft = await invitationDraft(user.name);
    const res = await sendInvitation(adminId, d.applicationId, { subject: draft.subject, body: draft.text });
    if (!res.ok) return { ok: false, error: res.error };
    await db.emailDelivery.updateMany({ where: { to: d.to, templateKey: "account_invitation", retryOfId: null, createdAt: { gt: d.createdAt } }, data: { retryOfId: d.id } });
    message = "A new invitation link was issued and accepted by the email provider. The old link no longer works.";
  } else if (d.templateKey === "account_verification" && d.userId) {
    const res = await sendVerificationEmail(d.userId, { ignoreCooldown: true });
    if (!res.ok) return { ok: false, error: res.reason === "verified" ? "This person has already confirmed their email address." : "A confirmation email cannot be sent for this account." };
    if (res.mailStatus !== "sent") return { ok: false, error: `Retry failed. ${res.error ?? ""}` };
    message = "A new confirmation link was sent. Earlier links no longer work.";
  } else if (d.templateKey === "password_reset") {
    await (await requestPasswordReset(d.to, `admin-retry:${adminId}`)).done;
    message = "If the account still exists, a new password reset link was sent. Check the log below for the result.";
  } else if (d.templateKey === "account_invitation") {
    return { ok: false, error: "This was an administrator invitation. Invite the person again from Admin → Administrators." };
  } else if (d.templateKey === "email_verification") {
    return { ok: false, error: "This email contained a private confirmation link that cannot be re-sent. Ask the member to request the email change again." };
  } else {
    return { ok: false, error: "The text of this email was not kept, so it cannot be re-sent automatically." };
  }
  await audit(adminId, "email.retry", "EmailDelivery", d.id, { template: d.templateKey, previousStatus: d.status });
  return { ok: true, message };
}
