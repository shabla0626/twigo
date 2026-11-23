import Link from "next/link";
import { cn } from "../ui/primitives";

/**
 * Shown next to every button that makes someone a group member (joining, or supporting an idea that
 * may found a group). Pressing the button records acceptance of the current version of the Group
 * Participation Agreement.
 */
export function GroupAgreementNote({ action, className }: { action: "joining" | "supporting"; className?: string }) {
  return (
    // A block-level span, so it can also sit inside a paragraph (for example a page description).
    <span className={cn("block text-xs leading-5 text-ink-600", className)}>
      {action === "joining" ? "By joining" : "By supporting an idea"} you accept the{" "}
      <Link href="/legal/group-participation" target="_blank" className="font-medium text-accent-700 underline underline-offset-2">
        Group Participation Agreement
      </Link>{" "}
      {action === "joining" ? "for this group" : "for the group that may form"}. It creates no financial obligation.
    </span>
  );
}
