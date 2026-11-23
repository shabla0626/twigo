import Link from "next/link";
import { CheckList } from "@/components/site/blocks";
import { Card, Notice, PageHeader, Section, SectionHeading } from "@/components/ui/primitives";
import { brand } from "@/config/brand";
import { pageMetadata } from "@/lib/seo";
import { money, paymentsAvailable, publishedReports, type Totals } from "@/server/community-support";

export const metadata = pageMetadata("/support", "Community Support", "Voluntary support for running the community: optional, separate from project earnings, and reported openly.");
export const dynamic = "force-dynamic";

const fmt = (d: Date) => d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });

export default async function SupportPage() {
  const name = brand().name;
  const reports = await publishedReports();
  return (
    <>
      <PageHeader
        eyebrow={`${name} Community Support`}
        title="Voluntary support for the community"
        intro={`${name} is built around voluntary cooperation. Members and supporters who believe in the community may voluntarily contribute to its development and maintenance. Such support is entirely optional and is separate from all member-led project earnings.`}
      />
      <Section>
        <div className="grid gap-8 lg:grid-cols-2">
          <div>
            <SectionHeading eyebrow="Principles" title="Optional, separate, no privileges" />
            <div className="mt-6">
              <CheckList
                items={[
                  "Entirely voluntary. No amount is ever required.",
                  "Never a condition of membership.",
                  "Never a percentage of project revenue, and never deducted automatically.",
                  "No extra votes, rights, visibility or project priority for contributors.",
                  "Nobody is treated differently for not contributing.",
                  "Not described as tax-deductible, and no donation receipts, unless this is legally verified.",
                ]}
              />
            </div>
          </div>
          <div className="space-y-6">
            <Notice tone="warn" title="Online contributions are not available">
              {paymentsAvailable()
                ? "Online contributions are available."
                : `Payments will only be enabled after the legal recipient, the jurisdiction, the accounting arrangements and a payment provider are confirmed. Nobody is authorized to collect money in ${name}'s name until then. If someone asks you to pay, please report it.`}
            </Notice>
            <Card>
              <h2 className="text-base font-semibold text-ink-950">Read the policy</h2>
              <p className="mt-2 text-sm leading-6 text-ink-600">
                The full rules are in the{" "}
                <Link href="/legal/community-support" className="font-medium text-accent-700 underline underline-offset-2">
                  Community Support Policy
                </Link>
                .
              </p>
            </Card>
          </div>
        </div>
      </Section>
      <Section tone="gray" labelledBy="reports-heading">
        <SectionHeading id="reports-heading" eyebrow="Transparency" title="Reports" intro="Totals only. Contributors' identities and individual amounts are never published without their permission." />
        <div className="mt-8">
          {reports.length === 0 ? (
            <Notice>No support has been received and no report has been published yet.</Notice>
          ) : (
            <ul className="grid gap-4 md:grid-cols-2">
              {reports.map((r) => {
                const t = (r.totals ?? {}) as Partial<Totals>;
                return (
                  <li key={r.id} className="rounded-2xl border border-ink-100 bg-white p-5 shadow-soft">
                    <h3 className="font-semibold text-ink-950">{r.title}</h3>
                    <p className="text-sm text-ink-600">
                      {fmt(r.periodStart)} to {fmt(r.periodEnd)}
                    </p>
                    <dl className="mt-3 grid grid-cols-2 gap-1 text-sm">
                      <dt className="text-ink-600">Contributions received</dt>
                      <dd className="text-right">{money(t.contributions ?? 0, r.currency)}</dd>
                      <dt className="text-ink-600">Operating expenses</dt>
                      <dd className="text-right">{money(t.operating ?? 0, r.currency)}</dd>
                      <dt className="text-ink-600">Platform development</dt>
                      <dd className="text-right">{money(t.development ?? 0, r.currency)}</dd>
                      <dt className="text-ink-600">Other approved expenditure</dt>
                      <dd className="text-right">{money(t.other ?? 0, r.currency)}</dd>
                      <dt className="font-medium text-ink-900">Remaining balance</dt>
                      <dd className="text-right font-medium">{money(t.balance ?? 0, r.currency)}</dd>
                    </dl>
                    {r.note && <p className="mt-3 text-sm leading-6 text-ink-700">{r.note}</p>}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Section>
    </>
  );
}
