import { EMAIL_STATUS_INFO } from "@/lib/email/status";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminHeader, Panel, smallInput, smallLabel } from "@/components/admin/ui";
import { ActionForm } from "@/components/forms/action-form";
import { buttonClass } from "@/components/ui/primitives";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/guard";
import { siteUrl } from "@/lib/env";
import { renderEmail } from "@/lib/email";
import { TEMPLATES, isTemplateKey, type TemplateKey } from "@/lib/email/templates";
import { sendApplicantEmailAction } from "../../../../actions/community";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> };

const APPLICANT_TEMPLATES = (Object.keys(TEMPLATES) as TemplateKey[]).filter((k) => TEMPLATES[k].audience === "applicant");

/**
 * Compose step: the template is rendered for this applicant, the admin can
 * edit it, adds optional details, reviews, ticks the confirmation and sends.
 * Nothing is ever sent automatically when a status changes.
 */
export default async function ComposeApplicantEmail({ params, searchParams }: Props) {
  await requireAdmin("email.send");
  const { id } = await params;
  const sp = await searchParams;
  const app = await db.application.findUnique({ where: { id }, select: { id: true, status: true, applicant: { select: { fullName: true, email: true } } } });
  if (!app) notFound();
  const key: TemplateKey = sp.template && isTemplateKey(sp.template) && TEMPLATES[sp.template].audience === "applicant" ? sp.template : "interview_invitation";
  const draft = await renderEmail(key, { name: app.applicant.fullName.split(" ")[0], details: sp.details ?? "", statusLink: siteUrl("/application"), communityLink: siteUrl("/community"), joinLink: siteUrl("/join") });
  const history = await db.emailDelivery.findMany({ where: { applicationId: id }, orderBy: { createdAt: "desc" }, take: 10 });
  return (
    <>
      <p className="mb-4 text-sm">
        <Link href={`/admin/applications/${id}`} className="text-accent-700 hover:underline">
          ← Back to application
        </Link>
      </p>
      <AdminHeader title={`Email ${app.applicant.fullName}`} description={`To ${app.applicant.email}. Review the message, then confirm to send. Every attempt is logged.`} />
      <div className="mt-6 flex flex-wrap gap-2">
        {APPLICANT_TEMPLATES.map((k) => (
          <Link key={k} href={`?template=${k}`} className={buttonClass(k === key ? "primary" : "secondary", "sm")}>
            {TEMPLATES[k].label}
          </Link>
        ))}
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_18rem]">
        <Panel title="Message preview (editable)">
          <ActionForm action={sendApplicantEmailAction} submitLabel="Send email" pendingLabel="Sending…">
            <input type="hidden" name="applicationId" value={id} />
            <input type="hidden" name="template" value={key} />
            <div>
              <label htmlFor="subject" className={smallLabel}>
                Subject
              </label>
              <input id="subject" name="subject" defaultValue={draft.subject} required maxLength={200} className={smallInput} />
            </div>
            <div>
              <label htmlFor="body" className={smallLabel}>
                Message
              </label>
              <textarea id="body" name="body" defaultValue={draft.text} required rows={18} className={smallInput} />
            </div>
            <label className="flex items-start gap-2 text-sm text-ink-800">
              <input type="checkbox" name="confirm" className="mt-1" />I reviewed this message and want to send it to {app.applicant.email}.
            </label>
          </ActionForm>
        </Panel>
        <Panel title="Sent to this applicant">
          {history.length ? (
            <ul className="space-y-2 text-sm">
              {history.map((h) => (
                <li key={h.id}>
                  <span className="font-medium">{h.subject}</span>
                  <span className="block text-xs text-ink-500">
                    {h.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC · {EMAIL_STATUS_INFO[h.status].label.toLowerCase()}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-600">Nothing yet.</p>
          )}
        </Panel>
      </div>
    </>
  );
}
