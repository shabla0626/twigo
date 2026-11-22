import type { Metadata } from "next";
import Link from "next/link";
import { brand } from "@/config/brand";
import { Logo } from "@/components/site/logo";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-gradient-to-b from-accent-50 via-white to-sky-50">
      <header className="px-4 py-5 sm:px-8">
        <Link href="/" className="inline-block rounded-md" aria-label={`${brand().name} home`}>
          <Logo name={brand().name} />
        </Link>
      </header>
      <main id="main" className="flex flex-1 items-start justify-center px-4 pb-16 pt-6 sm:pt-12">
        <div className="w-full max-w-md rounded-3xl border border-ink-100 bg-white p-7 shadow-soft-lg sm:p-9">{children}</div>
      </main>
    </div>
  );
}
