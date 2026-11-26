"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { cn } from "../ui/primitives";
import { IconBell, IconBook, IconBulb, IconCompass, IconGear, IconGroup, IconHelp, IconMegaphone, IconNotes, IconUser } from "./icons";
import { NotificationBadge } from "./notification-badge";

type Area = "ideas" | "discuss" | "fields" | "culture" | "explore" | "mine" | null;

/**
 * The main areas. A group page counts as "My Groups" when the member
 * belongs to that group, otherwise as "Explore Groups".
 */
function activeArea(path: string, mySlugs: string[]): Area {
  if (path === "/community" || path.startsWith("/community/ideas")) return "ideas";
  if (path.startsWith("/community/discuss")) return "discuss";
  if (path.startsWith("/community/fields")) return "fields";
  if (path.startsWith("/community/culture")) return "culture";
  if (path === "/community/groups/mine") return "mine";
  const m = path.match(/^\/community\/groups\/([^/]+)/);
  if (m) return mySlugs.includes(m[1]!) ? "mine" : "explore";
  if (path === "/community/groups") return "explore";
  return null;
}

const PRIMARY = [
  { key: "ideas", href: "/community", label: "Business Ideas", short: "Ideas", icon: IconBulb },
  { key: "discuss", href: "/community/discuss", label: "Discussion", short: "Discuss", icon: IconNotes },
  { key: "fields", href: "/community/fields", label: "Fields", short: "Fields", icon: IconBook },
  { key: "culture", href: "/community/culture", label: "Works", short: "Works", icon: IconMegaphone },
  { key: "explore", href: "/community/groups", label: "Explore Groups", short: "Explore", icon: IconCompass },
  { key: "mine", href: "/community/groups/mine", label: "My Groups", short: "Groups", icon: IconGroup },
] as const;

export function PortalSidebarNav({ mySlugs }: { mySlugs: string[] }) {
  const area = activeArea(usePathname(), mySlugs);
  return (
    <nav aria-label="Community">
      <ul className="space-y-1">
        {PRIMARY.map((i) => {
          const active = area === i.key;
          return (
            <li key={i.key}>
              <Link
                href={i.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium transition",
                  active ? "bg-accent-100 text-accent-900" : "text-ink-700 hover:bg-white hover:text-ink-950",
                )}
              >
                <i.icon className="h-5 w-5 shrink-0" />
                {i.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Bottom tab bar for phones: the same main areas. */
export function PortalBottomNav({ mySlugs }: { mySlugs: string[] }) {
  const area = activeArea(usePathname(), mySlugs);
  return (
    <nav aria-label="Community (mobile)" className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-100 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      <ul className="mx-auto grid max-w-lg grid-cols-6">
        {PRIMARY.map((i) => {
          const active = area === i.key;
          return (
            <li key={i.key}>
              <Link
                href={i.href}
                aria-current={active ? "page" : undefined}
                className={cn("flex flex-col items-center gap-0.5 py-2.5 text-xs font-medium", active ? "text-accent-800" : "text-ink-600")}
              >
                <i.icon className="h-6 w-6" />
                {i.short}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Bell in the header, with a live unread count. */
export function NotificationsLink({ unread }: { unread: number }) {
  const active = usePathname() === "/community/notifications";
  return (
    <Link
      href="/community/notifications"
      aria-current={active ? "page" : undefined}
      className={cn("relative flex h-10 items-center gap-2 rounded-full px-2.5 text-ink-700 hover:bg-ink-50 hover:text-ink-950", active && "bg-accent-50 text-accent-900")}
    >
      <IconBell className="h-6 w-6" />
      <span className="sr-only sm:not-sr-only sm:text-sm sm:font-medium">Notifications</span>
      <NotificationBadge initial={unread} />
    </Link>
  );
}

/** Account menu: profile, settings, help, admin and sign out, out of the main navigation. */
export function UserMenu({
  name,
  avatar,
  isAdmin,
  signOut,
}: {
  name: string;
  avatar: React.ReactNode;
  isAdmin: boolean;
  signOut: (fd: FormData) => void | Promise<void>;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const path = usePathname();
  useEffect(() => {
    if (ref.current) ref.current.open = false;
  }, [path]);
  useEffect(() => {
    const close = (e: MouseEvent | KeyboardEvent) => {
      const el = ref.current;
      if (!el?.open) return;
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !el.contains(e.target as Node)) el.open = false;
    };
    document.addEventListener("click", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", close);
    };
  }, []);
  const item = "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-ink-800 hover:bg-ink-50";
  return (
    <details ref={ref} className="relative">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-full py-1 pl-1 pr-2 hover:bg-ink-50 sm:pr-3 [&::-webkit-details-marker]:hidden">
        {avatar}
        <span className="hidden max-w-40 truncate text-sm font-medium text-ink-900 sm:inline">{name}</span>
        <span className="sr-only">Open account menu</span>
        <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 text-ink-500">
          <path d="m5 8 5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </summary>
      <div className="absolute right-0 z-40 mt-2 w-60 rounded-2xl border border-ink-100 bg-white p-2 shadow-lg">
        <Link href="/community/profile" className={item}>
          <IconUser className="h-5 w-5 text-ink-500" /> My Profile
        </Link>
        <Link href="/account" className={item}>
          <IconGear className="h-5 w-5 text-ink-500" /> Account Settings
        </Link>
        <Link href="/community/help" className={item}>
          <IconHelp className="h-5 w-5 text-ink-500" /> Help
        </Link>
        {isAdmin && (
          <Link href="/admin" className={item}>
            <span className="inline-flex h-5 w-5 items-center justify-center text-xs font-bold text-ink-500">A</span> Admin panel
          </Link>
        )}
        <div className="my-1 border-t border-ink-100" />
        <form action={signOut}>
          <button type="submit" className={item}>
            <span className="h-5 w-5" aria-hidden="true" /> Sign out
          </button>
        </form>
      </div>
    </details>
  );
}
