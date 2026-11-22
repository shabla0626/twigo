import Link from "next/link";
import { ActionForm } from "@/components/forms/action-form";
import { AdminHeader, Empty, Flash, Panel, Table, fmtDate } from "@/components/admin/ui";
import { Badge, Button } from "@/components/ui/primitives";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { requireAdmin } from "@/lib/auth/guard";
import { can } from "@/lib/auth/permissions";
import { emailConfigProblem, smtpSettings } from "@/lib/email";
import { EMAIL_STATUS_INFO, RETRYABLE } from "@/lib/email/status";
import { TEMPLATES, TEMPLATE_KEYS } from "@/lib/email/templates";
import { checkEmailConnectionAction, retryEmailAction, sendTestToMeAction } from "../../actions/community";

type Props = { searchParams: Promise<Record<string, string | undefined>> };

export default async function EmailAdminPage({ searchParams }: Props) {
  const admin = await requireAdmin("email.send");
  const sp = await searchParams;
  const onlyProblems = sp.filter === "problems";
  const [custom, deliveries, retried] = await Promise.all([
    db.emailTemplate.findMany({ select: { key: true, updatedAt: true } }),
    db.emailDelivery.findMany({
      where: onlyProblems ? { status: { in: RETRYABLE } } : undefined,
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { sentBy: { select: { name: true } } },
    }),
    db.emailDelivery.findMany({ where: { retryOfId: { not: null } }, select: { retryOfId: true, status: true } }),
  ]);
  const retriedOk = new Set(retried.filter((r) => EMAIL_STATUS_INFO[r.status].sent).map((r) => r.retryOfId));
  const customized = new Map(custom.map((c) => [c.key, c.updatedAt]));
  const s = smtpSettings();
  const problem = emailConfigProblem();
  const webhook = Boolean(env().RESEND_WEBHOOK_SECRET);

  return (
    <>
      <AdminHeader title="Email" description="Email settings, templates and a log of every email the system tried to send." />
      <Flash ok={sp.ok} error={sp.error} />

      <Panel title="Email settings" className="mt-6">
        <div
          className={`rounded-md border px-4 py-3 text-sm ${problem ? "border-amber-200 bg-amber-50 text-amber-950" : s.local ? "border-sky-200 bg-sky-50 text-sky-950" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}
        >
          {problem
            ? problem.message
            : s.local
              ? "Using the LOCAL TEST mail server. Emails are captured on this computer (open http://127.0.0.1:8025 to read them) and are NOT delivered to real inboxes."
              : `Sending through ${s.provider}. “Accepted by provider” means the provider took the message; “Delivered” appears only when the provider confirms it${webhook ? "" : " (delivery tracking is off until RESEND_WEBHOOK_SECRET is set)"}.`}
        </div>
        <dl className="mt-4 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          {[
            ["Provider", s.provider],
            ["Server", s.host ? `${s.host}:${s.port}` : "not set"],
            ["Secure connection (TLS)", s.secure ? "Yes (from the start)" : "STARTTLS / none"],
            ["Login user", s.user || "none"],
            ["Password / API key", s.hasPassword ? "set (hidden)" : "not set"],
            ["Sender (EMAIL_FROM)", s.from || "not set"],
            ["Delivery confirmation (webhook)", webhook ? "on" : "off"],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 border-b border-ink-100 py-1.5">
              <dt className="text-ink-600">{k}</dt>
              <dd className="text-right font-medium text-ink-900">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-ink-500">These values come from the server’s environment settings (.env). Secrets are never shown here.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <ActionForm action={checkEmailConnectionAction} submitLabel="Check connection" pendingLabel="Checking…" variant="secondary">
            <p className="text-sm text-ink-600">Connects and logs in to the email server. Sends nothing.</p>
          </ActionForm>
          <ActionForm action={sendTestToMeAction} submitLabel="Send a test email to me" pendingLabel="Sending…" variant="secondary">
            <p className="text-sm text-ink-600">Sends one short test message to {admin.email}.</p>
          </ActionForm>
        </div>
      </Panel>

      <Panel title="Templates" className="mt-6">
        <ul className="divide-y divide-ink-100">
          {TEMPLATE_KEYS.map((k) => (
            <li key={k} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className="font-medium text-ink-950">{TEMPLATES[k].label}</p>
                <p className="text-xs text-ink-600">
                  {TEMPLATES[k].description} {TEMPLATES[k].automatic ? "Sent automatically." : "Sent only by an administrator, after preview."}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {customized.has(k) ? <Badge tone="accent">Customized {fmtDate(customized.get(k))}</Badge> : <Badge>Default</Badge>}
                {can(admin.role, "email.templates") && (
                  <Link href={`/admin/email/${k}`} className="text-sm font-medium text-accent-700 hover:underline">
                    Edit
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
        {!can(admin.role, "email.templates") && <p className="mt-3 text-xs text-ink-500">Only the owner can edit template wording.</p>}
      </Panel>

      <div className="mt-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Delivery log (latest 100)</h2>
          <p className="text-sm text-ink-600">Every attempt is kept. A retry is added as a new row; the original row is not changed.</p>
        </div>
        <Link href={onlyProblems ? "/admin/email" : "/admin/email?filter=problems"} className="text-sm font-medium text-accent-700 hover:underline">
          {onlyProblems ? "Show all emails" : "Show only emails that were not delivered"}
        </Link>
      </div>
      <div className="mt-3">
        <Table head={["Time", "Recipient", "Email", "Status", "Details", ""]} empty={!deliveries.length && <Empty>No emails yet.</Empty>}>
          {deliveries.map((d) => {
            const info = EMAIL_STATUS_INFO[d.status];
            const canRetry = RETRYABLE.includes(d.status) && !retriedOk.has(d.id);
            return (
              <tr key={d.id} className="align-top">
                <td className="whitespace-nowrap px-4 py-3 text-ink-600">{fmtDate(d.createdAt, true)}</td>
                <td className="px-4 py-3">{d.to}</td>
                <td className="max-w-xs px-4 py-3">
                  <span className="block">{d.subject}</span>
                  <span className="block text-xs text-ink-500">
                    {d.templateKey ? (TEMPLATES[d.templateKey as keyof typeof TEMPLATES]?.label ?? d.templateKey) : "Custom"} · {d.sentBy?.name ?? "System"}
                    {d.retryOfId && " · retry"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <Badge tone={info.tone}>{info.label}</Badge>
                  {d.providerEvent && (
                    <span className="mt-1 block text-xs text-ink-500">
                      {d.providerEvent} {d.providerEventAt && fmtDate(d.providerEventAt, true)}
                    </span>
                  )}
                </td>
                <td className="max-w-sm break-words px-4 py-3 text-xs text-ink-600">{d.error ?? d.providerResponse ?? "—"}</td>
                <td className="px-4 py-3">
                  {canRetry && (
                    <details className="text-sm">
                      <summary className="cursor-pointer font-medium text-accent-700">Retry…</summary>
                      <form action={retryEmailAction} className="mt-2 w-56 space-y-2">
                        <input type="hidden" name="id" value={d.id} />
                        <label className="flex items-start gap-2 text-xs text-ink-700">
                          <input type="checkbox" name="confirm" className="mt-0.5" />
                          <span>Send again to {d.to}. {d.body ? "Same text as before." : "A new link is issued; the old one stops working."}</span>
                        </label>
                        <Button type="submit" size="sm">
                          Retry now
                        </Button>
                      </form>
                    </details>
                  )}
                  {RETRYABLE.includes(d.status) && retriedOk.has(d.id) && <span className="text-xs text-ink-500">Retried</span>}
                </td>
              </tr>
            );
          })}
        </Table>
      </div>
    </>
  );
}
