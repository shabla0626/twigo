import { ActionForm } from "@/components/forms/action-form";
import { AdminHeader, Empty, Flash, Panel, Table, fmtDate, smallInput, smallLabel } from "@/components/admin/ui";
import { Badge, buttonClass } from "@/components/ui/primitives";
import { requireAdmin } from "@/lib/auth/guard";
import { readFlash } from "@/lib/flash";
import { ENTRY_KINDS, money, ownerOverview, paymentsSwitch, type Totals } from "@/server/community-support";
import { addSupportEntryAction, createSupportReportAction, publishSupportReportAction } from "../../actions/twigo";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function AdminSupportPage({ searchParams }: Props) {
  await requireAdmin("support.manage");
  const { entries, reports } = await ownerOverview();
  return (
    <>
      <AdminHeader
        title="Community support"
        description="Private records of voluntary support and its use, and the aggregate reports you publish. Support is never linked to projects or to anyone's rights."
      />
      <Flash {...readFlash(await searchParams)} />
      <p className="mt-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        Online payments: <strong>not available</strong>. No payment provider is integrated
        {paymentsSwitch() ? " (the SUPPORT_PAYMENTS_ENABLED switch is on, but it cannot enable payments by itself)" : " (the SUPPORT_PAYMENTS_ENABLED switch is off)"}. Activate only after the legal
        recipient, jurisdiction, accounting arrangements and a provider are confirmed.
      </p>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Panel title="Record an entry">
          <ActionForm action={addSupportEntryAction} submitLabel="Record entry" resetOnSuccess>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="kind" className={smallLabel}>
                  Kind
                </label>
                <select id="kind" name="kind" className={smallInput}>
                  {Object.entries(ENTRY_KINDS).map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="occurredOn" className={smallLabel}>
                  Date
                </label>
                <input id="occurredOn" name="occurredOn" type="date" required className={smallInput} />
              </div>
              <div>
                <label htmlFor="amount" className={smallLabel}>
                  Amount
                </label>
                <input id="amount" name="amount" inputMode="decimal" required className={smallInput} />
              </div>
              <div>
                <label htmlFor="currency" className={smallLabel}>
                  Currency
                </label>
                <input id="currency" name="currency" defaultValue="USD" maxLength={3} required className={smallInput} />
              </div>
            </div>
            <div>
              <label htmlFor="description" className={smallLabel}>
                Description
              </label>
              <input id="description" name="description" required maxLength={300} className={smallInput} />
            </div>
            <div>
              <label htmlFor="contributorName" className={smallLabel}>
                Contributor (private, optional)
              </label>
              <input id="contributorName" name="contributorName" maxLength={120} className={smallInput} />
            </div>
          </ActionForm>
        </Panel>
        <Panel title="Create a report">
          <ActionForm action={createSupportReportAction} submitLabel="Create report" resetOnSuccess>
            <div>
              <label htmlFor="title" className={smallLabel}>
                Title
              </label>
              <input id="title" name="title" required maxLength={120} className={smallInput} />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label htmlFor="periodStart" className={smallLabel}>
                  From
                </label>
                <input id="periodStart" name="periodStart" type="date" required className={smallInput} />
              </div>
              <div>
                <label htmlFor="periodEnd" className={smallLabel}>
                  To
                </label>
                <input id="periodEnd" name="periodEnd" type="date" required className={smallInput} />
              </div>
              <div>
                <label htmlFor="r-currency" className={smallLabel}>
                  Currency
                </label>
                <input id="r-currency" name="currency" defaultValue="USD" maxLength={3} required className={smallInput} />
              </div>
            </div>
            <div>
              <label htmlFor="note" className={smallLabel}>
                Public note (optional)
              </label>
              <textarea id="note" name="note" rows={2} maxLength={2000} className={smallInput} />
            </div>
          </ActionForm>
        </Panel>
      </div>
      <Panel title="Reports" className="mt-6">
        {reports.length === 0 ? (
          <Empty>No reports yet.</Empty>
        ) : (
          <ul className="divide-y divide-ink-100 text-sm">
            {reports.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <span>
                  <strong>{r.title}</strong> · {fmtDate(r.periodStart)} to {fmtDate(r.periodEnd)} · {r.currency}{" "}
                  {r.published ? (
                    <Badge tone="success">Published · balance {money(((r.totals ?? {}) as Partial<Totals>).balance ?? 0, r.currency)}</Badge>
                  ) : (
                    <Badge tone="warn">Not published</Badge>
                  )}
                </span>
                {!r.published && (
                  <form action={publishSupportReportAction} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={r.id} />
                    <label className="flex items-center gap-1 text-xs text-ink-700">
                      <input type="checkbox" name="confirm" /> Figures are final
                    </label>
                    <button type="submit" className={buttonClass("secondary", "sm")}>
                      Publish
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <div className="mt-6">
        <Table head={["Date", "Kind", "Amount", "Description", "Contributor (private)"]} empty={entries.length === 0 ? <Empty>No entries recorded.</Empty> : undefined}>
          {entries.map((e) => (
            <tr key={e.id}>
              <td className="whitespace-nowrap px-4 py-2.5">{fmtDate(e.occurredOn)}</td>
              <td className="px-4 py-2.5">{ENTRY_KINDS[e.kind]}</td>
              <td className="px-4 py-2.5 tabular-nums">{money(e.amountMinor, e.currency)}</td>
              <td className="px-4 py-2.5">{e.description}</td>
              <td className="px-4 py-2.5 text-ink-600">{e.contributorName ?? "—"}</td>
            </tr>
          ))}
        </Table>
      </div>
    </>
  );
}
