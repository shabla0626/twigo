/**
 * DIAGNOSTIC (read-only): measures how tall each public page is on a desktop and on a phone,
 * lists its section headings, and saves a full-page screenshot of each.
 *
 *   AUDIT_URL=http://127.0.0.1:3300 npx tsx scripts/audit/page-heights.ts <screenshot folder>
 */
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const BASE = process.env.AUDIT_URL ?? "http://127.0.0.1:3300";
const OUT = process.argv[2] ?? "page-heights";
const PAGES = ["/", "/how-it-works", "/about", "/compensation", "/participation", "/founding-contributors", "/faq"];

(async () => {
  mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ channel: "msedge" });
  for (const [label, viewport] of [["desktop", { width: 1366, height: 900 }], ["phone", { width: 390, height: 844 }]] as const) {
    const ctx = await b.newContext({ viewport, reducedMotion: "reduce" });
    const p = await ctx.newPage();
    for (const path of PAGES) {
      await p.goto(BASE + path, { waitUntil: "load" });
      await p.waitForLoadState("networkidle", { timeout: 4000 }).catch(() => {});
      const height = await p.evaluate(() => document.documentElement.scrollHeight);
      const overflow = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      const headings = (await p.locator("main h2").allTextContents()).map((t) => t.trim()).filter(Boolean);
      console.log(`${label.padEnd(7)} ${path.padEnd(22)} ${String(height).padStart(6)} px  overflow ${overflow}  | ${headings.join(" / ")}`);
      if (label === "desktop") await p.screenshot({ path: `${OUT}/${path === "/" ? "home" : path.slice(1)}.png`, fullPage: true });
    }
    await ctx.close();
  }
  await b.close();
})();
