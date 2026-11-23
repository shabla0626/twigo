import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/forms/action-form";
import { AdminHeader, Flash, Panel, fmtDate, smallInput, smallLabel } from "@/components/admin/ui";
import { LegalText } from "@/components/legal/legal-text";
import { Badge, buttonClass } from "@/components/ui/primitives";
import { isLegalKey } from "@/content/legal";
import { requireAdmin } from "@/lib/auth/guard";
import { db } from "@/lib/db";
import { readFlash } from "@/lib/flash";
import { STATUS_LABELS, ensureLegalDocuments } from "@/server/legal";
import { legalStatusAction, newDraftAction, saveDraftTextAction } from "../../../actions/twigo";

type Props = { params: Promise<{ key: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function AdminLegalDocumentPage({ params, searchParams }: Props) {
  await requireAdmin("legal.manage");
  const { key } = await params;
  if (!isLegalKey(key)) notFound();
  await ensureLegalDocuments();
  const doc = await db.legalDocument.findUniqueOrThrow({
    where: { key },
    include: { versions: { orderBy: { version: "desc" }, include: { _count: { select: { acceptances: true } } } } },
  });
  const draft = doc.versions.find((v) => v.status === "DRAFT");
  return (
    <>
      <p className="text-sm">
        <Link href="/admin/legal" className="text-accent-700 underline underline-offset-2">
          ← Legal documents
        </Link>
      </p>
      <AdminHeader
        title={doc.title}
        description={doc.summary}
        actions={
          !draft && (
            <form action={newDraftAction}>
              <input type="hidden" name="key" value={key} />
              <button type="submit" className={buttonClass("secondary", "sm")}>
                Start a new version
              </button>
            </form>
          )
        }
      />
      <Flash {...readFlash(await searchParams)} />
      {draft && (
        <Panel title={`Edit draft: version ${draft.version}`} className="mt-6">
          <ActionForm action={saveDraftTextAction} submitLabel="Save draft">
            <input type="hidden" name="versionId" value={draft.id} />
            <div>
              <label htmlFor="content" className={smallLabel}>
                Text (headings start with ##, list items with -; links as [text](/path); no bracketed placeholders)
              </label>
              <textarea id="content" name="content" defaultValue={draft.content} rows={22} className={`${smallInput} font-mono`} />
            </div>
            <div>
              <label htmlFor="changeSummary" className={smallLabel}>
                What changed
              </label>
              <input id="changeSummary" name="changeSummary" defaultValue={draft.changeSummary ?? ""} maxLength={500} className={smallInput} />
            </div>
            <label className="flex items-start gap-2 text-sm text-ink-700">
              <input type="checkbox" name="materialChange" defaultChecked={draft.materialChange} className="mt-1" />
              <span>This is a material change (it changes people&apos;s rights or obligations).</span>
            </label>
            <label className="flex items-start gap-2 text-sm text-ink-700">
              <input type="checkbox" name="requiresReacceptance" defaultChecked={draft.requiresReacceptance} className="mt-1" />
              <span>When published, everyone who accepted an earlier version must accept this one before continuing (only for material changes of the Terms, Guidelines or Privacy Policy).</span>
            </label>
          </ActionForm>
          <form action={legalStatusAction} className="mt-4 border-t border-ink-100 pt-4">
            <input type="hidden" name="key" value={key} />
            <input type="hidden" name="versionId" value={draft.id} />
            <input type="hidden" name="to" value="PENDING_LEGAL_REVIEW" />
            <button type="submit" className={buttonClass("primary", "sm")}>
              Send for legal review
            </button>
            <span className="ml-3 text-xs text-ink-500">The text is then frozen; people may be shown it as a draft awaiting review.</span>
          </form>
        </Panel>
      )}
      <div className="mt-6 space-y-4">
        {doc.versions.map((v) => (
          <Panel key={v.id} title={`Version ${v.version}`}>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge tone={v.status === "PUBLISHED" ? "success" : v.status === "SUPERSEDED" ? "neutral" : "warn"}>{STATUS_LABELS[v.status]}</Badge>
              <span className="text-ink-600">
                created {fmtDate(v.createdAt)} · {v._count.acceptances} acceptance(s) · fingerprint <span className="font-mono text-xs">{v.contentHash}</span>
              </span>
            </div>
            {v.changeSummary && <p className="mt-2 text-sm text-ink-700">What changed: {v.changeSummary}</p>}
            {v.approvalNote && <p className="mt-2 text-sm text-ink-700">Approval note: {v.approvalNote}</p>}
            {v.materialChange && <p className="mt-1 text-xs text-ink-500">Material change{v.requiresReacceptance ? "; asks for renewed acceptance when published" : ""}.</p>}
            {v.status === "PENDING_LEGAL_REVIEW" && (
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <form action={legalStatusAction} className="space-y-2 rounded-lg border border-ink-200 p-3">
                  <input type="hidden" name="key" value={key} />
                  <input type="hidden" name="versionId" value={v.id} />
                  <input type="hidden" name="to" value="APPROVED" />
                  <label className="flex items-start gap-2 text-sm text-ink-700">
                    <input type="checkbox" name="reviewed" className="mt-1" />
                    <span>A qualified lawyer reviewed this exact version (fingerprint above).</span>
                  </label>
                  <label htmlFor={`note-${v.id}`} className={smallLabel}>
                    Who reviewed it, and when
                  </label>
                  <input id={`note-${v.id}`} name="approvalNote" minLength={10} maxLength={1000} className={smallInput} />
                  <button type="submit" className={buttonClass("secondary", "sm")}>
                    Mark approved
                  </button>
                </form>
                {v._count.acceptances === 0 && (
                  <form action={legalStatusAction} className="rounded-lg border border-ink-200 p-3">
                    <input type="hidden" name="key" value={key} />
                    <input type="hidden" name="versionId" value={v.id} />
                    <input type="hidden" name="to" value="DRAFT" />
                    <button type="submit" className={buttonClass("ghost", "sm")}>
                      Return to draft
                    </button>
                    <p className="mt-1 text-xs text-ink-500">Possible only while nobody has accepted this text.</p>
                  </form>
                )}
              </div>
            )}
            {v.status === "APPROVED" && (
              <form action={legalStatusAction} className="mt-4 flex flex-wrap items-end gap-3 rounded-lg border border-ink-200 p-3">
                <input type="hidden" name="key" value={key} />
                <input type="hidden" name="versionId" value={v.id} />
                <input type="hidden" name="to" value="PUBLISHED" />
                <div>
                  <label htmlFor={`eff-${v.id}`} className={smallLabel}>
                    Effective date
                  </label>
                  <input id={`eff-${v.id}`} name="effectiveDate" type="date" className={smallInput} />
                </div>
                <button type="submit" className={buttonClass("primary", "sm")}>
                  Publish
                </button>
                <span className="text-xs text-ink-500">The currently published version becomes superseded.</span>
              </form>
            )}
            <details className="mt-4">
              <summary className="cursor-pointer text-sm font-medium text-accent-700">Read this version</summary>
              <div className="mt-3 rounded-lg border border-ink-100 bg-white p-4">
                <LegalText source={v.content} />
              </div>
            </details>
          </Panel>
        ))}
      </div>
    </>
  );
}
