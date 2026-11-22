"use client";

import { useState, type ReactNode } from "react";

/**
 * On a phone, a long filter form pushes the results off the screen. This keeps the less-used
 * filters folded away behind one button there. On wider screens they are always shown.
 * The folded fields stay in the form, so their values are still sent.
 */
export function MoreFilters({ inUse, children }: { inUse: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(inUse);
  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="justify-self-start text-sm font-medium text-accent-700 underline underline-offset-2 sm:hidden"
      >
        {open ? "Hide filters" : inUse ? "Show filters (in use)" : "Show filters"}
      </button>
      <div className={open ? "contents" : "hidden sm:contents"}>{children}</div>
    </>
  );
}
