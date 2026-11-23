"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/account", label: "Account" },
  { href: "/account/security", label: "Password & sign-in" },
  { href: "/account/notifications", label: "Notifications" },
  { href: "/account/agreements", label: "Agreements" },
  { href: "/account/data", label: "Your data" },
];

export function AccountNav() {
  const path = usePathname();
  return (
    <nav aria-label="Account settings" className="mb-6 lg:mb-0">
      <ul className="flex gap-1 overflow-x-auto lg:block lg:space-y-1">
        {ITEMS.map((i) => (
          <li key={i.href} className="shrink-0">
            <Link
              href={i.href}
              aria-current={path === i.href ? "page" : undefined}
              className="block whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium text-ink-700 hover:bg-white hover:text-accent-800 aria-[current=page]:bg-white aria-[current=page]:text-accent-900 aria-[current=page]:ring-1 aria-[current=page]:ring-ink-100"
            >
              {i.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
