import Link from "next/link";
import { requireUser } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { AGREEMENT_STATUS_LABELS } from "@/server/community/group-projects";
import { STATUS_LABELS, acceptancesOf, shortFingerprint } from "@/server/legal";

export const metadata = { title: "Agreements" };

const METHOD: Record<string, string> = {
  registration: "When you created your account",
  activation: "When you activated your account",
  reacceptance: "After the document was updated",
  "group-join": "When you joined a group",
  "idea-support": "When you supported an idea",
};

/** Every document version this person accepted or acknowledged, with a link to that exact text. */
export default async function AgreementsPage() {
  const user = await requireUser("/account/agreements");
  const rows = await acceptancesOf(user.id);
  // Project agreements that list this person, also after they left the group (drafts are not agreements).
  const projectRows = await db.projectAgreementParticipant.findMany({
    where: { userId: user.id, version: { status: { not: "DRAFT" } } },
    orderBy: { version: { createdAt: "desc" } },
    take: 100,
    select: { id: true, acceptedAt: true, declinedAt: true, withdrewAt: true, version: { select: { id: true, version: true, status: true, project: { select: { name: true, group: { select: { name: true } } } } } } },
  });
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink-950">Agreements</h1>
        <p className="mt-1 text-sm leading-6 text-ink-600">
          Each document you accepted or acknowledged, with the exact version and its fingerprint. The link opens that version, even after a newer one exists.
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-2xl border border-ink-100 bg-white p-6 text-sm text-ink-600">
          No acceptance is recorded for your account yet. (Accounts created before versioned documents existed accepted the terms shown at that time.)
        </p>
      ) : (
        <ul className="divide-y divide-ink-100 overflow-hidden rounded-2xl border border-ink-100 bg-white">
          {rows.map((r) => (
            <li key={r.id} className="p-4 text-sm">
              <Link href={`/legal/${r.documentKey}/v/${r.version}`} className="font-medium text-accent-700 underline underline-offset-2">
                {r.legalVersion.document.title}, version {r.version}
              </Link>
              <p className="mt-1 text-ink-600">
                {r.kind === "ACCEPTED" ? "Accepted" : "Read and acknowledged"} · {METHOD[r.method] ?? r.method} ·{" "}
                {r.acceptedAt.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC
              </p>
              <p className="mt-0.5 text-xs text-ink-500">
                Fingerprint <span className="font-mono">{shortFingerprint(r.contentHash)}</span> · status of that version today: {STATUS_LABELS[r.legalVersion.status]}
              </p>
            </li>
          ))}
        </ul>
      )}
      <section aria-labelledby="project-agreements" className="space-y-3">
        <h2 id="project-agreements" className="text-lg font-semibold text-ink-950">Project agreements</h2>
        {projectRows.length === 0 ? (
          <p className="rounded-2xl border border-ink-100 bg-white p-6 text-sm text-ink-600">You are not listed in any project agreement.</p>
        ) : (
          <ul className="divide-y divide-ink-100 overflow-hidden rounded-2xl border border-ink-100 bg-white">
            {projectRows.map((p) => (
              <li key={p.id} className="p-4 text-sm">
                <a href={`/api/agreements/${p.version.id}`} className="font-medium text-accent-700 underline underline-offset-2">
                  {p.version.project.name} ({p.version.project.group.name}), version {p.version.version}
                </a>
                <p className="mt-1 text-ink-600">
                  {AGREEMENT_STATUS_LABELS[p.version.status]} ·{" "}
                  {p.acceptedAt ? "you accepted it" : p.declinedAt ? "you declined it" : "not answered"}
                  {p.withdrewAt ? " · you withdrew from the project" : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
