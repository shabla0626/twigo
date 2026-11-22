"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

export type NavItem = { href: string; label: string; exact?: boolean; section: string };

function isActive(path: string, i: NavItem) {
  return i.exact ? path === i.href : path === i.href || path.startsWith(`${i.href}/`);
}

function Groups({ items, path }: { items: NavItem[]; path: string }) {
  const sections = [...new Set(items.map((i) => i.section))];
  return (
    <div className="space-y-4">
      {sections.map((s) => (
        <div key={s}>
          {s && <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-400">{s}</p>}
          <ul className="space-y-0.5">
            {items
              .filter((i) => i.section === s)
              .map((i) => (
                <li key={i.href}>
                  <Link
                    href={i.href}
                    aria-current={isActive(path, i) ? "page" : undefined}
                    className="block whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium text-ink-300 hover:bg-white/5 hover:text-white aria-[current=page]:bg-white/10 aria-[current=page]:text-white"
                  >
                    {i.label}
                  </Link>
                </li>
              ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** Admin menu grouped by task; on phones it folds into one "Menu" button. */
export function AdminNav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.open = false;
  }, [path]);
  const current = items.find((i) => isActive(path, i));
  return (
    <nav aria-label="Admin" className="px-2 pb-3 lg:pb-0">
      <div className="hidden lg:block">
        <Groups items={items} path={path} />
      </div>
      <details ref={ref} className="lg:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between rounded-md bg-white/5 px-3 py-2.5 text-sm font-medium text-white [&::-webkit-details-marker]:hidden">
          <span>Menu{current ? `: ${current.label}` : ""}</span>
          <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4">
            <path d="m5 8 5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </summary>
        <div className="mt-3">
          <Groups items={items} path={path} />
        </div>
      </details>
    </nav>
  );
}
