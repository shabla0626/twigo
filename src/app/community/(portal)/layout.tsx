import type { Metadata } from "next";
import Link from "next/link";
import { brand } from "@/config/brand";
import { NotificationsLink, PortalBottomNav, PortalSidebarNav, UserMenu } from "@/components/community/portal-nav";
import { MemberAvatar } from "@/components/community/ui";
import { Logo } from "@/components/site/logo";
import { db } from "@/lib/db";
import { requireMember } from "@/lib/auth/guard";
import { isAdminRole } from "@/lib/auth/permissions";
import { unreadCount } from "@/server/community/notifications";
import { logoutAction } from "../../(auth)/actions";

export const metadata: Metadata = { title: { default: "Community", template: `%s | ${brand().name} Community` }, robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await requireMember();
  const [unread, memberships] = await Promise.all([
    unreadCount(user.id),
    db.groupMembership.findMany({ where: { userId: user.id, status: "ACTIVE" }, select: { group: { select: { slug: true } } } }),
  ]);
  const mySlugs = memberships.map((m) => m.group.slug);
  return (
    <div className="min-h-dvh bg-ink-50/60">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2">
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b border-ink-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link href="/community" className="rounded-md" aria-label={`${brand().name} community home`}>
            <Logo name={brand().name} />
          </Link>
          <div className="flex items-center gap-1 sm:gap-2">
            <NotificationsLink unread={unread} />
            <UserMenu
              name={user.displayName}
              avatar={<MemberAvatar name={user.displayName} photoId={user.photoFileId} size={32} />}
              isAdmin={isAdminRole(user.role)}
              signOut={logoutAction}
            />
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-4 pb-28 pt-6 sm:px-6 lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-8 lg:pb-12">
        <aside className="hidden lg:block">
          <div className="sticky top-24 space-y-5">
            <PortalSidebarNav mySlugs={mySlugs} />
            <p className="px-3 text-xs leading-5 text-ink-500">
              <Link href="/community/help" className="font-medium text-ink-700 hover:underline">
                How it works
              </Link>{" "}
              ·{" "}
              <Link href="/community-rules" className="font-medium text-ink-700 hover:underline">
                Community rules
              </Link>
            </p>
          </div>
        </aside>
        <main id="main" className="min-w-0">
          {children}
        </main>
      </div>
      <PortalBottomNav mySlugs={mySlugs} />
    </div>
  );
}
