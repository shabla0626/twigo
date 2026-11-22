/**
 * Captures desktop and phone screenshots of the main member screens from the
 * local DEMO site (see scripts/seed-demo.ts), into docs/ux-review/screenshots.
 *
 *   npm run demo:seed   then start the "demo" server (http://127.0.0.1:3100)
 *   npx tsx scripts/demo-screenshots.ts
 *
 * Uses the installed Microsoft Edge. Demo accounts only.
 */
import { mkdirSync } from "node:fs";
import { chromium, type Page } from "@playwright/test";
import { TOTP } from "otpauth";
import { DEMO } from "./demo-config";

const BASE = process.env.DEMO_URL ?? "http://127.0.0.1:3100";
const OUT = "docs/ux-review/screenshots";

async function signIn(page: Page, email: string, totpSecret?: string) {
  await page.goto(`${BASE}/login`);
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(process.env.DEMO_PASSWORD ?? DEMO.password);
  await page.getByRole("button", { name: "Sign In" }).click();
  if (totpSecret) {
    await page.getByLabel("Code").fill(new TOTP({ secret: totpSecret }).generate());
    await page.getByRole("button", { name: "Verify" }).click();
  }
  // Wait until the post-sign-in redirects have settled on a real page.
  await page.waitForURL((u) => !u.pathname.startsWith("/login") && u.pathname !== "/continue");
  await page.waitForLoadState("networkidle");
}

async function shoot(page: Page, path: string, name: string, full = false) {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  if (full) {
    // Scroll through the page so lazy-loaded photos appear in full-page shots.
    await page.evaluate(async () => {
      for (let y = 0; y < document.documentElement.scrollHeight; y += 600) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 120));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForLoadState("networkidle");
  }
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full });
  console.log(`saved ${name}.png`);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: "msedge" });
  const group = "/community/groups/bookkeeping-help-for-small-local-shops";

  const pub = await browser.newContext({ viewport: { width: 1366, height: 860 }, reducedMotion: "reduce" });
  const pp = await pub.newPage();
  await shoot(pp, "/", "public-desktop-01-home", true);
  await shoot(pp, "/how-it-works", "public-desktop-02-how-it-works", true);
  await pub.close();
  const pubPhone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
  const pm = await pubPhone.newPage();
  await shoot(pm, "/", "public-phone-01-home");
  await pm.getByRole("button", { name: "Open menu" }).click();
  await pm.screenshot({ path: `${OUT}/public-phone-02-menu.png` });
  console.log("saved public-phone-02-menu.png");
  await pubPhone.close();

  // Joining: sign up, sign in, check-your-email, application form, status page, admin review.
  const join = await browser.newContext({ viewport: { width: 1366, height: 860 }, reducedMotion: "reduce" });
  const j = await join.newPage();
  await shoot(j, "/join", "onboarding-01-join");
  await shoot(j, "/login", "onboarding-02-sign-in");
  await shoot(j, "/verify-email?sent=1&email=you%40example.com", "onboarding-03-check-your-email");
  await signIn(j, "nina@demo.test");
  await shoot(j, "/apply", "onboarding-04-application-step-1", true);
  await join.close();
  const applicant = await browser.newContext({ viewport: { width: 1366, height: 860 }, reducedMotion: "reduce" });
  const ap = await applicant.newPage();
  await signIn(ap, "omar@demo.test");
  await shoot(ap, "/application", "onboarding-05-application-status", true);
  await applicant.close();
  const joinPhone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
  const jp = await joinPhone.newPage();
  await shoot(jp, "/join", "onboarding-phone-01-join");
  await signIn(jp, "nina@demo.test");
  await shoot(jp, "/apply", "onboarding-phone-02-application");
  await joinPhone.close();

  const desk = await browser.newContext({ viewport: { width: 1366, height: 860 }, reducedMotion: "reduce" });
  const d = await desk.newPage();
  await signIn(d, "maya@demo.test");
  await shoot(d, "/community", "desktop-01-business-ideas");
  const ideaHref = await d.getByRole("link", { name: "Evening tutoring for adults going back to school" }).first().getAttribute("href");
  await shoot(d, "/community/ideas/new", "desktop-02-propose-idea", true);
  await shoot(d, "/community/groups", "desktop-04-explore-groups");
  await shoot(d, "/community/groups/mine", "desktop-05-my-groups");
  await shoot(d, group, "desktop-06-group-overview", true);
  await shoot(d, `${group}/chat`, "desktop-07-group-chat");
  await shoot(d, `${group}/meetings`, "desktop-08-group-meetings");
  await shoot(d, `${group}/research`, "desktop-09-shared-research", true);
  await shoot(d, `${group}/discussions`, "desktop-10-discussions");
  await shoot(d, "/community/help", "desktop-11-help", true);
  await shoot(d, "/community/notifications", "desktop-12-notifications");
  if (ideaHref) await shoot(d, ideaHref, "desktop-03-idea-page", true);
  await desk.close();

  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
  const m = await phone.newPage();
  await signIn(m, "maya@demo.test");
  await shoot(m, "/community", "phone-01-business-ideas");
  await shoot(m, "/community/ideas/new", "phone-02-propose-idea");
  await shoot(m, "/community/groups", "phone-03-explore-groups");
  await shoot(m, group, "phone-04-group-overview");
  await shoot(m, `${group}/chat`, "phone-05-group-chat");
  await shoot(m, `${group}/meetings`, "phone-06-group-meetings");
  await shoot(m, `${group}/research`, "phone-07-shared-research");
  await phone.close();

  const adminCtx = await browser.newContext({ viewport: { width: 1366, height: 860 } });
  const a = await adminCtx.newPage();
  await signIn(a, DEMO.ownerEmail, DEMO.totpSecret);
  await shoot(a, "/admin", "desktop-13-admin-dashboard");
  await shoot(a, "/admin/applications", "onboarding-06-admin-applications");
  await a.getByRole("link", { name: "Omar Haddad" }).click();
  await a.waitForURL(/\/admin\/applications\/[a-z0-9]+/);
  await a.waitForLoadState("networkidle");
  await a.screenshot({ path: `${OUT}/onboarding-07-admin-review.png`, fullPage: true });
  console.log("saved onboarding-07-admin-review.png");
  await adminCtx.close();
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
