"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "../ui/primitives";
import { IconChat, IconClipboard, IconInfo, IconMegaphone, IconNotes, IconVideo } from "./icons";

/** Six sections; members are listed on Overview, files live in Research. */
const TABS = [
  { seg: "", label: "Overview", icon: IconInfo, private: false, also: ["members"] },
  { seg: "chat", label: "Chat", icon: IconChat, private: true, also: [] },
  { seg: "meetings", label: "Meetings", icon: IconVideo, private: true, also: [] },
  { seg: "research", label: "Research", icon: IconNotes, private: true, also: ["files"] },
  { seg: "projects", label: "Projects", icon: IconClipboard, private: true, also: [] },
  { seg: "discussions", label: "Discussions", icon: IconMegaphone, private: false, also: [] },
];

export function GroupTabs({ slug, isMember, unread = 0, live = false }: { slug: string; isMember: boolean; unread?: number; live?: boolean }) {
  const path = usePathname();
  const base = `/community/groups/${slug}`;
  return (
    <nav aria-label="Group sections">
      <ul className="grid grid-cols-6 gap-1 rounded-2xl bg-ink-50 p-1 sm:flex sm:w-fit">
        {TABS.map((t) => {
          const href = t.seg ? `${base}/${t.seg}` : base;
          const active = t.seg ? path.startsWith(href) || t.also.some((a) => path.startsWith(`${base}/${a}`)) : path === base || t.also.some((a) => path.startsWith(`${base}/${a}`));
          return (
            <li key={t.seg}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex flex-col items-center gap-0.5 rounded-xl px-1 py-2 text-[11px] font-medium transition sm:flex-row sm:gap-2 sm:px-4 sm:text-sm",
                  active ? "bg-white text-accent-900 shadow-sm ring-1 ring-ink-100" : "text-ink-600 hover:bg-white/70 hover:text-ink-950",
                )}
              >
                <t.icon className="h-5 w-5 shrink-0" />
                {t.label}
                {t.private && !isMember && <span className="sr-only"> (members only)</span>}
                {t.seg === "chat" && unread > 0 && (
                  <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-rose-700 sm:static sm:h-auto sm:w-auto sm:px-1.5 sm:text-xs sm:font-semibold sm:text-white" aria-label={`${unread} unread`}>
                    <span className="hidden sm:inline">{unread}</span>
                  </span>
                )}
                {t.seg === "meetings" && live && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-emerald-500 sm:static" aria-label="meeting in progress" />}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
