"use client";

import { useEffect, useState } from "react";
import { getSocket } from "./socket";

/** Unread count that updates live when notifications arrive. */
export function NotificationBadge({ initial }: { initial: number }) {
  const [count, setCount] = useState(initial);
  // New server value after navigation (React "adjust state on prop change" pattern).
  const [prevInitial, setPrevInitial] = useState(initial);
  if (prevInitial !== initial) {
    setPrevInitial(initial);
    setCount(initial);
  }
  useEffect(() => {
    const s = getSocket();
    const onCount = (p: { count: number }) => setCount(p.count);
    s.on("notifications:count", onCount);
    return () => {
      s.off("notifications:count", onCount);
    };
  }, []);
  if (!count) return null;
  return (
    <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-xs font-semibold text-white" aria-label={`${count} unread`}>
      {count > 99 ? "99+" : count}
    </span>
  );
}
