import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DocumentBody, DocumentFacts, StatusNotice } from "@/components/legal/document-view";
import { PageHeader, Section } from "@/components/ui/primitives";
import { isLegalKey, legalDefinition } from "@/content/legal";
import { pageMetadata } from "@/lib/seo";
import { STATUS_LABELS, displayedVersion, publicHistory } from "@/server/legal";

type Props = { params: Promise<{ key: string }> };
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { key } = await params;
  if (!isLegalKey(key)) return {};
  const def = legalDefinition(key);
  return pageMetadata(`/legal/${key}`, def.title, def.summary);
}

export default async function LegalDocumentPage({ params }: Props) {
  const { key } = await params;
  if (!isLegalKey(key)) notFound();
  const shown = await displayedVersion(key);
  if (!shown) notFound();
  const history = await publicHistory(key);
  return (
    <>
      <PageHeader eyebrow="Legal" title={shown.doc.title} intro={shown.doc.summary} />
      <Section tone="gray">
        <article className="mx-auto max-w-3xl rounded-3xl border border-ink-100 bg-white p-6 shadow-soft sm:p-10">
          {/* The visible status always matches the stored one: a text awaiting review says so. */}
          <StatusNotice version={shown.version} docKey={key} />
          <DocumentFacts version={shown.version} />
          <DocumentBody content={shown.version.content} />
          <section aria-labelledby="history-h" className="mt-12 border-t border-ink-100 pt-6">
            <h2 id="history-h" className="text-base font-semibold text-ink-950">
              All versions
            </h2>
            <ul className="mt-3 space-y-1 text-sm">
              {history.map((h) => (
                <li key={h.version}>
                  <Link href={`/legal/${key}/v/${h.version}`} className="text-accent-700 underline underline-offset-2">
                    Version {h.version}
                  </Link>{" "}
                  <span className="text-ink-600">· {STATUS_LABELS[h.status]}</span>
                  {h.changeSummary && <span className="text-ink-600"> · {h.changeSummary}</span>}
                </li>
              ))}
            </ul>
          </section>
        </article>
      </Section>
    </>
  );
}
