/** Paging for long admin lists (audit log, inquiries, email log). */
export const LIST_PAGE_SIZE = 50;

/** Page number from the address. Anything that is not a sensible number means page 1. */
export function pageNumber(raw: string | string[] | undefined): number {
  const n = Number(Array.isArray(raw) ? raw[0] : raw);
  return Number.isInteger(n) && n >= 1 && n <= 100_000 ? n : 1;
}

export function pageCount(total: number, size = LIST_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / size));
}

/** `skip`/`take` for the database, never beyond the last page. */
export function pageWindow(page: number, total: number, size = LIST_PAGE_SIZE) {
  const current = Math.min(page, pageCount(total, size));
  return { page: current, pages: pageCount(total, size), skip: (current - 1) * size, take: size };
}

/** Address of another page of the same list, keeping the filters that are in use. */
export function pageHref(path: string, filters: Record<string, string | undefined>, page: number): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) if (v) params.set(k, v);
  if (page > 1) params.set("page", String(page));
  const q = params.toString();
  return q ? `${path}?${q}` : path;
}
