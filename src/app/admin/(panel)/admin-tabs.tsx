"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Related admin pages share one menu entry and are shown as tabs at the top of
 * the page (so the menu stays short and nothing has to be searched for). The
 * pages themselves and their addresses are unchanged.
 */
export const ADMIN_TAB_GROUPS: { hrefs: string[]; tabs: { href: string; label: string }[] }[] = [
  {
    hrefs: ["/admin/members", "/admin/admins"],
    tabs: [
      { href: "/admin/members", label: "Members and accounts" },
      { href: "/admin/admins", label: "Administrators" },
    ],
  },
  {
    hrefs: ["/admin/projects", "/admin/participants"],
    tabs: [
      { href: "/admin/projects", label: "Projects" },
      { href: "/admin/participants", label: "People on projects" },
    ],
  },
  {
    hrefs: ["/admin/reports", "/admin/ideas"],
    tabs: [
      { href: "/admin/reports", label: "Reports" },
      { href: "/admin/ideas", label: "Ideas" },
    ],
  },
  {
    hrefs: ["/admin/privacy", "/admin/backups", "/admin/privacy-requests"],
    tabs: [
      { href: "/admin/privacy", label: "Retention" },
      { href: "/admin/privacy-requests", label: "Privacy requests" },
      { href: "/admin/backups", label: "Backups" },
    ],
  },
  {
    hrefs: ["/admin/legal", "/admin/legal/notices", "/admin/legal/acceptances"],
    tabs: [
      { href: "/admin/legal", label: "Documents" },
      { href: "/admin/legal/notices", label: "Legal notices" },
      { href: "/admin/legal/acceptances", label: "Acceptance records" },
    ],
  },
];

const under = (path: string, href: string) => path === href || path.startsWith(`${href}/`);

/** `allowed`: the pages this administrator may open (decided on the server from their role). */
export function AdminSectionTabs({ allowed }: { allowed: string[] }) {
  const path = usePathname();
  const group = ADMIN_TAB_GROUPS.find((g) => g.hrefs.some((h) => under(path, h)));
  const tabs = group?.tabs.filter((t) => allowed.includes(t.href)) ?? [];
  if (tabs.length < 2) return null;
  return (
    <nav aria-label="Section" className="mb-6">
      <ul className="flex w-fit flex-wrap gap-1 rounded-xl bg-ink-100 p-1">
        {tabs.map((t) => (
          <li key={t.href}>
            <Link
              href={t.href}
              aria-current={under(path, t.href) ? "page" : undefined}
              className="block rounded-lg px-4 py-2 text-sm font-medium text-ink-600 hover:text-ink-950 aria-[current=page]:bg-white aria-[current=page]:text-ink-950 aria-[current=page]:shadow-sm"
            >
              {t.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
