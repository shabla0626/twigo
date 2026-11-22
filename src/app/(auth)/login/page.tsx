import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { brand } from "@/config/brand";
import { ActionForm } from "@/components/forms/action-form";
import { Field, FormAlert, Input } from "@/components/forms/fields";
import { PasswordInput } from "@/components/forms/password-input";
import { getSession } from "@/lib/auth/guard";
import { safeNext } from "@/lib/auth/safe-next";
import { loginAction } from "../actions";

export const metadata: Metadata = { title: "Sign in" };

type Props = { searchParams: Promise<Record<string, string | undefined>> };

export default async function LoginPage({ searchParams }: Props) {
  const sp = await searchParams;
  const s = await getSession();
  if (s && s.user.status === "ACTIVE") redirect(safeNext(sp.next) ? `/continue?next=${encodeURIComponent(safeNext(sp.next))}` : "/continue");
  const name = brand().name;
  return (
    <>
      <h1 className="text-2xl font-semibold text-ink-950">Sign In</h1>
      <div className="mt-4 space-y-3 empty:hidden">
        {sp.confirmed && <FormAlert tone="success">Your email address is confirmed. Please sign in to continue.</FormAlert>}
        {sp.reset && <FormAlert tone="success">Your password was changed. Sign in with your new password.</FormAlert>}
        {sp.signedout && <FormAlert tone="success">You are signed out.</FormAlert>}
        {sp.emailchanged && <FormAlert tone="success">Your email address was updated. Sign in with the new address.</FormAlert>}
        {sp.expired && <FormAlert tone="error">Your sign-in expired. Please sign in again.</FormAlert>}
      </div>
      <ActionForm action={loginAction} submitLabel="Sign In" pendingLabel="Signing in…" fullWidth className="mt-5">
        <input type="hidden" name="next" value={sp.next ?? ""} />
        <Field id="email" label="Email address">
          <Input id="email" name="email" type="email" autoComplete="username" required />
        </Field>
        <Field id="password" label="Password">
          <PasswordInput id="password" name="password" autoComplete="current-password" required />
        </Field>
      </ActionForm>
      <p className="mt-5 text-center text-sm">
        <Link href="/forgot-password" className="text-accent-700 underline-offset-2 hover:underline">
          Forgot Password?
        </Link>
      </p>
      <p className="mt-6 border-t border-ink-100 pt-5 text-center text-sm text-ink-700">
        New to {name}?{" "}
        <Link href="/join" className="font-medium text-accent-700 underline-offset-2 hover:underline">
          Join {name}
        </Link>
      </p>
    </>
  );
}
