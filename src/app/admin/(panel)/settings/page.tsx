import Link from "next/link";
import { AdminHeader, Panel, smallInput, smallLabel } from "@/components/admin/ui";
import { ActionForm } from "@/components/forms/action-form";
import { brand } from "@/config/brand";
import { isRecentlyAuthenticated, requireAdmin } from "@/lib/auth/guard";
import { SETTINGS, getAllSettings, type SettingKey } from "@/server/settings";
import { saveSettingsAction } from "../../actions/community";

export default async function SettingsPage() {
  await requireAdmin("settings.manage");
  const [values, recent] = await Promise.all([getAllSettings(), isRecentlyAuthenticated()]);
  const b = brand();
  const keys = Object.keys(SETTINGS) as SettingKey[];
  return (
    <>
      <AdminHeader title="Organization settings" description="Owner only. Every change is recorded in the audit log." />
      {!recent && (
        <p className="mt-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Saving needs a fresh identity confirmation.{" "}
          <Link href="/account/confirm?next=/admin/settings" className="font-medium underline">
            Confirm now
          </Link>
        </p>
      )}
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_20rem]">
        <Panel title="Community and data retention">
          <ActionForm action={saveSettingsAction} submitLabel="Save settings">
            {keys.map((k) => (
              <div key={k}>
                <label htmlFor={k} className={smallLabel}>
                  {SETTINGS[k].label}
                </label>
                <input id={k} name={k} type="number" defaultValue={values[k] ?? ""} placeholder={SETTINGS[k].default === null ? "keep" : undefined} className={`${smallInput} max-w-40`} />
                {SETTINGS[k].help && <p className="mt-1 text-xs text-ink-500">{SETTINGS[k].help}</p>}
              </div>
            ))}
            <p className="text-xs text-ink-500">Leave a retention field empty to keep that data indefinitely. Retention periods should be confirmed with legal advice.</p>
          </ActionForm>
        </Panel>
        <Panel title="Branding (environment variables)">
          <dl className="space-y-2 text-sm">
            {[
              ["Name (ORG_NAME)", b.name],
              ["Legal name (ORG_LEGAL_NAME)", b.legalName || "not set"],
              ["Tagline (ORG_TAGLINE)", b.tagline],
              ["Site URL (SITE_URL)", b.siteUrl],
              ["Contact (ORG_CONTACT_EMAIL)", b.contactEmail || "not set"],
              ["Email sender name (EMAIL_FROM_NAME)", b.emailFromName],
              ["Jurisdiction (ORG_JURISDICTION)", b.jurisdiction || "not set"],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-ink-500">{k}</dt>
                <dd className="break-words text-ink-900">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs text-ink-500">Change these in the server environment and restart. See src/config/brand.ts.</p>
        </Panel>
      </div>
    </>
  );
}
