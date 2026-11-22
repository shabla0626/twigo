import type { Metadata } from "next";
import Link from "next/link";
import { brand } from "@/config/brand";
import { Logo } from "@/components/site/logo";
import { requireUser } from "@/lib/auth/guard";
import { isAdminRole } from "@/lib/auth/permissions";
import { logoutAction } from "../(auth)/actions";
import { AccountNav } from "./account-nav";

export const metadata: Metadata = { title: "Account settings", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser("/account");
  const admin = isAdminRole(user.role);
  return (
    <div className="min-h-dvh bg-ink-50">
      <header className="border-b border-ink-100 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <Link href="/continue" aria-label={`${brand().name} home`}>
            <Logo name={brand().name} />
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/continue" className="font-medium text-accent-700 hover:underline">
              {user.communityAccess ? "← Back to the community" : "← Back to my application"}
            </Link>
            {admin && (
              <Link href="/admin" className="font-medium text-accent-700 hover:underline">
                Admin
              </Link>
            )}
            <form action={logoutAction}>
              <button type="submit" className="text-ink-600 hover:text-ink-950">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:grid lg:grid-cols-[12rem_1fr] lg:gap-10">
        <AccountNav />
        <main id="main" className="min-w-0 space-y-6">
          {children}
        </main>
      </div>
    </div>
  );
}
