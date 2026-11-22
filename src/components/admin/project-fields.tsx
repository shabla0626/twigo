import { PROJECT_STATUSES, WORK_CATEGORIES } from "@/lib/labels";
import { smallInput, smallLabel } from "./ui";

type P = {
  title?: string;
  summary?: string;
  description?: string | null;
  category?: string | null;
  status?: string;
  isPublished?: boolean;
  publicSummary?: string | null;
  startDate?: Date | null;
  targetDate?: Date | null;
};

const d = (v?: Date | null) => (v ? v.toISOString().slice(0, 10) : "");

export function ProjectFields({ p = {} }: { p?: P }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label htmlFor="title" className={smallLabel}>
          Title
        </label>
        <input id="title" name="title" required maxLength={160} defaultValue={p.title} className={smallInput} />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="summary" className={smallLabel}>
          Internal summary
        </label>
        <textarea id="summary" name="summary" required rows={2} maxLength={1000} defaultValue={p.summary} className={smallInput} />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="description" className={smallLabel}>
          Description, scope and customer details (internal)
        </label>
        <textarea id="description" name="description" rows={4} defaultValue={p.description ?? ""} className={smallInput} />
      </div>
      <div>
        <label htmlFor="category" className={smallLabel}>
          Category
        </label>
        <select id="category" name="category" defaultValue={p.category ?? ""} className={smallInput}>
          <option value="">—</option>
          {Object.entries(WORK_CATEGORIES).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="status" className={smallLabel}>
          Status
        </label>
        <select id="status" name="status" defaultValue={p.status ?? "PLANNING"} className={smallInput}>
          {Object.entries(PROJECT_STATUSES).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="startDate" className={smallLabel}>
          Start date
        </label>
        <input id="startDate" name="startDate" type="date" defaultValue={d(p.startDate)} className={smallInput} />
      </div>
      <div>
        <label htmlFor="targetDate" className={smallLabel}>
          Target completion
        </label>
        <input id="targetDate" name="targetDate" type="date" defaultValue={d(p.targetDate)} className={smallInput} />
      </div>
      <div className="rounded-md border border-ink-200 bg-ink-50 p-3 sm:col-span-2">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" name="isPublished" defaultChecked={p.isPublished} className="accent-accent-700" />
          Publish as an opportunity on the public Participation page
        </label>
        <p className="mt-1 text-xs text-ink-600">
          Only publish confirmed opportunities. Only the title, category, status, public summary and role titles/skills are
          shown publicly. Shown while status is Planning, Seeking Participants or Ready.
        </p>
        <label htmlFor="publicSummary" className={`${smallLabel} mt-3`}>
          Public summary
        </label>
        <textarea id="publicSummary" name="publicSummary" rows={2} maxLength={600} defaultValue={p.publicSummary ?? ""} className={smallInput} />
      </div>
    </div>
  );
}
