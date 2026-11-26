import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminHeader, Dl, Flash, Panel, fmtDate, smallInput, smallLabel } from "@/components/admin/ui";
import { Badge, buttonClass } from "@/components/ui/primitives";
import { requireAdmin } from "@/lib/auth/guard";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { EMAIL_STATUS_INFO } from "@/lib/email/status";
import { readFlash } from "@/lib/flash";
import { PRIVACY_REQUEST_KINDS, PRIVACY_REQUEST_STATUSES } from "@/lib/labels";
import { deletionExceptions, deletionPlan } from "@/server/privacy-deletion";
import { executeDeletionAction, legalHoldAction, privacyRequestStatusAction } from "../../../actions/twigo";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> };
export const dynamic = "force-dynamic";

const ACTION_LABEL = { delete: "Delete", anonymize: "Anonymize", end: "End", remove: "Remove (member asked)", keep: "Keep", "keep-necessary": "Keep only what is necessary", "backup-expiry": "Kept until backups expire" } as const;

/** One privacy request: verification, related groups and projects, the deletion plan, notes, history and execution. */
export default async function PrivacyRequestDetail({ params, searchParams }: Props) {
  const owner = await requireAdmin("privacy.requests");
  const isOwner = owner.role === "OWNER";
  const { id } = await params;
  const sp = await searchParams;
  const r = await db.privacyRequest.findUnique({ where: { id }, include: { user: { select: { id: true, name: true, status: true, erasedAt: true, role: true } }, handledBy: { select: { name: true } } } });
  if (!r) notFound();
  const deletion = r.kind === "DELETION";
  const live = deletion && r.user && !r.user.erasedAt;
  const [plan, groups, projects, history, email] = await Promise.all([
    live ? deletionPlan(r.user!.id, { removeIdeas: r.removeIdeas, removeComments: r.removeComments, removeChat: r.removeChat }) : Promise.resolve([]),
    live ? db.groupMembership.findMany({ where: { userId: r.user!.id, status: "ACTIVE" }, select: { role: true, group: { select: { name: true } } } }) : Promise.resolve([]),
    live ? db.projectAgreementParticipant.findMany({ where: { userId: r.user!.id }, distinct: ["versionId"], select: { version: { select: { status: true, version: true, project: { select: { name: true, status: true } } } } } }) : Promise.resolve([]),
    db.auditLog.findMany({ where: { entityType: "PrivacyRequest", entityId: r.id }, orderBy: { createdAt: "asc" }, include: { actor: { select: { name: true } } } }),
    r.completionEmailId ? db.emailDelivery.findUnique({ where: { id: r.completionEmailId }, select: { status: true, error: true, createdAt: true, providerEvent: true } }) : Promise.resolve(null),
  ]);
  const editable = r.status !== "COMPLETED" && r.status !== "PROCESSING";
  const exceptions = live ? await deletionExceptions(r.user!.id, r) : [];
  return (
    <>
      <p className="mb-4 text-sm">
        <Link href="/admin/privacy-requests" className="text-accent-700 hover:underline">
          ← Privacy requests
        </Link>
      </p>
      <AdminHeader title={`${PRIVACY_REQUEST_KINDS[r.kind]} · ${r.email}`} description={<Badge tone={r.status === "COMPLETED" ? "success" : r.status === "REJECTED" ? "neutral" : "warn"}>{PRIVACY_REQUEST_STATUSES[r.status]}</Badge>} />
      <Flash {...readFlash(sp)} />
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_24rem]">
        <div className="space-y-6">
          <Panel title="Request">
            <Dl
              items={[
                ["Request id", r.id],
                ["Member", r.user ? `${r.user.erasedAt ? "Erased account" : r.user.name} (${r.user.erasedAt ? "erased" : r.user.status.toLowerCase()})` : "account no longer linked"],
                ["Received", fmtDate(r.createdAt, true)],
                ["Requested", deletion ? "Deletion of the account and personal data" : PRIVACY_REQUEST_KINDS[r.kind]],
                ...(deletion
                  ? ([["Member’s choice for their content", [r.removeIdeas && "remove ideas without a group", r.removeComments && "remove comments, discussions, field notes, discussion pieces, project channels and cultural installments", r.removeChat && "remove chat messages"].filter(Boolean).join("; ") || "keep (shown without the name)"]] as [string, string][])
                  : []),
                ...(r.legalHold ? ([["Legal hold", r.legalHoldReason ?? "set"]] as [string, string][]) : []),
                ["Identity verification", r.verifiedAt ? `Verified by ${r.verificationMethod} on ${fmtDate(r.verifiedAt, true)}` : "Not verified through the deletion flow"],
                ["Member’s text", r.details],
                ["Answer shown to the member", r.response ?? "—"],
                ["Completed", r.completedAt ? fmtDate(r.completedAt, true) : "—"],
                [
                  "Completion notice",
                  email ? `${EMAIL_STATUS_INFO[email.status].label}${email.error ? `: ${email.error}` : ""} (${fmtDate(email.createdAt, true)})${email.providerEvent ? ` · provider event: ${email.providerEvent}` : ""}` : r.completedAt && deletion ? "Not sent" : "—",
                ],
              ]}
            />
          </Panel>
          {live && (
            <Panel title="Related groups and projects">
              <p className="text-sm text-ink-700">
                Groups: {groups.length ? groups.map((g) => `${g.group.name}${g.role === "COORDINATOR" ? " (coordinator)" : ""}`).join("; ") : "none"}
              </p>
              <p className="mt-1 text-sm text-ink-700">
                Project agreements: {projects.length ? projects.map((p) => `${p.version.project.name} v${p.version.version} (${p.version.status.toLowerCase()})`).join("; ") : "none"}
              </p>
              <p className="mt-2 text-xs text-ink-500">Names only; no private group content is shown here.</p>
            </Panel>
          )}
          {live && (
            <Panel title="What deletion would do (retention considerations)">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-ink-500">
                    <th className="py-1 pr-2">Category</th>
                    <th className="py-1 pr-2">Count</th>
                    <th className="py-1 pr-2">Action</th>
                    <th className="py-1">Why</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.map((p) => (
                    <tr key={p.category} className="border-t border-ink-100 align-top">
                      <td className="py-2 pr-2 font-medium">{p.category}</td>
                      <td className="py-2 pr-2 tabular-nums">{p.category === "Backups" ? "—" : p.count}</td>
                      <td className="py-2 pr-2">
                        <Badge tone={p.action === "keep-necessary" ? "warn" : p.action === "delete" || p.action === "anonymize" || p.action === "remove" ? "danger" : "neutral"}>{ACTION_LABEL[p.action]}</Badge>
                      </td>
                      <td className="py-2 text-ink-700">{p.explanation}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          )}
          <Panel title="Processing history">
            <ul className="space-y-1 text-sm text-ink-700">
              {history.map((h) => (
                <li key={h.id}>
                  <span className="tabular-nums text-ink-500">{fmtDate(h.createdAt, true)}</span> · {h.action.replace("privacy.", "")} · {h.actor?.name ?? "system"}
                </li>
              ))}
            </ul>
          </Panel>
        </div>
        <div className="space-y-6">
          {editable && (
            <Panel title="Status and notes">
              <form action={privacyRequestStatusAction} className="space-y-3 text-sm">
                <input type="hidden" name="id" value={r.id} />
                <input type="hidden" name="back" value="detail" />
                <div>
                  <label htmlFor="status" className={smallLabel}>
                    Status
                  </label>
                  <select id="status" name="status" defaultValue={r.status} className={smallInput}>
                    {Object.entries(PRIVACY_REQUEST_STATUSES)
                      .filter(([k]) => k !== "PROCESSING" && (deletion ? k !== "COMPLETED" : k !== "APPROVED_FOR_DELETION"))
                      .map(([k, l]) => (
                        <option key={k} value={k}>
                          {l}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="response" className={smallLabel}>
                    Message to the member (shown on their Privacy & data page)
                  </label>
                  <textarea id="response" name="response" rows={3} defaultValue={r.response ?? ""} maxLength={2000} className={smallInput} />
                </div>
                <div>
                  <label htmlFor="adminNotes" className={smallLabel}>
                    Private notes (not shown to the member)
                  </label>
                  <textarea id="adminNotes" name="adminNotes" rows={3} defaultValue={r.adminNotes ?? ""} maxLength={4000} className={smallInput} />
                </div>
                <button className={buttonClass("secondary", "sm")}>Save</button>
              </form>
            </Panel>
          )}
          {deletion && live && exceptions.length > 0 && (
            <Panel title="Needs the owner">
              <ul className="list-disc space-y-1 pl-5 text-sm text-ink-800">
                {exceptions.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
              {!isOwner && <p className="mt-2 text-xs text-ink-600">Administrators cannot carry out this request. The owner decides.</p>}
            </Panel>
          )}
          {deletion && live && isOwner && (
            <Panel title="Legal hold (owner)">
              <form action={legalHoldAction} className="space-y-2 text-sm">
                <input type="hidden" name="id" value={r.id} />
                {r.legalHold ? (
                  <button name="hold" value="clear" className={buttonClass("secondary", "sm")}>
                    Clear the legal hold
                  </button>
                ) : (
                  <>
                    <label htmlFor="reason" className={smallLabel}>
                      Reason (for example legal retention, a dispute, evidence)
                    </label>
                    <input id="reason" name="reason" className={smallInput} maxLength={500} />
                    <button name="hold" value="set" className={buttonClass("secondary", "sm")}>
                      Set a legal hold
                    </button>
                  </>
                )}
              </form>
            </Panel>
          )}
          {deletion && r.status === "APPROVED_FOR_DELETION" && live && can(owner.role, "privacy.erase") && !r.legalHold && (isOwner || exceptions.length === 0) && (
            <Panel title="Carry out the deletion">
              <form action={executeDeletionAction} className="space-y-3 text-sm">
                <input type="hidden" name="id" value={r.id} />
                <p className="text-ink-700">
                  This applies the plan on the left in one step and cannot be undone. It is first written to the erasure record, so restoring an older backup
                  re-applies it. Content removal follows the member’s own choice. You will be asked to confirm your identity if you have not done so in the
                  last minutes.
                </p>
                <div>
                  <label htmlFor="phrase" className={smallLabel}>
                    Type ERASE to confirm
                  </label>
                  <input id="phrase" name="phrase" autoComplete="off" required className={`${smallInput} max-w-40`} />
                </div>
                <button className={buttonClass("danger", "sm")}>Erase account and personal data</button>
              </form>
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
