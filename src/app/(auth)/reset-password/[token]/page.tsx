import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/forms/action-form";
import { FormAlert } from "@/components/forms/fields";
import { PasswordFields } from "@/components/forms/password-fields";
import { inspectToken } from "@/lib/auth/tokens";
import { resetPasswordAction } from "../../actions";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const check = await inspectToken(token, "RESET_PASSWORD");
  return (
    <>
      <h1 className="text-2xl font-semibold text-ink-950">Choose a new password</h1>
      {!check.ok ? (
        <div className="mt-5 space-y-4">
          <FormAlert tone="error">This reset link is not valid, has expired or was already used.</FormAlert>
          <Link href="/forgot-password" className="text-sm font-medium text-accent-700 hover:underline">
            Request a new link
          </Link>
        </div>
      ) : (
        <ActionForm action={resetPasswordAction} submitLabel="Save new password" fullWidth className="mt-6">
          <input type="hidden" name="token" value={token} />
          <PasswordFields />
        </ActionForm>
      )}
    </>
  );
}
