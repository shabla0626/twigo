import { Notice, PageHeader, Section } from "@/components/ui/primitives";
import { brand } from "@/config/brand";
import { pageMetadata } from "@/lib/seo";
import { publicNotices } from "@/server/legal-notices";

export const metadata = pageMetadata("/legal/notices", "Legal notices", "Who operates the community and under which law, as far as this has been confirmed.");
export const dynamic = "force-dynamic";

export default async function LegalNoticesPage() {
  const rows = await publicNotices();
  const name = brand().name;
  const anyConfirmed = rows.some((r) => r.value);
  return (
    <>
      <PageHeader eyebrow="Legal" title="Legal notices" intro={`${name} is currently a brand and an online collaborative community. It is not described here as a registered company, cooperative or nonprofit, because no such status has been confirmed.`} />
      <Section tone="gray">
        <div className="mx-auto max-w-3xl rounded-3xl border border-ink-100 bg-white p-6 shadow-soft sm:p-10">
          {!anyConfirmed && (
            <Notice tone="warn" title="Not yet confirmed">
              The legal operator, its legal form and the governing law have not yet been formally confirmed. They will be shown here once they are.
              Nothing below is a placeholder for invented information.
            </Notice>
          )}
          <dl className="mt-6 divide-y divide-ink-100">
            {rows.map((r) => (
              <div key={r.key} className="grid gap-1 py-3 sm:grid-cols-[14rem_1fr]">
                <dt className="text-sm font-medium text-ink-600">{r.label}</dt>
                <dd className={r.value ? "text-ink-950" : "text-ink-500"}>{r.value ?? "Not yet confirmed"}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Section>
    </>
  );
}
