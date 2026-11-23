import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/forms/action-form";
import { Field, FormAlert, Input } from "@/components/forms/fields";
import { brand } from "@/config/brand";
import { db } from "@/lib/db";
import { inspectToken } from "@/lib/auth/tokens";
import { activateAction } from "../../actions";
import { PasswordFields } from "@/components/forms/password-fields";

export const metadata: Metadata = { title: "Activate your account" };

export default async function ActivatePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const check = await inspectToken(token, "INVITE");
  const user = check.ok ? await db.user.findUnique({ where: { id: check.userId }, select: { email: true, name: true, role: true } }) : null;
  return (
    <>
      <h1 className="text-2xl font-semibold text-ink-950">Activate your account</h1>
      {!check.ok || !user ? (
        <div className="mt-5 space-y-4">
          <FormAlert tone="error">
            {check.ok === false && check.reason === "expired"
              ? "This activation link has expired. Reply to the invitation email and we will send you a new one."
              : "This activation link is not valid or was already used. If you already activated your account, sign in."}
          </FormAlert>
          <Link href="/login" className="text-sm font-medium text-accent-700 hover:underline">
            Go to sign in
          </Link>
        </div>
      ) : (
        <>
          <p className="mt-2 text-sm leading-6 text-ink-600">
            Welcome to {brand().name}. This invitation was sent to <strong className="text-ink-900">{user.email}</strong>; activating your account
            confirms that address. Choose how other members will see your name, and set your password.
          </p>
          <ActionForm action={activateAction} submitLabel="Activate account" pendingLabel="Activating…" fullWidth className="mt-6">
            <input type="hidden" name="token" value={token} />
            <Field id="displayName" label="Display name" hint="Shown to other members. Your first name and last initial is a good choice.">
              <Input id="displayName" name="displayName" defaultValue={user.name.split(" ")[0]} minLength={2} maxLength={60} required aria-describedby="displayName-hint" />
            </Field>
            <PasswordFields label="Password" />
            <label className="flex items-start gap-3 text-sm text-ink-700">
              <input type="checkbox" name="acceptTerms" required className="mt-1 h-4 w-4 rounded border-ink-300 text-accent-700" />
              <span>
                I accept the{" "}
                <Link href="/legal/terms" target="_blank" className="font-medium text-accent-700 underline">
                  Terms of Use
                </Link>{" "}
                and the{" "}
                <Link href="/legal/community-guidelines" target="_blank" className="font-medium text-accent-700 underline">
                  Community Guidelines
                </Link>
                , and understand that membership does not guarantee paid work or income.
              </span>
            </label>
            <label className="flex items-start gap-3 text-sm text-ink-700">
              <input type="checkbox" name="ackPrivacy" required className="mt-1 h-4 w-4 rounded border-ink-300 text-accent-700" />
              <span>
                I have read the{" "}
                <Link href="/legal/privacy" target="_blank" className="font-medium text-accent-700 underline">
                  Privacy Policy
                </Link>
                .
              </span>
            </label>
          </ActionForm>
        </>
      )}
    </>
  );
}
