// Where a request really came from.
//
// The address is used only to count attempts (sign-in, registration, password
// reset, contact form). It must not be something the visitor can choose, so it
// is NEVER read from a header the visitor sends. The server entry point
// (server.ts) works it out for every request and stores it in an internal
// header that it always overwrites; application code reads only that header.
//
// No proxy in front (TRUSTED_PROXY_HOPS=0, the default): the address of the
// network connection itself.
// Behind N reverse proxies that each append to X-Forwarded-For
// (TRUSTED_PROXY_HOPS=N): the entry added by the outermost trusted proxy, i.e.
// the N-th from the right. Everything further left was supplied by the client
// and is ignored.

/** Internal request header set by server.ts. A value sent by a client is always replaced. */
export const CLIENT_ADDRESS_HEADER = "x-internal-client-address";

function clean(value: string | undefined): string | null {
  if (!value) return null;
  let v = value.trim().toLowerCase();
  if (v.startsWith("::ffff:")) v = v.slice(7); // IPv4 written as IPv6
  return /^[0-9a-f:.]{2,45}$/.test(v) ? v : null;
}

export function resolveClientAddress(remoteAddress: string | undefined, forwardedFor: string | string[] | undefined, trustedHops: number): string {
  const direct = clean(remoteAddress) ?? "unknown";
  if (!Number.isInteger(trustedHops) || trustedHops <= 0) return direct;
  const forwarded = (Array.isArray(forwardedFor) ? forwardedFor.join(",") : (forwardedFor ?? ""))
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  // The chain as seen by this server: what the proxies recorded, then the proxy that connected to us.
  const chain = [...forwarded, remoteAddress ?? ""];
  const index = chain.length - 1 - trustedHops;
  // Fewer entries than proxies were promised: the request did not come through them. Use the connection.
  if (index < 0) return direct;
  return clean(chain[index]) ?? direct;
}

/**
 * True when a request did come through a proxy (it has X-Forwarded-For) but the chain is shorter than
 * TRUSTED_PROXY_HOPS promises. Then every visitor resolves to the same proxy address and shares one
 * sign-in limit: typically the outer proxy's entry was dropped (for example Caddy without
 * `trusted_proxies` for Cloudflare's addresses). Used only to warn in the server log.
 */
export function forwardedChainTooShort(forwardedFor: string | string[] | undefined, trustedHops: number): boolean {
  if (!Number.isInteger(trustedHops) || trustedHops <= 1) return false;
  const entries = (Array.isArray(forwardedFor) ? forwardedFor.join(",") : (forwardedFor ?? "")).split(",").filter((s) => s.trim());
  return entries.length > 0 && entries.length < trustedHops;
}
