/**
 * Shown while a page of this area is being prepared (for example on a slow
 * connection), so the screen is never blank. It appears only after a short
 * delay, so quick page changes do not flicker.
 */
export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="animate-[fadein_0.2s_ease-out_0.3s_both] space-y-4 py-2">
      <span className="sr-only">Loading…</span>
      <div className="h-7 w-56 rounded-lg bg-ink-200/70" />
      <div className="h-4 w-80 max-w-full rounded bg-ink-200/50" />
      <div className="h-40 rounded-2xl border border-ink-100 bg-white" />
      <div className="h-24 rounded-2xl border border-ink-100 bg-white" />
    </div>
  );
}
