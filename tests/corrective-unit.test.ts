/**
 * Regression tests for the corrective implementation plan: pure logic (no database).
 */
import { describe, expect, it } from "vitest";
import { resolveClientAddress } from "@/lib/client-address";
import { clientIp } from "@/lib/security";

describe("P1-3: the visitor address cannot be chosen by the visitor", () => {
  const direct = "198.51.100.20";

  it("without a trusted proxy the network connection is used and X-Forwarded-For is ignored", () => {
    expect(resolveClientAddress(direct, undefined, 0)).toBe(direct);
    expect(resolveClientAddress(direct, "1.2.3.4", 0)).toBe(direct);
    expect(resolveClientAddress(direct, "1.2.3.4, 5.6.7.8", 0)).toBe(direct);
    expect(resolveClientAddress(`::ffff:${direct}`, undefined, 0)).toBe(direct);
  });

  it("behind one proxy the entry written by that proxy is used; anything the visitor added is ignored", () => {
    const proxy = "10.0.0.5";
    // Honest request: the proxy recorded the visitor.
    expect(resolveClientAddress(proxy, "203.0.113.9", 1)).toBe("203.0.113.9");
    // The visitor sent a made-up header; the proxy appended the real address after it.
    expect(resolveClientAddress(proxy, "9.9.9.9, 203.0.113.9", 1)).toBe("203.0.113.9");
    expect(resolveClientAddress(proxy, ["9.9.9.9", "8.8.8.8, 203.0.113.9"], 1)).toBe("203.0.113.9");
  });

  it("behind two proxies the second entry from the right is used", () => {
    expect(resolveClientAddress("10.0.0.5", "9.9.9.9, 203.0.113.9, 10.0.0.4", 2)).toBe("203.0.113.9");
  });

  it("a request that did not come through the promised proxies falls back to the connection", () => {
    expect(resolveClientAddress(direct, undefined, 1)).toBe(direct);
    expect(resolveClientAddress(direct, "9.9.9.9", 2)).toBe(direct);
  });

  it("garbage in the header never becomes the address", () => {
    expect(resolveClientAddress("10.0.0.5", "<script>, not an address", 1)).toBe("10.0.0.5");
    expect(resolveClientAddress(undefined, undefined, 0)).toBe("unknown");
  });

  it("application code reads only the internal header set by the server", async () => {
    // The test stand-in for request headers carries both: the internal header (203.0.113.7)
    // and a visitor-supplied X-Forwarded-For (198.51.100.99).
    expect(await clientIp()).toBe("203.0.113.7");
  });
});
