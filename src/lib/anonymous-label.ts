import { createHash } from "node:crypto";

/** A stable anonymous account label. The same member always gets the same label, and it is not their name. */
export function anonymousLabel(userId: string) {
  const tag = createHash("sha256").update(userId).digest("hex").slice(0, 4).toUpperCase();
  return `Member ${tag}`;
}
