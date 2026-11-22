import Link from "next/link";
import { ActionForm } from "@/components/forms/action-form";
import { Field, Input } from "@/components/forms/fields";
import { buttonClass } from "@/components/ui/primitives";
import { SettingsCard } from "@/components/ui/settings-card";
import { isRecentlyAuthenticated, requireUser } from "@/lib/auth/guard";
import { deactivateSelfAction } from "../actions";

export default async function DataPage() {
  await requireUser("/account/data");
  const recent = await isRecentlyAuthenticated();
  return (
    <>
      <h1 className="text-2xl font-semibold text-ink-950">Your data</h1>
      <SettingsCard
        title="Download your data"
        description="A JSON file with your account, profile, application, ideas, comments, group memberships, chat messages you wrote, notifications and file list. Other members’ private information is not included."
      >
        {recent ? (
          <a href="/account/data/export" className={buttonClass("primary")} download>
            Download my data
          </a>
        ) : (
          <Link href="/account/confirm?next=/account/data" className={buttonClass("secondary")}>
            Confirm identity to download
          </Link>
        )}
      </SettingsCard>
      <SettingsCard
        title="Deactivate your account"
        description={
          <>
            You leave all groups and can no longer sign in. Your ideas and comments stay visible under your display name unless you ask for deletion. To have
            your personal data deleted, contact the organization after deactivating; some records (for example signed agreements) may need to be kept by law.
          </>
        }
      >
        {recent ? (
          <ActionForm action={deactivateSelfAction} submitLabel="Deactivate my account" variant="danger">
            <Field id="confirm" label="Type DEACTIVATE to confirm">
              <Input id="confirm" name="confirm" autoComplete="off" required className="max-w-56" />
            </Field>
          </ActionForm>
        ) : (
          <Link href="/account/confirm?next=/account/data" className={buttonClass("secondary")}>
            Confirm identity first
          </Link>
        )}
      </SettingsCard>
    </>
  );
}
