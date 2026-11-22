import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/forms/action-form";
import { Field, Input } from "@/components/forms/fields";
import { verifyMfaAction } from "../../actions";

export const metadata: Metadata = { title: "Two-step verification" };

type Props = { searchParams: Promise<Record<string, string | undefined>> };

export default async function VerifyPage({ searchParams }: Props) {
  const sp = await searchParams;
  return (
    <>
      <h1 className="text-2xl font-semibold text-ink-950">Two-step verification</h1>
      <p className="mt-2 text-sm leading-6 text-ink-600">
        Enter the 6-digit code from your authenticator app. If you lost access to the app, enter one of your recovery codes.
      </p>
      <ActionForm action={verifyMfaAction} submitLabel="Verify" pendingLabel="Checking…" fullWidth className="mt-6">
        <input type="hidden" name="next" value={sp.next ?? ""} />
        <Field id="code" label="Code">
          <Input id="code" name="code" inputMode="text" autoComplete="one-time-code" autoFocus required maxLength={20} placeholder="123456" />
        </Field>
      </ActionForm>
      <p className="mt-6 text-center text-sm">
        <Link href="/login" className="text-accent-700 underline-offset-2 hover:underline">
          Start over
        </Link>
      </p>
    </>
  );
}
