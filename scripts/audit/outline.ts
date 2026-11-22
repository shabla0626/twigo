/**
 * AUDIT DIAGNOSTIC (temporary, read-only). Signs in on the local DEMO site and
 * prints a text outline of pages (headings, buttons, form fields, link count)
 * so the amount of content and the available actions can be reviewed.
 *
 *   npx tsx scripts/audit/outline.ts <email|-> <path> [<path> ...]
 */
import { chromium } from "@playwright/test";
import { TOTP } from "otpauth";
import { DEMO } from "../demo-config";

const BASE = process.env.AUDIT_URL ?? "http://127.0.0.1:3100";

async function main() {
  const [email, ...paths] = process.argv.slice(2);
  const browser = await chromium.launch({ channel: "msedge" });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 } });
  const page = await ctx.newPage();
  if (email !== "-") {
    await page.goto(`${BASE}/login`);
    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(DEMO.password);
    await page.getByRole("button", { name: "Sign In" }).click();
    if (email === DEMO.ownerEmail) {
      await page.getByLabel("Code").fill(new TOTP({ secret: DEMO.totpSecret }).generate());
      await page.getByRole("button", { name: "Verify" }).click();
    }
    await page.waitForURL((u) => !u.pathname.startsWith("/login") && u.pathname !== "/continue", { timeout: 30000 });
  }
  for (const p of paths) {
    const res = await page.goto(`${BASE}${p}`, { waitUntil: "networkidle", timeout: 45000 }).catch(() => null);
    const out = await page.evaluate(() => {
      const main = document.querySelector("main") ?? document.body;
      const lines: string[] = [];
      const vis = (el: Element) => {
        const r = (el as HTMLElement).getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      };
      main.querySelectorAll("h1,h2,h3,button,input,select,textarea,summary,[role=tab],[role=alert],[role=status]").forEach((el) => {
        if (!vis(el) && (el as HTMLInputElement).type !== "hidden") return;
        const tag = el.tagName.toLowerCase();
        const text = (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 90);
        if (/^h[1-3]$/.test(tag)) lines.push(`${"#".repeat(Number(tag[1]))} ${text}`);
        else if (tag === "button") lines.push(`  [button] ${text || el.getAttribute("aria-label")}${(el as HTMLButtonElement).disabled ? " (disabled)" : ""}`);
        else if (tag === "summary") lines.push(`  [expand] ${text}`);
        else if (tag === "input" || tag === "select" || tag === "textarea") {
          const i = el as HTMLInputElement;
          if (i.type === "hidden") return;
          const label = i.labels?.[0]?.textContent?.replace(/\s+/g, " ").trim().slice(0, 70) ?? i.getAttribute("aria-label") ?? "(NO LABEL)";
          lines.push(`  [${tag}${i.type ? ":" + i.type : ""}] ${label}${i.required ? " *" : ""}`);
        } else lines.push(`  [${el.getAttribute("role")}] ${text}`);
      });
      const links = [...main.querySelectorAll("a[href]")].filter(vis);
      const words = (main.textContent ?? "").split(/\s+/).filter(Boolean).length;
      return { lines, links: links.length, words, linkTexts: links.map((a) => (a.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40)).slice(0, 40) };
    });
    console.log(`\n===== ${p}  [${res?.status() ?? "?"}] -> ${new URL(page.url()).pathname}  (${out.words} words, ${out.links} links in main)`);
    console.log(out.lines.join("\n"));
    console.log(`  links: ${out.linkTexts.join(" | ")}`);
  }
  await browser.close();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
