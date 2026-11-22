/** A moment `days` days before now (for "in the last N days" filters). */
export function daysAgo(days: number, now = Date.now()): Date {
  return new Date(now - days * 24 * 3600_000);
}
