/** AUDIT DIAGNOSTIC (temporary): lists failed sub-requests of pages. npx tsx scripts/audit/net404.ts <path>... */
import { chromium } from "@playwright/test";
const BASE = process.env.AUDIT_URL ?? "http://127.0.0.1:3100";
(async () => {
  const b = await chromium.launch({ channel: "msedge" });
  const p = await (await b.newContext()).newPage();
  p.on("response", (r) => r.status() >= 400 && console.log(r.status(), r.request().resourceType(), r.url()));
  p.on("requestfailed", (r) => console.log("FAILED", r.failure()?.errorText, r.url()));
  for (const path of process.argv.slice(2)) {
    console.log("==", path);
    await p.goto(BASE + path, { waitUntil: "networkidle", timeout: 20000 }).catch((e) => console.log("nav:", String(e).slice(0, 100)));
    await p.waitForTimeout(3000);
  }
  await b.close();
})();
