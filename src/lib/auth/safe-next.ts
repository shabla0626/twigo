// "Where to go next" addresses come from the page address or a hidden form
// field, so a visitor (or someone who sends them a link) can put anything
// there. Only addresses inside this site are ever followed.

const BASE = "https://site.invalid"; // only used to resolve relative addresses; never contacted

/**
 * Returns `raw` when it is a path inside this site, otherwise `fallback`.
 *
 * Accepts: "/account", "/admin/privacy?x=1#y".
 * Refuses: other sites ("https://…", "//host", "/\host", which browsers treat
 * like "//host"), anything with a backslash or control character, and
 * anything that does not resolve back to this site.
 */
export function safeNext(raw: unknown, fallback = ""): string {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 2000) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(raw)) return fallback;
  try {
    const u = new URL(raw, BASE);
    if (u.origin !== BASE) return fallback;
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return fallback;
  }
}
