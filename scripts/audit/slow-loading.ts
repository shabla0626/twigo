/**
 * DIAGNOSTIC (read-only): checks P3-2 on a slow connection. Signs in as a member, makes the network
 * slow (1.5 s delay per request), clicks to another page and reports whether the loading
 * placeholder is shown while the next page is on its way. Saves a screenshot of that moment.
 *
 *   AUDIT_URL=http://127.0.0.1:3400 npx tsx scripts/audit/slow-loading.ts <screenshot file>
 */
import { chromium } from "@playwright/test";
import { DEMO } from "../demo-config";

const BASE = process.env.AUDIT_URL ?? "http://127.0.0.1:3400";
(async () => {
  const b = await chromium.launch({ channel: "msedge" });
  const ctx = await b.newContext({ viewport: { width: 1366, height: 800 } });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/login`);
  await p.getByLabel("Email address").fill("grace@demo.test");
  await p.getByLabel("Password", { exact: true }).fill(DEMO.password);
  await p.getByRole("button", { name: "Sign In" }).click();
  await p.waitForURL((u) => u.pathname.startsWith("/community"), { timeout: 20000 });
  await p.waitForLoadState("networkidle").catch(() => {});
  const cdp = await ctx.newCDPSession(p);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 1500, downloadThroughput: 50_000, uploadThroughput: 50_000 });
  const results: string[] = [];
  for (const [area, from, link] of [
    ["member area", "/community", "My Groups"],
  ] as const) {
    void from;
    const placeholder = p.locator('[role="status"]', { hasText: "Loading" });
    await p.getByRole("navigation", { name: "Community" }).getByRole("link", { name: link }).click();
    const seen = await placeholder.first().waitFor({ state: "attached", timeout: 5000 }).then(() => true).catch(() => false);
    await p.waitForTimeout(700); // the placeholder fades in after a short delay, so quick changes do not flicker
    if (seen && process.argv[2]) await p.screenshot({ path: process.argv[2] });
    results.push(`${area}: placeholder ${seen ? "shown" : "NOT shown"} while "${link}" was loading`);
    await p.getByRole("heading", { level: 1, name: link }).waitFor({ timeout: 30000 });
    results.push(`${area}: "${link}" arrived and the placeholder is ${(await placeholder.count()) ? "still there (wrong)" : "gone"}`);
  }
  for (const r of results) console.log(r);
  await b.close();
})();
