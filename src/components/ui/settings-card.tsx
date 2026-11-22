import type { ReactNode } from "react";

export function SettingsCard({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-ink-100 bg-white p-6 shadow-soft">
      <h2 className="text-lg font-semibold text-ink-950">{title}</h2>
      {description && <div className="mt-1 text-sm leading-6 text-ink-600">{description}</div>}
      <div className="mt-5">{children}</div>
    </section>
  );
}
