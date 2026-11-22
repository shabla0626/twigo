import { ActionForm } from "@/components/forms/action-form";
import { Field, Input } from "@/components/forms/fields";
import { SettingsCard } from "@/components/ui/settings-card";
import { requireUser } from "@/lib/auth/guard";
import { confirmIdentityAction } from "../actions";

type Props = { searchParams: Promise<Record<string, string | undefined>> };

export default async function ConfirmIdentityPage({ searchParams }: Props) {
  const user = await requireUser("/account");
  const { next } = await searchParams;
  return (
    <>
      <h1 className="text-2xl font-semibold text-ink-950">Confirm it’s you</h1>
      <SettingsCard title="Confirm your identity" description="Sensitive actions (changing your email, downloading your data, security changes) need a fresh confirmation. It stays valid for 10 minutes.">
        <ActionForm action={confirmIdentityAction} submitLabel="Confirm">
          <input type="hidden" name="next" value={next ?? "/account"} />
          <Field id="password" label="Password">
            <Input id="password" name="password" type="password" autoComplete="current-password" required />
          </Field>
          {user.totpEnabled && (
            <Field id="code" label="Code from your authenticator app">
              <Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} required />
            </Field>
          )}
        </ActionForm>
      </SettingsCard>
    </>
  );
}
