/**
 * DIAGNOSTIC (walkthrough demo copy only): signs in as Tom (who uploaded a profile photo in the
 * walkthrough) and reports every request a page makes that has not finished after 10 seconds.
 *
 *   AUDIT_URL=http://127.0.0.1:3400 npx tsx scripts/audit/photo-load.ts /community
 */
import { chromium } from "@playwright/test";
import { DEMO } from "../demo-config";

const BASE = process.env.AUDIT_URL ?? "http://127.0.0.1:3400";
(async () => {
  const b = await chromium.launch({ channel: "msedge" });
  const p = await (await b.newContext()).newPage();
  await p.goto(`${BASE}/login`);
  await p.getByLabel("Email address").fill(process.env.WHO ?? "tom@demo.test");
  await p.getByLabel("Password", { exact: true }).fill(DEMO.password);
  await p.getByRole("button", { name: "Sign In" }).click();
  await p.waitForURL((u) => u.pathname !== "/login", { timeout: 20000 });
  const open = new Map<string, number>();
  const t0 = Date.now();
  p.on("request", (r) => open.set(r.url(), Date.now() - t0));
  p.on("requestfinished", (r) => open.delete(r.url()));
  p.on("requestfailed", (r) => open.delete(r.url()));
  const path = process.argv[2] ?? "/community";
  const loaded = await p.goto(BASE + path, { waitUntil: "load", timeout: 12000 }).then(() => true).catch(() => false);
  console.log(`${path}: load event ${loaded ? "fired" : "did NOT fire within 12 s"}`);
  for (const [u, at] of open) console.log(`  still open: ${u.replace(BASE, "")} (started at ${at} ms)`);
  const imgs = await p.locator("img").evaluateAll((els) => els.map((e) => ({ src: (e as HTMLImageElement).src, done: (e as HTMLImageElement).complete, w: (e as HTMLImageElement).naturalWidth })));
  console.log("  images:", JSON.stringify(imgs.map((i) => ({ ...i, src: i.src.replace(BASE, "") }))));
  await b.close();
})();
