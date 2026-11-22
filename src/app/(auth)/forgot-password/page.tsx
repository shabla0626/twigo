import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/forms/action-form";
import { Field, Input } from "@/components/forms/fields";
import { forgotPasswordAction } from "../actions";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold text-ink-950">Reset your password</h1>
      <p className="mt-2 text-sm leading-6 text-ink-600">Enter the email address of your account. If it exists, we will email you a link that works for one hour.</p>
      <ActionForm action={forgotPasswordAction} submitLabel="Send reset link" pendingLabel="Sending…" fullWidth className="mt-6">
        <Field id="email" label="Email">
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </Field>
      </ActionForm>
      <p className="mt-6 text-center text-sm">
        <Link href="/login" className="text-accent-700 underline-offset-2 hover:underline">
          Back to sign in
        </Link>
      </p>
    </>
  );
}
