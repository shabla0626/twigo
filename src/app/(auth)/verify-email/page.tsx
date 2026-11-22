import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/forms/action-form";
import { Field, FormAlert, Input } from "@/components/forms/fields";
import { PENDING_EMAIL_COOKIE } from "@/lib/auth/constants";
import { getSession } from "@/lib/auth/guard";
import { normalizeEmail } from "@/lib/validation/email";
import { localInboxUrl } from "@/lib/email";
import { changeUnverifiedEmailAction, logoutAction, resendVerificationAction, resendVerificationPublicAction } from "../actions";

export const metadata: Metadata = { title: "Confirm your email" };

type Props = { searchParams: Promise<Record<string, string | undefined>> };

/**
 * "Check your email" page. Works signed out (right after creating an account)
 * and signed in (someone who has not confirmed their address yet).
 */
export default async function VerifyEmailInstructions({ searchParams }: Props) {
  const sp = await searchParams;
  const s = await getSession();
  const user = s && s.user.status === "ACTIVE" ? s.user : null;
  if (user?.emailVerified) redirect("/continue");
  // Right after sign-up the address comes from a short-lived cookie set by this server, never from the page address.
  const email = user?.email ?? normalizeEmail((await cookies()).get(PENDING_EMAIL_COOKIE)?.value) ?? "";
  const inbox = localInboxUrl();

  return (
    <>
      <ol className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium text-ink-500" aria-label="Steps">
        <li>1. Create account ✓</li>
        <li className="text-accent-800">2. Confirm email</li>
        <li>3. Apply</li>
      </ol>
      <h1 className="mt-3 text-2xl font-semibold text-ink-950">Check your email</h1>
      <div className="mt-4 space-y-3 empty:hidden">
        {sp.mail === "failed" && (
          <FormAlert tone="error">
            Your account was saved, but we could not send the email right now. Nothing is lost: wait a minute, then press “Send the email again” below.
          </FormAlert>
        )}
        {sp.changed && <FormAlert tone="success">Your email address was updated. We sent a new link to it.</FormAlert>}
      </div>
      <p className="mt-3 text-[15px] leading-7 text-ink-700">
        {sp.mail === "failed" ? "When it is sent, the email goes to " : "We sent a link to "}
        {email ? <strong className="break-all text-ink-950">{email}</strong> : "your email address"}. Open the email and press the button in it to confirm your
        address. Then you can fill in your application.
      </p>
      <p className="mt-2 text-sm leading-6 text-ink-600">It can take a few minutes. Please also look in your spam or junk folder. The link works for 24 hours.</p>

      {inbox && (
        <p className="mt-4 rounded-xl bg-sky-50 p-3 text-sm leading-6 text-sky-950">
          <strong>Development mode.</strong> Emails are captured on this computer and are not delivered to real inboxes.{" "}
          <a href={inbox} target="_blank" rel="noopener noreferrer" className="font-semibold underline">
            Open the local test inbox
          </a>
        </p>
      )}

      <div className="mt-6 space-y-5 border-t border-ink-100 pt-5">
        {user ? (
          <>
            <ActionForm action={resendVerificationAction} submitLabel="Send the email again" pendingLabel="Sending…" variant="secondary" fullWidth>
              <p className="text-sm text-ink-600">Didn’t get it? You can ask for a new link once a minute.</p>
            </ActionForm>
            <details>
              <summary className="cursor-pointer text-sm font-medium text-accent-700">I typed the wrong email address</summary>
              <ActionForm action={changeUnverifiedEmailAction} submitLabel="Save and send a new link" variant="secondary" className="mt-3">
                <Field id="email" label="Correct email address">
                  <Input id="email" name="email" type="email" autoComplete="email" required maxLength={254} />
                </Field>
              </ActionForm>
            </details>
            <form action={logoutAction}>
              <button type="submit" className="text-sm text-ink-600 underline-offset-2 hover:underline">
                Sign out
              </button>
            </form>
          </>
        ) : (
          <>
            <ActionForm action={resendVerificationPublicAction} submitLabel="Send the email again" pendingLabel="Sending…" variant="secondary" fullWidth>
              {email ? (
                <input type="hidden" name="email" value={email} />
              ) : (
                <Field id="email" label="Email address">
                  <Input id="email" name="email" type="email" autoComplete="email" required maxLength={254} />
                </Field>
              )}
              <p className="text-sm text-ink-600">Didn’t get it? You can ask for a new link once a minute.</p>
            </ActionForm>
            <p className="text-sm leading-6 text-ink-600">
              Typed the wrong email address?{" "}
              <Link href="/login" className="font-medium text-accent-700 underline-offset-2 hover:underline">
                Sign in
              </Link>{" "}
              with the address and password you just entered, and you can correct it.
            </p>
          </>
        )}
      </div>
    </>
  );
}
