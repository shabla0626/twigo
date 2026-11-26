import type { Metadata } from "next";
import Link from "next/link";
import { brand } from "@/config/brand";
import { Logo } from "@/components/site/logo";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const POINTS = [
  "Free to join. No membership fees.",
  "No commission on the revenue your group earns.",
  "Ideas, groups, and agreements stay with the members.",
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const b = brand();
  return (
    <div className="min-h-dvh bg-white lg:grid lg:grid-cols-[minmax(0,1.08fr)_minmax(24rem,0.92fr)]">
      <aside className="relative hidden overflow-hidden bg-ink-950 text-white lg:flex lg:flex-col lg:justify-between lg:px-14 lg:py-12">
        <div aria-hidden="true" className="pointer-events-none absolute -left-24 top-24 h-72 w-72 rounded-full bg-accent-700/40 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-16 bottom-10 h-64 w-64 rounded-full bg-accent-400/20 blur-3xl" />
        <Link href="/" className="relative inline-flex rounded-md" aria-label={`${b.name} home`}>
          <Logo name={b.name} onDark />
        </Link>
        <div className="relative max-w-md">
          <p className="text-sm font-medium tracking-wide text-accent-200">An online collaborative community</p>
          <p className="mt-4 text-4xl font-semibold leading-[1.15] tracking-tight">{b.tagline}</p>
          <p className="mt-5 text-base leading-7 text-white/75">
            Propose an idea, gather the people who want to work on it, and write the agreement before any paid work begins.
          </p>
        </div>
        <ul className="relative space-y-3 text-sm leading-6 text-white/80">
          {POINTS.map((point) => (
            <li key={point} className="flex gap-3">
              <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-300" />
              <span>{point}</span>
            </li>
          ))}
        </ul>
      </aside>

      <div className="flex min-h-dvh flex-col">
        <header className="flex items-center justify-between px-5 py-5 sm:px-10 lg:hidden">
          <Link href="/" className="inline-flex rounded-md" aria-label={`${b.name} home`}>
            <Logo name={b.name} />
          </Link>
        </header>
        <div className="border-y border-ink-100 bg-ink-950 px-5 py-6 text-white sm:px-10 lg:hidden">
          <p className="text-sm font-medium text-accent-200">An online collaborative community</p>
          <p className="mt-2 max-w-md text-xl font-semibold leading-snug">{b.tagline}</p>
        </div>
        <main id="main" className="flex flex-1 items-start justify-center px-5 py-10 sm:items-center sm:px-10 sm:py-14">
          <div className="w-full max-w-[26rem]">{children}</div>
        </main>
      </div>
    </div>
  );
}
