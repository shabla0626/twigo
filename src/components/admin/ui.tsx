import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "../ui/primitives";

export function AdminHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 border-b border-ink-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {description && <p className="mt-1 text-sm text-ink-600">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

const OK_MESSAGES: Record<string, string> = {
  status: "Status updated.",
  note: "Note added.",
  deleted: "Deleted.",
  saved: "Changes saved.",
  removed: "Participant removed.",
  created: "Project created.",
  role: "Role added.",
  role_deleted: "Role removed.",
  assigned: "Participant assigned.",
  assignment: "Assignment updated.",
  milestone: "Milestone updated.",
  milestone_deleted: "Milestone removed.",
  compensation: "Compensation record saved.",
  reset: "Section reset to default content.",
};

const ERROR_MESSAGES: Record<string, string> = {
  note: "Note cannot be empty.",
  confirm: "Confirmation text did not match. Nothing was changed.",
  participant: "This person is a participant. Remove the participant record first.",
  invalid: "Some values were invalid. Nothing was saved.",
};

export function Flash({ ok, error }: { ok?: string; error?: string }) {
  if (!ok && !error) return null;
  const text = error ? (ERROR_MESSAGES[error] ?? error) : (OK_MESSAGES[ok!] ?? ok);
  return (
    <div
      role={error ? "alert" : "status"}
      className={cn(
        "mt-6 rounded-md border px-4 py-3 text-sm",
        error ? "border-red-200 bg-red-50 text-red-900" : "border-emerald-200 bg-emerald-50 text-emerald-900",
      )}
    >
      {text}
    </div>
  );
}

export function StatCard({ label, value, href }: { label: string; value: number; href?: string }) {
  const inner = (
    <div className="rounded-lg border border-ink-200 bg-white p-5 shadow-sm transition-colors hover:border-ink-300">
      <p className="text-sm text-ink-600">{label}</p>
      <p className="mt-2 text-3xl font-semibold tabular-nums text-ink-950">{value}</p>
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

export function Panel({ title, children, actions, className }: { title?: string; children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-lg border border-ink-200 bg-white shadow-sm", className)}>
      {title && (
        <div className="flex items-center justify-between gap-4 border-b border-ink-200 px-5 py-3">
          <h2 className="text-base font-semibold">{title}</h2>
          {actions}
        </div>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function Table({ head, children, empty }: { head: ReactNode[]; children: ReactNode; empty?: ReactNode }) {
  return (
    // Focusable so keyboard users can scroll wide tables (WCAG scrollable-region-focusable).
    <div tabIndex={0} role="region" aria-label="Table" className="overflow-x-auto rounded-lg border border-ink-200 bg-white shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-600">
      <table className="min-w-full divide-y divide-ink-200 text-sm">
        <thead className="bg-ink-50">
          <tr>
            {head.map((h, i) => (
              <th key={i} scope="col" className="whitespace-nowrap px-4 py-3 text-left font-semibold text-ink-700">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">{children}</tbody>
      </table>
      {empty}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="px-4 py-10 text-center text-sm text-ink-500">{children}</p>;
}

export function Dl({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
      {items.map(([k, v]) => (
        <div key={k}>
          <dt className="text-xs font-medium uppercase tracking-wide text-ink-500">{k}</dt>
          <dd className="mt-1 whitespace-pre-wrap break-words text-sm text-ink-900">{v || <span className="text-ink-500">—</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

export const statusTone = {
  DRAFT: "neutral",
  SUBMITTED: "accent",
  UNDER_REVIEW: "warn",
  INTERVIEW_REQUESTED: "warn",
  ACCEPTED: "success",
  WAITLISTED: "neutral",
  DECLINED: "danger",
  WITHDRAWN: "neutral",
} as const;

export const membershipTone = { NONE: "neutral", ACTIVE: "success", SUSPENDED: "warn", REVOKED: "danger" } as const;

export function fmtDate(d: Date | null | undefined, withTime = false) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    ...(withTime ? { timeStyle: "short" } : {}),
    timeZone: "UTC",
  }).format(d) + (withTime ? " UTC" : "");
}

export const smallInput =
  "block w-full rounded-md border-0 bg-white px-2.5 py-2 text-sm text-ink-950 ring-1 ring-inset ring-ink-300 focus:outline-none focus:ring-2 focus:ring-accent-600";
export const smallLabel = "block text-xs font-medium text-ink-700 mb-1";
