import type { Metadata } from "next";
import Link from "next/link";
import { brand } from "@/config/brand";
import { Logo } from "@/components/site/logo";
import { getSession } from "@/lib/auth/guard";
import { logoutAction } from "../(auth)/actions";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Simple frame for signed-in applicants: application form and status page. */
export default async function ApplicantLayout({ children }: { children: React.ReactNode }) {
  const s = await getSession();
  return (
    <div className="min-h-dvh bg-ink-50/60">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2">
        Skip to content
      </a>
      <header className="border-b border-ink-100 bg-white">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link href="/continue" className="rounded-md" aria-label={`${brand().name} home`}>
            <Logo name={brand().name} />
          </Link>
          {s && (
            <div className="flex items-center gap-1 text-sm sm:gap-3">
              <span className="hidden max-w-48 truncate text-ink-600 sm:inline">{s.user.name}</span>
              <Link href="/account" className="rounded-full px-3 py-1.5 text-ink-700 hover:bg-ink-50">
                Account
              </Link>
              <form action={logoutAction}>
                <button type="submit" className="rounded-full px-3 py-1.5 text-ink-700 hover:bg-ink-50">
                  Sign out
                </button>
              </form>
            </div>
          )}
        </div>
      </header>
      <main id="main" className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
        {children}
      </main>
    </div>
  );
}
