/** AUDIT DIAGNOSTIC (temporary): logs every request a page makes for N seconds. */
import { chromium } from "@playwright/test";
const BASE = process.env.AUDIT_URL ?? "http://127.0.0.1:3100";
(async () => {
  const b = await chromium.launch({ channel: "msedge" });
  const p = await (await b.newContext()).newPage();
  const t0 = Date.now();
  p.on("request", (r) => console.log(((Date.now() - t0) / 1000).toFixed(1), r.method(), r.resourceType(), r.url().replace(BASE, "").slice(0, 90)));
  await p.goto(BASE + process.argv[2], { waitUntil: "domcontentloaded" }).catch((e) => console.log("nav:", String(e).slice(0, 100)));
  await p.waitForTimeout(Number(process.argv[3] ?? 8) * 1000);
  console.log("final url:", p.url());
  await b.close();
})();
