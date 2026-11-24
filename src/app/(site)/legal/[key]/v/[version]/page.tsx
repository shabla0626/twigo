import Link from "next/link";
import { notFound } from "next/navigation";
import { DocumentBody, DocumentFacts, StatusNotice } from "@/components/legal/document-view";
import { PageHeader, Section } from "@/components/ui/primitives";
import { isLegalKey } from "@/content/legal";
import { displayedVersion, publicVersion } from "@/server/legal";

type Props = { params: Promise<{ key: string; version: string }> };
export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

/** A specific version of a document: the exact text someone accepted, with its status today. */
export default async function LegalVersionPage({ params }: Props) {
  const { key, version } = await params;
  const found = await publicVersion(key, Number(version));
  if (!found || !isLegalKey(key)) notFound();
  const current = await displayedVersion(key);
  return (
    <>
      <PageHeader eyebrow="Legal · earlier or specific version" title={`${found.doc.title}, version ${found.version.version}`} />
      <Section tone="gray">
        <article className="mx-auto max-w-3xl rounded-3xl border border-ink-100 bg-white p-6 shadow-soft sm:p-10">
          <StatusNotice version={found.version} docKey={key} latestVersion={current?.version.version} />
          <DocumentFacts version={found.version} />
          <p className="mt-4 break-all font-mono text-xs text-ink-500">Full fingerprint: {found.version.contentHash}</p>
          <DocumentBody content={found.version.content} />
          <p className="mt-10 text-sm">
            <Link href={`/legal/${key}`} className="font-medium text-accent-700 underline underline-offset-2">
              Current version
            </Link>
          </p>
        </article>
      </Section>
    </>
  );
}
