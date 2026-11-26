"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSocket } from "./socket";

/**
 * Refreshes the open discussion page when someone else publishes a piece,
 * a comment, or a mark. The event carries an id only; the page is read again from the server.
 */
export function BoardLive({ articleId }: { articleId?: string }) {
  const router = useRouter();
  useEffect(() => {
    const s = getSocket();
    const payload = { articleId: articleId ?? null };
    const watch = () => s.emit("board:watch", payload);
    watch();
    s.on("connect", watch);
    const onUpdate = () => router.refresh();
    s.on("board:updated", onUpdate);
    return () => {
      s.off("connect", watch);
      s.off("board:updated", onUpdate);
    };
  }, [articleId, router]);
  return null;
}
