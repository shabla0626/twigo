import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminHeader, Flash, Panel, smallInput, smallLabel } from "@/components/admin/ui";
import { ActionForm } from "@/components/forms/action-form";
import { buttonClass } from "@/components/ui/primitives";
import { requireAdmin } from "@/lib/auth/guard";
import { getTemplate } from "@/lib/email";
import { TEMPLATES, isTemplateKey } from "@/lib/email/templates";
import { resetTemplateAction, saveTemplateAction, testEmailAction } from "../../../actions/community";

type Props = { params: Promise<{ key: string }>; searchParams: Promise<Record<string, string | undefined>> };

export default async function EditTemplatePage({ params, searchParams }: Props) {
  await requireAdmin("email.templates");
  const { key } = await params;
  const sp = await searchParams;
  if (!isTemplateKey(key)) notFound();
  const def = TEMPLATES[key];
  const t = await getTemplate(key);
  return (
    <>
      <p className="mb-4 text-sm">
        <Link href="/admin/email" className="text-accent-700 hover:underline">
          ← Email
        </Link>
      </p>
      <AdminHeader title={def.label} description={def.description} />
      <Flash ok={sp.ok} error={sp.error} />
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_18rem]">
        <Panel title="Wording">
          <ActionForm action={saveTemplateAction} submitLabel="Save template">
            <input type="hidden" name="key" value={key} />
            <div>
              <label htmlFor="subject" className={smallLabel}>
                Subject
              </label>
              <input id="subject" name="subject" defaultValue={t.subject} required maxLength={200} className={smallInput} />
            </div>
            <div>
              <label htmlFor="body" className={smallLabel}>
                Body (plain text)
              </label>
              <textarea id="body" name="body" defaultValue={t.body} required rows={18} className={`${smallInput} font-mono`} />
            </div>
          </ActionForm>
        </Panel>
        <div className="space-y-6">
          <Panel title="Placeholders">
            <ul className="space-y-1 text-sm">
              {def.variables.map((v) => (
                <li key={v}>
                  <code className="rounded bg-ink-100 px-1.5 py-0.5">{`{{${v}}}`}</code>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-ink-500">Links ({"{{activationLink}}"}, {"{{resetLink}}"}, {"{{verifyLink}}"}) must stay in the text. Never ask for fees, payments or ID documents.</p>
          </Panel>
          <Panel title="Test">
            <ActionForm action={testEmailAction} submitLabel="Send test to my address" variant="secondary">
              <input type="hidden" name="key" value={key} />
            </ActionForm>
          </Panel>
          {t.customized && (
            <form action={resetTemplateAction}>
              <input type="hidden" name="key" value={key} />
              <button className={buttonClass("ghost", "sm")}>Restore default wording</button>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
