"use client";

import { useState } from "react";
import { Button } from "../ui/primitives";

/** "Leave group" asks for confirmation first, so nobody leaves by accident. */
export function LeaveGroupButton({ groupId, action }: { groupId: string; action: (fd: FormData) => Promise<void> }) {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <Button type="button" variant="secondary" size="sm" onClick={() => setConfirming(true)}>
        Leave group
      </Button>
    );
  }
  return (
    <div role="alertdialog" aria-labelledby={`leave-${groupId}`} className="w-full rounded-xl border border-ink-200 bg-white p-4 text-sm sm:w-80">
      <p id={`leave-${groupId}`} className="font-medium text-ink-950">
        Leave this group?
      </p>
      <p className="mt-1 leading-6 text-ink-600">You will lose access to its chat, meetings and shared research. Your account stays active and you can rejoin later.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <form action={action}>
          <input type="hidden" name="groupId" value={groupId} />
          <Button type="submit" variant="danger" size="sm">
            Yes, leave group
          </Button>
        </form>
        <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)} autoFocus>
          Cancel
        </Button>
      </div>
    </div>
  );
}
