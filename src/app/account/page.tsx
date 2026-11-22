import Link from "next/link";
import { ActionForm } from "@/components/forms/action-form";
import { Field, Input } from "@/components/forms/fields";
import { PasswordFields } from "@/components/forms/password-fields";
import { SettingsCard } from "@/components/ui/settings-card";
import { isRecentlyAuthenticated, requireUser } from "@/lib/auth/guard";
import { changeEmailAction, changePasswordAction } from "./actions";

export default async function AccountPage() {
  const user = await requireUser("/account");
  const recent = await isRecentlyAuthenticated();
  return (
    <>
      <h1 className="text-2xl font-semibold text-ink-950">Account</h1>
      <SettingsCard title="Email address" description={<>Your sign-in address is <strong className="text-ink-900">{user.email}</strong>. It is never shown to other members.</>}>
        {recent ? (
          <ActionForm action={changeEmailAction} submitLabel="Send confirmation link" resetOnSuccess>
            <Field id="email" label="New email address" hint="We send a link to the new address. The change takes effect when you click it.">
              <Input id="email" name="email" type="email" autoComplete="email" required aria-describedby="email-hint" />
            </Field>
          </ActionForm>
        ) : (
          <p className="text-sm text-ink-700">
            To change your email,{" "}
            <Link href="/account/confirm?next=/account" className="font-medium text-accent-700 underline">
              confirm your identity
            </Link>{" "}
            first.
          </p>
        )}
      </SettingsCard>
      <SettingsCard title="Password" description="Changing your password signs you out on all other devices.">
        <ActionForm action={changePasswordAction} submitLabel="Change password" resetOnSuccess>
          <Field id="current" label="Current password">
            <Input id="current" name="current" type="password" autoComplete="current-password" required />
          </Field>
          <PasswordFields />
        </ActionForm>
      </SettingsCard>
    </>
  );
}
