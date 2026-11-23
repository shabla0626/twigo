"use server";

import { redirect } from "next/navigation";
import { REGISTRATION_ACCEPT, REGISTRATION_ACK } from "@/content/legal";
import { recordAcceptance } from "@/server/legal";
import { PENDING_EMAIL_COOKIE } from "@/lib/auth/constants";
import { cookies } from "next/headers";
import { z } from "zod";
import type { FormState } from "@/components/forms/action-form";
import { audit } from "@/lib/audit";
import { authenticate, completeSecondFactor } from "@/lib/auth/service";
import { getSession } from "@/lib/auth/guard";
import { clearSessionCookie, createSession, readSessionToken, revokeSessionByToken, setSessionCookie, userAgent } from "@/lib/auth/session";
import { safeNext } from "@/lib/auth/safe-next";
import { clientIp, hashIp } from "@/lib/security";
import { activateAccount, requestPasswordReset, resetPassword } from "@/server/accounts";
import { changeUnverifiedEmail, registerAccount, resendVerificationByEmail, sendVerificationEmail, verifyEmailToken } from "@/server/onboarding";

/** Only same-site relative paths are accepted as redirect targets. */
/** A page inside this site to return to after signing in (never the sign-in pages themselves). */
function nextAfterSignIn(raw: FormDataEntryValue | null): string {
  const v = safeNext(raw);
  return v.startsWith("/login") ? "" : v;
}

/** Everyone passes through /continue, which decides the right page from the account's real state. */
function continueUrl(next: string) {
  return next ? `/continue?next=${encodeURIComponent(next)}` : "/continue";
}

async function ctx() {
  return { ipHash: hashIp(await clientIp()), userAgent: await userAgent() };
}

const loginSchema = z.object({ email: z.string().trim().min(3).max(254), password: z.string().min(1).max(200) });

