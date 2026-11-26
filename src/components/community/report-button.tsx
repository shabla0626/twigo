import { REPORT_REASONS } from "@/lib/validation/community";
import { reportAction } from "@/app/community/actions";
import { ActionForm } from "../forms/action-form";
import { IconFlag } from "./icons";

/** Collapsible report form (works without JavaScript). */
export function ReportButton({
  targetType,
  targetId,
  label = "Report",
  align = "right",
}: {
  targetType: "IDEA" | "COMMENT" | "DISCUSSION" | "MESSAGE" | "GROUP" | "USER" | "FIELD_POST" | "ARTICLE" | "PROJECT_BROADCAST" | "CULTURAL_WORK";
  targetId: string;
  label?: string;
  /** Which edge of the button the panel lines up with ("left" where there is no room to the left, as in the chat). */
  align?: "left" | "right";
}) {
  const id = `report-${targetType}-${targetId}`;
  return (
    <details className="group relative inline-block text-sm">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-full px-2 py-1 text-ink-500 hover:bg-ink-50 hover:text-ink-800">
        <IconFlag className="h-4 w-4" /> {label}
      </summary>
      <div className={`absolute ${align === "left" ? "left-0" : "right-0"} z-20 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-ink-100 bg-white p-4 shadow-soft-lg`}>
        <p className="text-sm font-semibold text-ink-950">Report to the moderators</p>
        <p className="mt-1 text-xs text-ink-600">A copy of this content is sent to the moderators for review.</p>
        <ActionForm action={reportAction} submitLabel="Send report" pendingLabel="Sending…" variant="danger" className="mt-3" submitClassName="w-full">
          <input type="hidden" name="targetType" value={targetType} />
          <input type="hidden" name="targetId" value={targetId} />
          <label htmlFor={`${id}-reason`} className="block text-xs font-medium text-ink-700">
            Reason
          </label>
          <select id={`${id}-reason`} name="reason" required className="block w-full rounded-xl border-0 px-3 py-2 text-sm ring-1 ring-ink-300">
            {Object.entries(REPORT_REASONS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <label htmlFor={`${id}-details`} className="block text-xs font-medium text-ink-700">
            Details (optional)
          </label>
          <textarea id={`${id}-details`} name="details" rows={3} maxLength={2000} className="block w-full rounded-xl border-0 px-3 py-2 text-sm ring-1 ring-ink-300" />
        </ActionForm>
      </div>
    </details>
  );
}
