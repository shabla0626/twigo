/**
 * AUDIT DIAGNOSTIC (temporary). Targeted browser checks on the local DEMO site
 * (fictional accounts only; emails go to the local test inbox).
 *
 *   AUDIT_URL=http://127.0.0.1:3300 npx tsx scripts/audit/checks.ts
 */
import { chromium, type Browser, type Page } from "@playwright/test";
import { DEMO } from "../demo-config";

const BASE = process.env.AUDIT_URL ?? "http://127.0.0.1:3100";
const only = (k: string) => !process.env.AUDIT_ONLY || process.env.AUDIT_ONLY.includes(k);
const say = (label: string, data: unknown) => console.log(`CHECK ${label}: ${JSON.stringify(data)}`);

async function tryLogin(page: Page, email: string, password: string) {
  await page.goto(`${BASE}/login`);
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign In" }).click();
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
  const alert = await page.locator('[role="alert"], [aria-live="polite"]').allTextContents();
  return { url: new URL(page.url()).pathname, message: alert.join(" ").replace(/\s+/g, " ").trim().slice(0, 120) };
}

async function ctx(browser: Browser, ip?: string) {
  return browser.newContext({ viewport: { width: 1280, height: 800 }, ...(ip ? { extraHTTPHeaders: { "x-forwarded-for": ip } } : {}) });
}

async function main() {
  const browser = await chromium.launch({ channel: "msedge" });

  // A. Redirect after "confirm it's you".
  if (only("A")) {
    const c = await ctx(browser, "198.51.100.10");
    const p = await c.newPage();
    await tryLogin(p, "maya@demo.test", DEMO.password);
    await p.goto(`${BASE}/account/confirm?next=/%5Cexample.org/phish`);
    await p.getByLabel(/password/i).first().fill(DEMO.password);
    const nav = p.waitForRequest((r) => r.isNavigationRequest() && !r.url().startsWith(BASE), { timeout: 8000 }).then((r) => r.url()).catch(() => null);
    await p.getByRole("button", { name: /confirm|continue/i }).first().click();
    const external = await nav;
    await p.waitForTimeout(500);
    say("A after confirming identity with next=/\\example.org/phish", { externalNavigation: external, finalUrl: p.url() });
    // Member opening the admin area.
    const res = await p.goto(`${BASE}/admin`).catch(() => null);
    say("A2 member opens /admin", { status: res?.status(), heading: await p.locator("h1").first().textContent().catch(() => null) });
    await c.close();
  }

  // B. Per-network sign-in limit with a different X-Forwarded-For on every request.
  if (only("B")) {
    let blocked = 0;
    for (let i = 0; i < 25; i++) {
      const c = await ctx(browser, `203.0.113.${i + 1}`);
      const p = await c.newPage();
      const r = await tryLogin(p, `nobody${i}@demo.test`, "wrong-password-123");
      if (/too many/i.test(r.message)) blocked++;
      await c.close();
    }
    say("B 25 wrong sign-ins, each with a different made-up X-Forwarded-For: blocked", blocked);
  }

  // C. Does the "forgot password" answer take longer for an address that has an account?
  if (only("C")) {
    const time = async (email: string, ip: string) => {
      const c = await ctx(browser, ip);
      const p = await c.newPage();
      await p.goto(`${BASE}/forgot-password`);
      await p.getByLabel("Email").fill(email);
      const t0 = Date.now();
      await p.getByRole("button", { name: "Send reset link" }).click();
      await p.getByText(/If an active account exists/).waitFor({ timeout: 20000 });
      const ms = Date.now() - t0;
      await c.close();
      return ms;
    };
    const known = [];
    const unknown = [];
    for (const [i, e] of ["luis@demo.test", "grace@demo.test", "sam@demo.test"].entries()) {
      unknown.push(await time(`ghost${i}@demo.test`, `192.0.2.${i + 1}`));
      known.push(await time(e, `192.0.2.${i + 50}`));
    }
    say("C forgot-password response time, ms", { addressWithAccount: known, addressWithoutAccount: unknown });
  }

  // D. Messages after repeated wrong passwords: existing account vs. unknown address.
  if (only("D")) {
    const c = await ctx(browser, "198.51.100.77");
    const p = await c.newPage();
    const real: string[] = [];
    const ghost: string[] = [];
    for (let i = 0; i < 6; i++) real.push((await tryLogin(p, "tom@demo.test", "wrong-password-123")).message);
    for (let i = 0; i < 6; i++) ghost.push((await tryLogin(p, "ghost-account@demo.test", "wrong-password-123")).message);
    say("D existing account, attempts 1-6", real);
    say("D unknown address, attempts 1-6", ghost);
    await c.close();
  }

  // E. No proxy header at all: everyone shares one bucket.
  if (only("E") && process.env.AUDIT_SHARED_BUCKET === "1") {
    const c = await ctx(browser);
    const p = await c.newPage();
    let first = -1;
    for (let i = 0; i < 23; i++) {
      const r = await tryLogin(p, `stranger${i}@demo.test`, "wrong-password-123");
      if (first < 0 && /too many/i.test(r.message)) first = i + 1;
    }
    const c2 = await ctx(browser);
    const p2 = await c2.newPage();
    const honest = await tryLogin(p2, "grace@demo.test", DEMO.password);
    say("E without a proxy header: first blocked attempt", first);
    say("E a different person with the correct password, right afterwards", honest);
    await c.close();
    await c2.close();
  }

  await browser.close();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
