/** AUDIT DIAGNOSTIC (temporary): signs in as the demo owner and reports how one page loads. */
import { chromium } from "@playwright/test";
import { TOTP } from "otpauth";
import { DEMO } from "../demo-config";
const BASE = process.env.AUDIT_URL ?? "http://127.0.0.1:3100";
(async () => {
  const b = await chromium.launch({ channel: "msedge" });
  const p = await (await b.newContext({ viewport: { width: 1366, height: 860 } })).newPage();
  await p.goto(`${BASE}/login`);
  await p.getByLabel("Email address").fill(DEMO.ownerEmail);
  await p.getByLabel("Password", { exact: true }).fill(DEMO.password);
  await p.getByRole("button", { name: "Sign In" }).click();
  await p.waitForLoadState("networkidle").catch(() => {});
  console.log("after password:", new URL(p.url()).pathname, "|", (await p.locator('[role="alert"]').allTextContents()).join(" ").slice(0, 120));
  if (p.url().includes("/login/verify")) {
    await p.getByLabel("Code").fill(new TOTP({ secret: DEMO.totpSecret }).generate());
    await p.getByRole("button", { name: "Verify" }).click();
    await p.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 }).catch(() => {});
    console.log("after code:", new URL(p.url()).pathname, "|", (await p.locator('[role="alert"]').allTextContents()).join(" ").slice(0, 120));
  }
  for (const path of process.argv.slice(2)) {
    const open = new Set<string>();
    p.on("request", (r) => open.add(r.url()));
    p.on("requestfinished", (r) => open.delete(r.url()));
    p.on("requestfailed", (r) => open.delete(r.url()));
    const t0 = Date.now();
    const ok = await p.goto(BASE + path, { waitUntil: "networkidle", timeout: 20000 }).then(() => true).catch(() => false);
    console.log(path, ok ? "idle after" : "NOT idle after", Date.now() - t0, "ms; h1:", await p.locator("h1").first().textContent().catch(() => null), "; still open:", [...open].map((u) => u.replace(BASE, "").slice(0, 80)));
    if (process.env.SHOT) await p.screenshot({ path: `${process.env.SHOT}/${path.replace(/[^a-z0-9]+/gi, "_")}.png`, fullPage: true });
  }
  await b.close();
})();
