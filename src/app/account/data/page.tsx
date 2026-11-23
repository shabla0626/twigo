import Link from "next/link";
import { ActionForm } from "@/components/forms/action-form";
import { Field, Input } from "@/components/forms/fields";
import { buttonClass } from "@/components/ui/primitives";
import { SettingsCard } from "@/components/ui/settings-card";
import { isRecentlyAuthenticated, requireUser } from "@/lib/auth/guard";
import { PRIVACY_REQUEST_KINDS, PRIVACY_REQUEST_STATUSES } from "@/lib/labels";
import { myPrivacyRequests } from "@/server/privacy-requests";
import { deactivateSelfAction, privacyRequestAction } from "../actions";

export default async function DataPage() {
  const user = await requireUser("/account/data");
  const recent = await isRecentlyAuthenticated();
  const requests = await myPrivacyRequests(user.id);
  return (
    <>
      <h1 className="text-2xl font-semibold text-ink-950">Your data</h1>
      <SettingsCard
        title="Download your data"
        description="A JSON file with your account, profile, application, ideas, comments, group memberships, chat messages you wrote, notifications, file list, the policies you accepted, your project agreements and your privacy requests. Other members’ private information is not included."
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
        title="Make a privacy request"
        description={
          <>
            Ask to see, correct or delete your information, withdraw a consent, or object to a use of it. The{" "}
            <Link href="/legal/privacy" className="font-medium text-accent-700 underline underline-offset-2">
              Privacy Policy
            </Link>{" "}
            explains your rights. Some records may have to be kept, for example accepted agreements; the answer will say so.
          </>
        }
      >
        <ActionForm action={privacyRequestAction} submitLabel="Send request" resetOnSuccess>
          <Field id="kind" label="What would you like?">
            <select id="kind" name="kind" className="block w-full max-w-md rounded-md border border-ink-300 bg-white px-3 py-2 text-sm">
              {Object.entries(PRIVACY_REQUEST_KINDS).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field id="details" label="Details">
            <textarea id="details" name="details" rows={4} required minLength={10} maxLength={4000} className="block w-full rounded-md border border-ink-300 bg-white px-3 py-2 text-sm" />
          </Field>
        </ActionForm>
        {requests.length > 0 && (
          <ul className="mt-6 divide-y divide-ink-100 border-t border-ink-100 text-sm">
            {requests.map((r) => (
              <li key={r.id} className="py-3">
                <p className="font-medium text-ink-900">
                  {PRIVACY_REQUEST_KINDS[r.kind]} · {PRIVACY_REQUEST_STATUSES[r.status]}
                </p>
                <p className="text-xs text-ink-500">Sent {r.createdAt.toISOString().slice(0, 10)}</p>
                {r.response && <p className="mt-1 text-ink-700">Answer: {r.response}</p>}
              </li>
            ))}
          </ul>
        )}
      </SettingsCard>
      <SettingsCard
        title="Deactivate your account"
        description={
          <>
            You leave all groups and can no longer sign in. Your ideas and comments stay visible under your display name unless you ask for deletion. To have
            your personal data deleted, make a privacy request above before deactivating; some records (for example accepted agreements) may need to be kept.
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
