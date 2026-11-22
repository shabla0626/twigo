import { ActionForm } from "@/components/forms/action-form";
import { SettingsCard } from "@/components/ui/settings-card";
import { requireUser } from "@/lib/auth/guard";
import { getPreferences } from "@/server/community/notifications";
import { saveNotificationPrefsAction } from "../actions";

export default async function NotificationSettingsPage() {
  const user = await requireUser("/account/notifications");
  const prefs = await getPreferences(user.id);
  return (
    <>
      <h1 className="text-2xl font-semibold text-ink-950">Notifications</h1>
      <SettingsCard title="What you hear about" description="In-app notifications appear under Notifications in the community. Email copies go to your sign-in address. Repeated events (for example several comments) are combined.">
        <ActionForm action={saveNotificationPrefsAction} submitLabel="Save preferences">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ink-600">
                <th className="py-2 font-medium">Event</th>
                <th className="w-20 py-2 text-center font-medium">In app</th>
                <th className="w-20 py-2 text-center font-medium">Email</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {prefs.map((p) => (
                <tr key={p.type}>
                  <td className="py-2.5 text-ink-900">{p.label}</td>
                  <td className="text-center">
                    <input type="checkbox" name={`inApp:${p.type}`} defaultChecked={p.inApp} aria-label={`${p.label}: in app`} className="h-4 w-4" />
                  </td>
                  <td className="text-center">
                    <input type="checkbox" name={`email:${p.type}`} defaultChecked={p.email} aria-label={`${p.label}: email`} className="h-4 w-4" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ActionForm>
      </SettingsCard>
    </>
  );
}
