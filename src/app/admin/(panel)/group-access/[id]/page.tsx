import Link from "next/link";
import { notFound } from "next/navigation";
import type { GroupAccessScope } from "@prisma/client";
import { AdminHeader, Dl, Flash, Panel, fmtDate, smallInput, smallLabel } from "@/components/admin/ui";
import { Badge, buttonClass } from "@/components/ui/primitives";
import { requireAdmin } from "@/lib/auth/guard";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { readFlash } from "@/lib/flash";
import { REPORT_REASONS, RESEARCH_SECTIONS } from "@/lib/validation/community";
import { MAX_ACCESS_DAYS, SCOPE_LABELS, STATUS_TEXT, groupAccessHistory, investigationData, isActive } from "@/server/admin/group-access";
import { decideGroupAccessAction, revokeGroupAccessAction } from "../../../actions/group-access";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> };
export const dynamic = "force-dynamic";

const iso = (d: Date) => d.toISOString().slice(0, 16);

/**
 * One access request: the owner's decision form, the full history, and, for the administrator who was
 * granted access and only while it is active, a read-only view of the approved information. Every
 * page load of a section is authorized again and recorded (src/server/admin/group-access.ts).
 */
export default async function GroupAccessDetail({ params, searchParams }: Props) {
  const admin = await requireAdmin("group_access.request");
  const { id } = await params;
  const sp = await searchParams;
  const r = await db.groupAccessRequest.findUnique({
    where: { id },
    include: { group: { select: { name: true } }, requestedBy: { select: { id: true, name: true } }, decidedBy: { select: { name: true } }, revokedBy: { select: { name: true } }, report: true },
  });
  const isOwner = can(admin.role, "group_access.approve");
  if (!r || (!isOwner && r.requestedById !== admin.id)) notFound();
  const now = new Date();
  const active = isActive(r, now);
  const mine = r.requestedById === admin.id;
  const section = (sp.section as GroupAccessScope | undefined) ?? null;
  const data = mine && section && r.grantedScope.includes(section) ? await investigationData(admin.id, r.id, section) : null;
  const history = await groupAccessHistory(r.id);
  const statusText = r.status === "APPROVED" && r.expiresAt && r.expiresAt <= now ? "Expired" : active ? "Active now" : STATUS_TEXT[r.status];
  return (
    <>
      <p className="mb-4 text-sm">
        <Link href="/admin/group-access" className="text-accent-700 hover:underline">
          ← Group access
        </Link>
      </p>
      <AdminHeader title={`Access to “${r.group.name}”`} description={<Badge tone={active ? "success" : r.status === "PENDING" ? "warn" : "neutral"}>{statusText}</Badge>} />
      <Flash {...readFlash(sp)} />
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_24rem]">
        <div className="space-y-6">
          <Panel title="Request">
            <Dl
              items={[
                ["Administrator", r.requestedBy?.name ?? "former administrator"],
                ["Report", `${r.report.targetType.toLowerCase()} · ${REPORT_REASONS[r.report.reason]} · ${fmtDate(r.report.createdAt, true)} · ${r.report.reporterGroupMember ? "filed by a member of the group" : "not filed by a group member"}`],
                ["Reason", r.reason],
                ["Information asked for", r.requestedScope.map((s) => SCOPE_LABELS[s]).join("; ")],
                ["Duration asked for", `${r.requestedHours} hours`],
                ["Decision", r.decidedAt ? `${STATUS_TEXT[r.status === "PENDING" ? "PENDING" : r.status === "REJECTED" ? "REJECTED" : "APPROVED"]} by ${r.decidedBy?.name ?? "owner"} on ${fmtDate(r.decidedAt, true)}${r.decisionNote ? `: ${r.decisionNote}` : ""}` : "Not decided yet"],
                ["Information approved", r.grantedScope.length ? r.grantedScope.map((s) => SCOPE_LABELS[s]).join("; ") : "—"],
                ["Period (UTC)", r.startsAt && r.expiresAt ? `${fmtDate(r.startsAt, true)} – ${fmtDate(r.expiresAt, true)}` : "—"],
                ["Ended", r.revokedAt ? `Ended early by ${r.revokedBy?.name ?? "owner"} on ${fmtDate(r.revokedAt, true)}` : r.endedAt ? fmtDate(r.endedAt, true) : "—"],
              ]}
            />
          </Panel>
          {mine && r.grantedScope.length > 0 && (
            <Panel title="Investigation (read-only)">
              {!active ? (
                <p className="text-sm text-ink-700">This access is not active{r.startsAt && now < r.startsAt ? " yet" : ""}. Nothing can be viewed. A further look needs a new request and approval.</p>
              ) : (
                <>
                  <p className="text-sm text-ink-700">
                    Use this only for the reported matter. Every section you open is recorded. Access ends at {r.expiresAt ? fmtDate(r.expiresAt, true) : "—"}.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {r.grantedScope.map((s) => (
                      <Link key={s} href={`/admin/group-access/${r.id}?section=${s}`} className={buttonClass(section === s ? "primary" : "secondary", "sm")}>
                        {SCOPE_LABELS[s]}
                      </Link>
                    ))}
                  </div>
                </>
              )}
              {section && active && !data && <p className="mt-4 text-sm text-red-700">Not available.</p>}
              {data && <Section data={data} />}
            </Panel>
          )}
          <Panel title="History">
            <ul className="space-y-1 text-sm">
              {history.map((h) => (
                <li key={h.id} className="text-ink-700">
                  <span className="tabular-nums text-ink-500">{fmtDate(h.createdAt, true)}</span> · {h.action.replace("group_access.", "")} · {h.actor?.name ?? "system"}
                  {h.metadata && typeof h.metadata === "object" && "what" in (h.metadata as object) ? ` · ${String((h.metadata as { what: unknown }).what)}` : ""}
                </li>
              ))}
            </ul>
          </Panel>
        </div>
        <div className="space-y-6">
          {isOwner && r.status === "PENDING" && (
            <Panel title="Your decision (owner)">
              <form action={decideGroupAccessAction} className="space-y-3 text-sm">
                <input type="hidden" name="id" value={r.id} />
                <fieldset>
                  <legend className={smallLabel}>Information the administrator may see</legend>
                  {r.requestedScope.map((s) => (
                    <label key={s} className="flex items-center gap-2">
                      <input type="checkbox" name="scope" value={s} defaultChecked /> {SCOPE_LABELS[s]}
                    </label>
                  ))}
                </fieldset>
                <div>
                  <label htmlFor="startsAt" className={smallLabel}>
                    Start (UTC)
                  </label>
                  <input id="startsAt" name="startsAt" type="datetime-local" defaultValue={iso(now)} className={smallInput} />
                </div>
                <div>
                  <label htmlFor="expiresAt" className={smallLabel}>
                    End (UTC, required; at most {MAX_ACCESS_DAYS} days after the start)
                  </label>
                  <input id="expiresAt" name="expiresAt" type="datetime-local" className={smallInput} />
                </div>
                <div>
                  <label htmlFor="note" className={smallLabel}>
                    Note (required to reject)
                  </label>
                  <textarea id="note" name="note" rows={2} maxLength={2000} className={smallInput} />
                </div>
                <div className="flex gap-2">
                  <button name="decision" value="approve" className={buttonClass("primary", "sm")}>
                    Approve
                  </button>
                  <button name="decision" value="reject" className={buttonClass("secondary", "sm")}>
                    Reject
                  </button>
                </div>
              </form>
            </Panel>
          )}
          {isOwner && r.status === "APPROVED" && !(r.expiresAt && r.expiresAt <= now) && (
            <Panel title="End access now">
              <form action={revokeGroupAccessAction}>
                <input type="hidden" name="id" value={r.id} />
                <button className={buttonClass("secondary", "sm")}>End access now</button>
              </form>
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}

function Section({ data }: { data: NonNullable<Awaited<ReturnType<typeof investigationData>>> }) {
  const box = "mt-4 space-y-3 text-sm";
  switch (data.scope) {
    case "CHAT":
      return (
        <ul className={box}>
          {data.messages.map((m) => (
            <li key={m.id} className="border-b border-ink-100 pb-2">
              <span className="text-xs text-ink-500">
                {fmtDate(m.createdAt, true)} · {m.kind === "SYSTEM" ? "system" : (m.author?.profile?.displayName ?? "former member")}
                {m.editedAt ? " · edited" : ""}
              </span>
              <p className="whitespace-pre-wrap text-ink-900">{m.deletedAt ? <em>Message deleted</em> : m.body}</p>
              {m.attachments.map((a) => (
                <a key={a.id} href={`/api/files/${a.id}?download=1`} className="mr-2 text-accent-700 underline">
                  {a.originalName}
                </a>
              ))}
            </li>
          ))}
          {data.messages.length === 0 && <li className="text-ink-600">No messages.</li>}
        </ul>
      );
    case "RESEARCH":
      return (
        <div className={box}>
          {data.notes.map((n) => (
            <div key={n.id}>
              <p className="text-xs uppercase text-ink-500">{RESEARCH_SECTIONS[n.section].label}</p>
              <p className="font-medium">{n.title}</p>
              <p className="whitespace-pre-wrap text-ink-800">{n.body}</p>
            </div>
          ))}
          {data.links.map((l) => (
            <p key={l.id}>
              {l.title}: <span className="break-all text-ink-700">{l.url}</span>
            </p>
          ))}
          {data.notes.length + data.links.length === 0 && <p className="text-ink-600">Nothing recorded.</p>}
        </div>
      );
    case "FILES":
      return (
        <ul className={box}>
          {data.files.map((f) => (
            <li key={f.id}>
              <a href={`/api/files/${f.id}?download=1`} className="text-accent-700 underline">
                {f.originalName}
              </a>{" "}
              <span className="text-xs text-ink-500">{fmtDate(f.createdAt)}</span>
            </li>
          ))}
          {data.files.length === 0 && <li className="text-ink-600">No files.</li>}
        </ul>
      );
    case "TASKS_DECISIONS":
      return (
        <div className={box}>
          {data.tasks.map((t) => (
            <p key={t.id}>
              Task: {t.title} · {t.status.toLowerCase().replace("_", " ")}
            </p>
          ))}
          {data.decisions.map((d) => (
            <div key={d.id}>
              <p className="font-medium">Decision: {d.title}</p>
              <p className="whitespace-pre-wrap text-ink-800">{d.decision}</p>
            </div>
          ))}
          {data.tasks.length + data.decisions.length === 0 && <p className="text-ink-600">Nothing recorded.</p>}
        </div>
      );
    case "PROJECTS":
      return (
        <div className={box}>
          {data.projects.map((p) => (
            <div key={p.id} className="border-b border-ink-100 pb-3">
              <p className="font-medium">
                {p.name} · {p.status.toLowerCase().replace("_", " ")}
              </p>
              <p className="text-ink-700">{p.objective}</p>
              {p.versions.map((v) => (
                <details key={v.id} className="mt-2">
                  <summary className="cursor-pointer">
                    Agreement version {v.version} · {v.status.toLowerCase()} · {v.participants.map((x) => `${x.displayName}${x.acceptedAt ? " (accepted)" : x.declinedAt ? " (declined)" : ""}${x.withdrewAt ? " (left)" : ""}`).join(", ")}
                  </summary>
                  <pre className="mt-2 whitespace-pre-wrap rounded bg-ink-50 p-2 font-sans text-xs">{v.content}</pre>
                </details>
              ))}
            </div>
          ))}
          {data.projects.length === 0 && <p className="text-ink-600">No projects.</p>}
        </div>
      );
  }
}
