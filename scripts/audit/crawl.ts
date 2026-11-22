/**
 * AUDIT DIAGNOSTIC (temporary). Crawls the local DEMO site as several roles,
 * read-only (GET pages only; no forms submitted), and records per page:
 * HTTP status, final URL, h1, console errors, phone-width horizontal overflow,
 * serious/critical axe issues; one desktop + one phone screenshot per route pattern.
 *
 *   start the "demo" server (http://127.0.0.1:3100), then: npx tsx scripts/audit/crawl.ts <outDir>
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, type BrowserContext, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { TOTP } from "otpauth";
import { DEMO } from "../demo-config";

const BASE = process.env.AUDIT_URL ?? "http://127.0.0.1:3100";
const OUT = process.argv[2] ?? "audit-out";
const PER_PATTERN = 2;

const ROLES: { key: string; email?: string; totp?: boolean; start: string[] }[] = [
  { key: "visitor", start: ["/", "/join", "/login", "/forgot-password", "/verify-email", "/apply", "/application", "/community", "/admin"] },
  { key: "nina-no-application", email: "nina@demo.test", start: ["/continue", "/apply", "/application", "/community", "/account"] },
  { key: "omar-applicant", email: "omar@demo.test", start: ["/continue", "/application", "/apply", "/community", "/account"] },
  { key: "maya-member", email: "maya@demo.test", start: ["/community", "/account", "/apply", "/application", "/admin"] },
  { key: "owner", email: DEMO.ownerEmail, totp: true, start: ["/admin", "/community", "/account"] },
];

const SKIP = [/^\/api\//, /\/export(\/|$|\?)/, /\/join\/?$/i, /\/meetings\/[^/]+\/join/, /logout/, /\/_next\//, /\.(png|jpe?g|webp|svg|pdf|ico|txt|xml)$/];

function pattern(p: string) {
  return p
    .replace(/\?.*$/, "")
    .replace(/\/(c[a-z0-9]{20,}|[0-9a-f-]{32,36})(?=\/|$)/g, "/[id]")
    .replace(/\/groups\/(?!mine$)[^/]+/, "/groups/[slug]")
    .replace(/\/members\/[^/[]+/, "/members/[id]")
    .replace(/\/email\/[a-z_]+$/, "/email/[key]");
}

async function signIn(page: Page, email: string, totp?: boolean) {
  await page.goto(`${BASE}/login`);
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(DEMO.password);
  await page.getByRole("button", { name: "Sign In" }).click();
  if (totp) {
    await page.getByLabel("Code").fill(new TOTP({ secret: DEMO.totpSecret }).generate());
    await page.getByRole("button", { name: "Verify" }).click();
  }
  await page.waitForURL((u) => !u.pathname.startsWith("/login") && u.pathname !== "/continue", { timeout: 20000 });
}

type Row = { role: string; path: string; status: number | null; final: string; h1: string; title: string; consoleErrors: string[]; overflowPx: number; axe: string[]; ms: number };

async function crawlRole(ctxDesk: BrowserContext, ctxPhone: BrowserContext, role: (typeof ROLES)[number], rows: Row[]) {
  const page = await ctxDesk.newPage();
  const phone = await ctxPhone.newPage();
  const queue = [...role.start];
  const seen = new Set<string>();
  const perPattern = new Map<string, number>();
  const shot = new Set<string>();
  while (queue.length) {
    const path = queue.shift()!;
    if (seen.has(path) || SKIP.some((r) => r.test(path))) continue;
    seen.add(path);
    const pat = pattern(path);
    const n = perPattern.get(pat) ?? 0;
    if (n >= PER_PATTERN) continue;
    perPattern.set(pat, n + 1);

    const errors: string[] = [];
    const onConsole = (m: { type(): string; text(): string }) => m.type() === "error" && errors.push(m.text().slice(0, 200));
    page.on("console", onConsole);
    const t0 = Date.now();
    let status: number | null = null;
    try {
      // "load", then a short settle. Not "networkidle": on a repeat visit the browser refreshes its
      // cached copies of the static public pages in the background, and the test tooling never
      // reports the end of those refreshes, so "networkidle" can wait forever on a finished page.
      const res = await page.goto(`${BASE}${path}`, { waitUntil: "load", timeout: 30000 });
      await page.waitForLoadState("networkidle", { timeout: 4000 }).catch(() => {});
      status = res?.status() ?? null;
    } catch (e) {
      errors.push(`navigation: ${(e as Error).message.slice(0, 120)}`);
    }
    const ms = Date.now() - t0;
    page.off("console", onConsole);
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    const final = new URL(page.url()).pathname + new URL(page.url()).search;
    const h1 = (await page.locator("h1").first().textContent({ timeout: 2000 }).catch(() => "")) ?? "";
    const title = await page.title().catch(() => "");

    let axe: string[] = [];
    let overflowPx = 0;
    const key = `${role.key}:${pattern(final)}`;
    if (!shot.has(key)) {
      shot.add(key);
      try {
        const res = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
        axe = res.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}(${v.nodes.length}): ${v.nodes[0]?.target.join(" ")}`);
      } catch {}
      const safe = `${role.key}${pattern(final).replace(/[^a-z0-9]+/gi, "_")}`.slice(0, 120);
      await page.screenshot({ path: `${OUT}/desk/${safe}.png`, fullPage: true }).catch(() => {});
      try {
        await phone.goto(`${BASE}${final}`, { waitUntil: "load", timeout: 30000 });
        await phone.waitForLoadState("networkidle", { timeout: 4000 }).catch(() => {});
        overflowPx = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        await phone.screenshot({ path: `${OUT}/phone/${safe}.png`, fullPage: true });
      } catch {}
    }
    rows.push({ role: role.key, path, status, final, h1: h1.trim().slice(0, 100), title, consoleErrors: errors, overflowPx, axe, ms });
    console.log(`${role.key} ${status} ${path} -> ${final} ${ms}ms ${errors.length ? "ERR" : ""} ${axe.length ? "AXE" : ""} ${overflowPx > 0 ? "OVERFLOW" : ""}`);

    writeFileSync(`${OUT}/crawl.json`, JSON.stringify(rows, null, 2));
    const links = await page.$$eval("a[href]", (as) => as.map((a) => a.getAttribute("href") || "")).catch(() => [] as string[]);
    for (const href of links) {
      if (!href.startsWith("/") || href.startsWith("//")) continue;
      const clean = href.split("#")[0];
      if (clean && !seen.has(clean)) queue.push(clean);
    }
  }
  await page.close();
  await phone.close();
}

async function main() {
  mkdirSync(`${OUT}/desk`, { recursive: true });
  mkdirSync(`${OUT}/phone`, { recursive: true });
  const browser = await chromium.launch({ channel: "msedge" });
  const rows: Row[] = [];
  const only = process.env.ROLES?.split(",");
  for (const role of ROLES.filter((r) => !only || only.includes(r.key))) {
    const desk = await browser.newContext({ viewport: { width: 1366, height: 860 }, reducedMotion: "reduce" });
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
    if (role.email) {
      const p = await desk.newPage();
      await signIn(p, role.email, role.totp);
      await p.close();
      // Same session cookie for the phone context.
      await phone.addCookies(await desk.cookies());
    }
    await crawlRole(desk, phone, role, rows);
    await desk.close();
    await phone.close();
  }
  await browser.close();
  writeFileSync(`${OUT}/crawl.json`, JSON.stringify(rows, null, 2));
  const bad = rows.filter((r) => (r.status ?? 0) >= 400 || r.consoleErrors.length || r.axe.length || r.overflowPx > 0);
  console.log(`\n${rows.length} pages, ${bad.length} with issues`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
