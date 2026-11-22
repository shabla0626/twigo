"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { NotificationType } from "@prisma/client";
import type { FormState } from "@/components/forms/action-form";
import { audit } from "@/lib/audit";
import { getSession, isRecentlyAuthenticated, requireUser } from "@/lib/auth/guard";
import { clearSessionCookie, revokeSessionById, revokeUserSessions } from "@/lib/auth/session";
import {
  beginTotpSetup,
  changePassword,
  confirmIdentity,
  confirmTotpSetup,
  deactivateUser,
  disableTotp,
  regenerateRecoveryCodes,
  requestEmailChange,
} from "@/server/accounts";
import { NOTIFICATION_TYPES, savePreferences } from "@/server/community/notifications";
import { stashCodes } from "@/server/flash";

async function current() {
  const s = await getSession();
  if (!s || s.user.status !== "ACTIVE") redirect("/login");
  return s;
}

function safeNext(v: FormDataEntryValue | null) {
  const s = typeof v === "string" ? v : "";
  return s.startsWith("/") && !s.startsWith("//") ? s : "/account";
}

export async function confirmIdentityAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const s = await current();
  const res = await confirmIdentity(s.user.id, s.sessionId, String(fd.get("password") ?? ""), String(fd.get("code") ?? "") || undefined);
  if (!res.ok) return { error: res.error };
  redirect(safeNext(fd.get("next")));
}

export async function changePasswordAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const s = await current();
  const next = String(fd.get("password") ?? "");
  if (next !== String(fd.get("confirm") ?? "")) return { error: "The two new passwords do not match." };
  const res = await changePassword(s.user.id, s.sessionId, String(fd.get("current") ?? ""), next);
  if (!res.ok) return { error: res.error };
  return { ok: "Password changed. You were signed out on all other devices." };
}

export async function changeEmailAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const s = await current();
  if (!(await isRecentlyAuthenticated())) return { error: "For your security, confirm your password first (use the “Confirm identity” link)." };
  const { message } = await requestEmailChange(s.user.id, String(fd.get("email") ?? ""));
  return { ok: message };
}

// Setting up two-step verification decides who can sign in to this account from
// now on, so it needs a recent proof of identity (signing in counts for a few
// minutes; later the password is asked again). Without this, anyone holding an
// open session could attach their own authenticator and lock the owner out.
export async function startTotpAction() {
  const s = await current();
  if (!(await isRecentlyAuthenticated())) redirect("/account/confirm?next=/account/security");
  await beginTotpSetup(s.user.id);
  redirect("/account/security?setup=1");
}

export async function confirmTotpAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const s = await current();
  // Took longer than the confirmation window: ask for the password, then return to this step (the setup is kept).
  if (!(await isRecentlyAuthenticated())) redirect(`/account/confirm?next=${encodeURIComponent("/account/security?setup=1")}`);
  // Every other session of this account is ended: only the device that set it up stays signed in.
  const res = await confirmTotpSetup(s.user.id, String(fd.get("code") ?? ""), s.sessionId);
  if (!res.ok) return { error: res.error };
  // Recovery codes are shown exactly once via a short-lived, http-only flash.
  await stashCodes(s.user.id, res.recoveryCodes);
  redirect("/account/security?codes=1");
}

export async function regenerateCodesAction() {
  const s = await current();
  if (!(await isRecentlyAuthenticated())) redirect("/account/confirm?next=/account/security");
  const codes = await regenerateRecoveryCodes(s.user.id);
  await stashCodes(s.user.id, codes);
  redirect("/account/security?codes=1");
}

export async function disableTotpAction() {
  const s = await current();
  if (!(await isRecentlyAuthenticated())) redirect("/account/confirm?next=/account/security");
  const res = await disableTotp(s.user.id);
  redirect(res.ok ? "/account/security?ok=Two-step+verification+turned+off" : `/account/security?error=${encodeURIComponent(res.error)}`);
}

export async function revokeSessionAction(fd: FormData) {
  const s = await current();
  const id = String(fd.get("id") ?? "");
  await revokeSessionById(s.user.id, id);
  await audit(s.user.id, "auth.session_revoked", "User", s.user.id);
  revalidatePath("/account/security");
}

export async function signOutOthersAction() {
  const s = await current();
  const n = await revokeUserSessions(s.user.id, s.sessionId);
  await audit(s.user.id, "auth.sessions_revoked", "User", s.user.id, { count: n });
  redirect(`/account/security?ok=${encodeURIComponent(`Signed out of ${n} other session${n === 1 ? "" : "s"}.`)}`);
}

export async function saveNotificationPrefsAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const u = await requireUser();
  const prefs = (Object.keys(NOTIFICATION_TYPES) as NotificationType[]).map((type) => ({
    type,
    inApp: fd.get(`inApp:${type}`) === "on",
    email: fd.get(`email:${type}`) === "on",
  }));
  await savePreferences(u.id, prefs);
  return { ok: "Notification preferences saved." };
}

export async function deactivateSelfAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const s = await current();
  if (!(await isRecentlyAuthenticated())) return { error: "Confirm your identity first." };
  if (String(fd.get("confirm") ?? "").trim().toUpperCase() !== "DEACTIVATE") return { error: "Type DEACTIVATE to confirm." };
  const res = await deactivateUser(s.user.id, s.user.id);
  if (!res.ok) return { error: res.error };
  await clearSessionCookie();
  redirect("/login?signedout=1");
}