export async function loginAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({ email: fd.get("email"), password: fd.get("password") });
  if (!parsed.success) return { error: "Enter your email address and password." };
  const res = await authenticate(parsed.data.email, parsed.data.password, await ctx());
  if (!res.ok) return { error: res.error };
  await setSessionCookie(res.token, res.expiresAt);
  const next = nextAfterSignIn(fd.get("next"));
  if (res.stage === "mfa") redirect(`/login/verify${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  redirect(continueUrl(next));
}

export async function verifyMfaAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const code = String(fd.get("code") ?? "").slice(0, 40);
  if (!code.trim()) return { error: "Enter the code from your authenticator app or a recovery code." };
  const res = await completeSecondFactor(await readSessionToken(), code, await ctx());
  if (!res.ok) {
    if (res.restart) {
      await clearSessionCookie();
      redirect("/login?expired=1");
    }
    return { error: res.error };
  }
  await setSessionCookie(res.token, res.expiresAt);
  redirect(continueUrl(nextAfterSignIn(fd.get("next"))));
}

export async function logoutAction() {
  const s = await getSession();
  const token = await readSessionToken();
  await revokeSessionByToken(token);
  if (s) await audit(s.user.id, "auth.logout", "User", s.user.id);
  await clearSessionCookie();
  redirect("/login?signedout=1");
}

// ---------------------------------------------------------------- registration

export async function registerAction(_prev: FormState, fd: FormData): Promise<FormState> {
  // Honeypot: real people never fill this hidden field.
  if (String(fd.get("website") ?? "")) redirect("/verify-email?sent=1");
  const res = await registerAccount(
    {
      fullName: fd.get("fullName"),
      email: fd.get("email"),
      password: fd.get("password"),
      confirm: fd.get("confirm"),
      acceptTerms: fd.get("acceptTerms") === "on",
      acceptGuidelines: fd.get("acceptGuidelines") === "on",
      ackPrivacy: fd.get("ackPrivacy") === "on",
      legalVersions: fd.getAll("legalVersion").map(String),
    },
    { ipHash: (await ctx()).ipHash },
  );
  if (!res.ok) return { error: res.error, fieldErrors: res.fieldErrors };
  const mail = res.mailStatus === "sent" || res.mailStatus === "skipped" ? "" : "&mail=failed";
  // The address is shown on the next page, but it is kept out of the page address (which
  // browsers store in their history): a short-lived cookie that only this server can read.
  (await cookies()).set(PENDING_EMAIL_COOKIE, res.email, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/verify-email", maxAge: 30 * 60 });
  redirect(`/verify-email?sent=1${mail}`);
}

/** Resend for a signed-in, not yet verified account. */
export async function resendVerificationAction(): Promise<FormState> {
  const s = await getSession();
  if (!s) redirect("/login");
  const res = await sendVerificationEmail(s.user.id);
  if (!res.ok) {
    if (res.reason === "verified") redirect("/continue");
    if (res.reason === "cooldown") return { error: `Please wait ${res.retryInSeconds && res.retryInSeconds > 60 ? "a few minutes" : `${res.retryInSeconds ?? 60} seconds`} before asking for another email.` };
    return { error: "A confirmation email cannot be sent for this account." };
  }
  if (res.mailStatus !== "sent") return { error: `We could not send the email. ${res.error ?? ""} Your account is safe; please try again in a few minutes.` };
  return { ok: "We sent a new confirmation link. Earlier links no longer work." };
}

/** Resend from the public "check your email" page (answers the same way for every address). */
export async function resendVerificationPublicAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const email = String(fd.get("email") ?? "").slice(0, 254);
  if (!email.includes("@")) return { error: "Enter the email address you used to create your account." };
  return { ok: (await resendVerificationByEmail(email, (await ctx()).ipHash)).message };
}

export async function changeUnverifiedEmailAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const s = await getSession();
  if (!s) redirect("/login");
  const res = await changeUnverifiedEmail(s.user.id, String(fd.get("email") ?? ""));
  if (!res.ok) return { error: res.error };
  redirect("/verify-email?changed=1");
}

/** The button on the page opened from the email. Consumes the single-use link. */
export async function verifyEmailAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const res = await verifyEmailToken(String(fd.get("token") ?? ""));
  if (!res.ok) return { error: res.error };
  if (res.kind === "change") {
    await clearSessionCookie();
    redirect("/login?emailchanged=1");
  }
  const existing = await getSession();
  const signedIn = existing && existing.user.id === res.userId;
  // Opening the emailed link proves the address, and for an ordinary new account that is enough
  // to continue. It is NOT a replacement for two-step verification, and never for staff:
  // those accounts confirm the address here and then sign in the normal way.
  if (!signedIn && (res.twoStep || res.role !== "MEMBER")) redirect("/login?confirmed=1");
  if (!signedIn) {
    const s = await createSession(res.userId, res.role, await ctx());
    await setSessionCookie(s.token, s.expiresAt);
  }
  redirect("/continue?verified=1");
}

// ---------------------------------------------------------------- passwords

export async function forgotPasswordAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const email = String(fd.get("email") ?? "").slice(0, 254);
  if (!email.includes("@")) return { error: "Enter the email address of your account." };
  const { message } = await requestPasswordReset(email, (await ctx()).ipHash);
  return { ok: message };
}

export async function resetPasswordAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const token = String(fd.get("token") ?? "");
  const password = String(fd.get("password") ?? "");
  if (password !== String(fd.get("confirm") ?? "")) return { error: "The two passwords do not match." };
  const res = await resetPassword(token, password);
  if (!res.ok) return { error: res.error };
  redirect("/login?reset=1");
}

// ---------------------------------------------------------------- invitations (administrators, and members invited before self-registration)

export async function activateAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const token = String(fd.get("token") ?? "");
  const password = String(fd.get("password") ?? "");
  if (password !== String(fd.get("confirm") ?? "")) return { error: "The two passwords do not match." };
  if (fd.get("acceptTerms") !== "on") return { error: "Please accept the Terms of Use and the Community Guidelines." };
  if (fd.get("ackPrivacy") !== "on") return { error: "Please confirm that you have read the Privacy Policy." };
  const res = await activateAccount(token, { password, displayName: String(fd.get("displayName") ?? "") });
  if (!res.ok) return { error: res.error };
  // The versions current at this moment are the ones the person was shown.
  for (const key of REGISTRATION_ACCEPT) await recordAcceptance({ userId: res.userId, key, kind: "ACCEPTED", method: "activation" });
  for (const key of REGISTRATION_ACK) await recordAcceptance({ userId: res.userId, key, kind: "ACKNOWLEDGED", method: "activation" });
  const s = await createSession(res.userId, res.role, await ctx());
  await setSessionCookie(s.token, s.expiresAt);
  redirect(res.role === "MEMBER" ? "/continue" : "/account/security?required=2fa");
}
