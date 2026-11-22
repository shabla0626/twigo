import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "../ui/primitives";

/** Initials avatar (members may also upload an optional photo). */
export function MemberAvatar({ name, photoId, size = 36 }: { name: string; photoId?: string | null; size?: number }) {
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const hue = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  if (photoId) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- private, authorized image route
      <img src={`/api/files/${photoId}`} alt="" width={size} height={size} className="shrink-0 rounded-full object-cover ring-2 ring-white" style={{ width: size, height: size }} />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-ink-900 ring-2 ring-white"
      style={{ width: size, height: size, fontSize: size * 0.38, background: `hsl(${hue} 70% 88%)` }}
    >
      {initials || "?"}
    </span>
  );
}

export function timeAgo(d: Date | string, now = Date.now()): string {
  const t = typeof d === "string" ? new Date(d).getTime() : d.getTime();
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  const days = Math.round(h / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", year: new Date(t).getFullYear() === new Date(now).getFullYear() ? undefined : "numeric" });
}

export function Time({ date }: { date: Date }) {
  return (
    <time dateTime={date.toISOString()} title={date.toLocaleString("en-US")}>
      {timeAgo(date)}
    </time>
  );
}

export function Panel({ title, action, children, className }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-2xl border border-ink-100 bg-white p-5 shadow-soft", className)}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          {title && <h2 className="text-base font-semibold text-ink-950">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-ink-200 bg-white/70 px-6 py-10 text-center">
      <p className="font-semibold text-ink-900">{title}</p>
      {body && <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-ink-600">{body}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function PageTitle({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-ink-950 sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm leading-6 text-ink-600">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/** Plain-text body with paragraphs; never renders HTML. */
export function TextBody({ text, className }: { text: string; className?: string }) {
  return (
    <div className={cn("space-y-3 break-words text-[15px] leading-7 text-ink-800", className)}>
      {text.split(/\n{2,}/).map((para, i) => (
        <p key={i} className="whitespace-pre-line">
          {para}
        </p>
      ))}
    </div>
  );
}

export function FilterLink({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition",
        active ? "bg-accent-700 text-white" : "bg-white text-ink-700 ring-1 ring-ink-200 hover:bg-accent-50",
      )}
    >
      {children}
    </Link>
  );
}
