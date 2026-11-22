import { Time } from "./ui";

type Revision = {
  id: string;
  kind: "MINOR" | "MATERIAL";
  before: unknown;
  changedFields: string[];
  supportersBefore: number;
  supportReset: boolean;
  createdAt: Date;
  editor: { profile: { displayName: string } | null } | null;
};

function shown(value: unknown): string {
  if (Array.isArray(value)) return value.join("\n");
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

/**
 * The history of an idea: every change, who made it, and what the changed parts
 * said before. Members can always see what an idea said when people supported it.
 */
export function IdeaHistory({ revisions, fieldLabels, categoryLabels }: { revisions: Revision[]; fieldLabels: Record<string, string>; categoryLabels: Record<string, string> }) {
  if (!revisions.length) return null;
  return (
    <details id="history" className="mt-6 rounded-xl border border-ink-100 bg-ink-50 p-4">
      <summary className="cursor-pointer text-sm font-semibold text-ink-900">
        Changed {revisions.length} time{revisions.length === 1 ? "" : "s"} · see what changed
      </summary>
      <ol className="mt-4 space-y-5">
        {revisions.map((r) => {
          const before = (r.before ?? {}) as Record<string, unknown>;
          return (
            <li key={r.id} className="border-t border-ink-200 pt-4 first:border-t-0 first:pt-0">
              <p className="text-sm text-ink-800">
                <span className={`mr-2 rounded px-1.5 py-0.5 text-xs font-semibold ${r.kind === "MATERIAL" ? "bg-amber-100 text-amber-900" : "bg-ink-200 text-ink-800"}`}>
                  {r.kind === "MATERIAL" ? "Material change" : "Minor correction"}
                </span>
                <Time date={r.createdAt} /> by {r.editor?.profile?.displayName ?? "the author"}
              </p>
              <p className="mt-1 text-xs text-ink-600">
                {r.supportReset
                  ? `Support was reset: the ${r.supportersBefore} supporter${r.supportersBefore === 1 ? "" : "s"} at that time were asked to look at the new version.`
                  : r.supportersBefore > 0
                    ? `The ${r.supportersBefore} supporter${r.supportersBefore === 1 ? " was" : "s were"} told about this correction; their support was kept.`
                    : "Nobody supported the idea yet at that time."}
              </p>
              <dl className="mt-3 space-y-3">
                {r.changedFields.map((f) => (
                  <div key={f}>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-ink-500">{fieldLabels[f] ?? f}: before this change</dt>
                    <dd className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-ink-800">
                      {f === "category" ? (categoryLabels[shown(before[f])] ?? shown(before[f])) : shown(before[f]) || <span className="italic text-ink-500">(empty)</span>}
                    </dd>
                  </div>
                ))}
              </dl>
            </li>
          );
        })}
      </ol>
    </details>
  );
}
