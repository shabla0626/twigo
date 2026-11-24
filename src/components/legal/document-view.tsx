import Link from "next/link";
import type { LegalDocumentVersion } from "@prisma/client";
import { Notice } from "@/components/ui/primitives";
import { brand } from "@/config/brand";
import { shortFingerprint } from "@/server/legal";
import { LegalText } from "./legal-text";

const fmt = (d: Date | null | undefined) => (d ? d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }) : null);

/** Says plainly what state a version is in. A draft is never presented as reviewed or in force. */
export function StatusNotice({ version, docKey, latestVersion }: { version: Pick<LegalDocumentVersion, "status" | "version" | "effectiveDate"> & { publishedAt?: Date | null }; docKey: string; latestVersion?: number }) {
  const name = brand().name;
  if (version.status === "PUBLISHED")
    return (
      <Notice title={`In force since ${fmt(version.effectiveDate) ?? "publication"}`}>
        This is the published version {version.version}. Earlier versions remain available below.
      </Notice>
    );
  if (version.status === "SUPERSEDED")
    return (
      <Notice tone="warn" title={version.publishedAt ? `Version ${version.version} is no longer in force` : `Version ${version.version} was replaced`}>
        {version.publishedAt ? "It was replaced by a newer version." : "This version was never published. A newer version replaced it."}{" "}
        <Link href={`/legal/${docKey}`} className="font-medium underline underline-offset-2">
          Read the current version
        </Link>
        {latestVersion ? ` (version ${latestVersion})` : ""}.
      </Notice>
    );
  if (version.status === "APPROVED")
    return (
      <Notice tone="warn" title="Approved, not yet published">
        This version has been approved but is not yet in force. It will apply from the effective date shown here once it is published.
      </Notice>
    );
  return (
    <Notice tone="warn" title="Draft awaiting legal review">
      This text describes the rules {name} applies today. It has not been approved and published after legal review, it is not claimed to be legally sufficient or
      enforceable in any jurisdiction, and details that are not yet decided (such as the legal operator and the governing law) are stated as
      undecided. A reviewed version will be published here with its effective date.
    </Notice>
  );
}

export function DocumentFacts({ version }: { version: Pick<LegalDocumentVersion, "version" | "contentHash" | "createdAt" | "effectiveDate" | "status"> }) {
  return (
    <dl className="mt-6 grid gap-x-6 gap-y-2 rounded-2xl bg-ink-50 p-4 text-sm sm:grid-cols-3">
      <div>
        <dt className="text-ink-500">Version</dt>
        <dd className="font-medium text-ink-900">{version.version}</dd>
      </div>
      <div>
        <dt className="text-ink-500">{version.effectiveDate ? "Effective" : "Prepared"}</dt>
        <dd className="font-medium text-ink-900">{fmt(version.effectiveDate ?? version.createdAt)}</dd>
      </div>
      <div>
        <dt className="text-ink-500">Fingerprint (SHA-256)</dt>
        <dd className="font-mono text-ink-900" title={version.contentHash}>
          {shortFingerprint(version.contentHash)}
        </dd>
      </div>
    </dl>
  );
}

export function DocumentBody({ content }: { content: string }) {
  return <LegalText source={content} />;
}
