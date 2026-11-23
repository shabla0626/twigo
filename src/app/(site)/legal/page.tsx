import Link from "next/link";
import { Badge, PageHeader, Section } from "@/components/ui/primitives";
import { brand } from "@/config/brand";
import { pageMetadata } from "@/lib/seo";
import { STATUS_LABELS, legalIndex } from "@/server/legal";

export const metadata = pageMetadata("/legal", "Policies and legal notices", "Every policy of the community, its current version and status, and the legal notices.");
export const dynamic = "force-dynamic";

const WHERE = {
  "registration-accept": "Accepted when you create an account",
  "registration-ack": "Acknowledged when you create an account",
  group: "Accepted when you join or help found a group",
  none: "Part of the Terms of Use by reference",
} as const;

export default async function LegalIndexPage() {
  const docs = await legalIndex();
  return (
    <>
      <PageHeader
        eyebrow="Legal"
        title="Policies and legal notices"
        intro={`Every document that governs ${brand().name}, with its version and status. Every version is kept, so you can always read the text you accepted.`}
      />
      <Section tone="gray">
        <ul className="mx-auto grid max-w-4xl gap-4">
          {docs.map((d) => (
            <li key={d.key} className="rounded-2xl border border-ink-100 bg-white p-5 shadow-soft">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Link href={`/legal/${d.key}`} className="text-lg font-semibold text-ink-950 underline-offset-2 hover:underline">
                  {d.title}
                </Link>
                <Badge tone={d.version.status === "PUBLISHED" ? "success" : "warn"}>
                  Version {d.version.version} · {STATUS_LABELS[d.version.status]}
                </Badge>
              </div>
              <p className="mt-2 text-sm leading-6 text-ink-700">{d.summary}</p>
              <p className="mt-1 text-xs text-ink-500">{WHERE[d.acceptance]}</p>
            </li>
          ))}
          <li className="rounded-2xl border border-ink-100 bg-white p-5 shadow-soft">
            <Link href="/legal/notices" className="text-lg font-semibold text-ink-950 underline-offset-2 hover:underline">
              Legal notices
            </Link>
            <p className="mt-2 text-sm leading-6 text-ink-700">Who operates {brand().name}, where, and under which law, as far as this has been confirmed.</p>
          </li>
        </ul>
      </Section>
    </>
  );
}
