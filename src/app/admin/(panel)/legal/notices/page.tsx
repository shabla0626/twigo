import { ActionForm } from "@/components/forms/action-form";
import { AdminHeader, Panel, smallInput, smallLabel } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/auth/guard";
import { NOTICE_FIELDS, NOTICE_KEYS, readNotices } from "@/server/legal-notices";
import { saveNoticesAction } from "../../../actions/twigo";

export default async function AdminLegalNoticesPage() {
  await requireAdmin("legal.manage");
  const n = await readNotices();
  return (
    <>
      <AdminHeader
        title="Legal notices"
        description="Who operates the site and under which law. Values stay private until you tick 'confirmed'; the public page then shows them. Never enter information that is not yet true."
      />
      <Panel className="mt-6">
        <ActionForm action={saveNoticesAction} submitLabel="Save legal notices">
          {NOTICE_KEYS.map((k) => (
            <div key={k} className="grid gap-2 border-b border-ink-100 pb-4 sm:grid-cols-[1fr_auto] sm:items-end">
              <div>
                <label htmlFor={`${k}_value`} className={smallLabel}>
                  {NOTICE_FIELDS[k].label}
                </label>
                <input id={`${k}_value`} name={`${k}_value`} defaultValue={n[k].value} maxLength={300} className={smallInput} />
                {NOTICE_FIELDS[k].help && <p className="mt-1 text-xs text-ink-500">{NOTICE_FIELDS[k].help}</p>}
              </div>
              <label className="flex items-center gap-2 text-sm text-ink-700">
                <input type="checkbox" name={`${k}_confirmed`} defaultChecked={n[k].confirmed} />
                Confirmed, show publicly
              </label>
            </div>
          ))}
        </ActionForm>
      </Panel>
    </>
  );
}
