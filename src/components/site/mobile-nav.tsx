"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { IconMenu, IconX } from "../ui/icons";
import { MOBILE_MORE_LINKS, NAV_LINKS } from "./nav";

export function MobileNav({ orgName }: { orgName: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const [lastPath, setLastPath] = useState(pathname);

  // Close the menu when the route changes.
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        className="inline-flex items-center justify-center rounded-md p-2 text-ink-800 hover:bg-ink-100"
        aria-expanded={open}
        aria-controls="mobile-menu"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
        {open ? <IconX /> : <IconMenu />}
      </button>
      {open && (
        <nav
          id="mobile-menu"
          aria-label="Mobile"
          className="absolute inset-x-0 top-full z-40 max-h-[calc(100dvh-4rem)] overflow-y-auto border-b border-ink-200 bg-white shadow-lg"
        >
          <ul className="space-y-1 px-4 py-4">
            {NAV_LINKS.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  aria-current={pathname === l.href ? "page" : undefined}
                  className="block rounded-md px-3 py-3 text-base font-medium text-ink-800 hover:bg-accent-50 aria-[current=page]:bg-accent-50 aria-[current=page]:text-accent-800"
                >
                  {l.label}
                </Link>
              </li>
            ))}
            <li className="pt-2">
              <details className="rounded-md">
                <summary className="cursor-pointer rounded-md px-3 py-3 text-base font-medium text-ink-800 hover:bg-accent-50">More pages</summary>
                <ul className="space-y-1 pb-2 pl-3">
                  {MOBILE_MORE_LINKS.map((l) => (
                      <li key={l.href}>
                        <Link href={l.href} className="block rounded-md px-3 py-2.5 text-[15px] text-ink-700 hover:bg-accent-50">
                          {l.label}
                        </Link>
                      </li>
                    ))}
                </ul>
              </details>
            </li>
            <li className="pt-2">
              <Link
                href="/join"
                className="block rounded-full bg-accent-700 px-3 py-3 text-center text-base font-semibold text-white"
              >
                Join {orgName}
              </Link>
            </li>
            <li>
              <Link href="/login" className="block rounded-full px-3 py-3 text-center text-base font-semibold text-accent-800 ring-1 ring-accent-200">
                Sign In
              </Link>
            </li>
          </ul>
        </nav>
      )}
    </div>
  );
}
