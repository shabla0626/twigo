import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { brand } from "@/config/brand";
import { ActionForm } from "@/components/forms/action-form";
import { Field, Input } from "@/components/forms/fields";
import { PasswordInput } from "@/components/forms/password-input";
import { getSession } from "@/lib/auth/guard";
import { registerAction } from "../actions";

export function generateMetadata(): Metadata {
  return { title: `Join ${brand().name}` };
}

export default async function JoinPage() {
  if (await getSession()) redirect("/continue");
  const name = brand().name;
  return (
    <>
      <h1 className="text-2xl font-semibold text-ink-950">Join {name}</h1>
      <p className="mt-2 text-[15px] leading-6 text-ink-600">Create your free account and apply to become part of our remote collaborative community.</p>
      <ol className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium text-ink-500" aria-label="Steps">
        <li className="text-accent-800">1. Create account</li>
        <li>2. Confirm email</li>
        <li>3. Apply</li>
      </ol>
      <ActionForm action={registerAction} submitLabel="Create Account" pendingLabel="Creating your account…" fullWidth className="mt-6">
        <Field id="fullName" label="Full name">
          <Input id="fullName" name="fullName" autoComplete="name" required minLength={2} maxLength={120} />
        </Field>
        <Field id="email" label="Email address">
          <Input id="email" name="email" type="email" autoComplete="email" required maxLength={254} />
        </Field>
        <Field id="password" label="Password" hint="At least 12 characters, with letters and numbers.">
          <PasswordInput id="password" name="password" autoComplete="new-password" required minLength={12} maxLength={128} aria-describedby="password-hint" />
        </Field>
        <Field id="confirm" label="Confirm password">
          <PasswordInput id="confirm" name="confirm" autoComplete="new-password" required minLength={12} maxLength={128} />
        </Field>
        {/* Hidden from people; filled only by automated spam programs. */}
        <div className="hidden" aria-hidden="true">
          <label htmlFor="website">Website</label>
          <input id="website" name="website" tabIndex={-1} autoComplete="off" />
        </div>
        <label className="flex items-start gap-3 text-sm leading-6 text-ink-700">
          <input type="checkbox" name="agree" required className="mt-1 h-4 w-4 rounded border-ink-300 text-accent-700" />
          <span>
            I agree to the{" "}
            <Link href="/terms" target="_blank" className="font-medium text-accent-700 underline">
              Terms of Use
            </Link>{" "}
            and{" "}
            <Link href="/privacy" target="_blank" className="font-medium text-accent-700 underline">
              Privacy Notice
            </Link>
            .
          </span>
        </label>
      </ActionForm>
      <p className="mt-3 text-center text-xs text-ink-500">Free. No fees, payments or bank details, ever.</p>
      <p className="mt-6 text-center text-sm text-ink-700">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-accent-700 underline-offset-2 hover:underline">
          Sign In
        </Link>
      </p>
    </>
  );
}
