/**
 * DIAGNOSTIC for Stage 3 (demo site only). Opens the new confirmation dialogs and cancels them,
 * and checks a few pages in a real browser. It changes NO data: nothing is confirmed or submitted.
 *
 *   AUDIT_URL=http://127.0.0.1:3300 npx tsx scripts/audit/stage3-check.ts <screenshot folder>
 */
import { mkdirSync } from "node:fs";
import { chromium, type Page } from "@playwright/test";
import { DEMO } from "../demo-config";

const BASE = process.env.AUDIT_URL ?? "http://127.0.0.1:3300";
const OUT = process.argv[2] ?? "stage3-out";
const results: [string, boolean, string][] = [];
const check = (name: string, ok: boolean, detail = "") => results.push([name, ok, detail]);

async function signIn(page: Page, email: string) {
  await page.goto(`${BASE}/login`);
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(DEMO.password);
  await page.getByRole("button", { name: "Sign In" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });
}

(async () => {
  mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ channel: "msedge" });
  const ctx = await b.newContext({ viewport: { width: 1366, height: 900 } });
  const p = await ctx.newPage();
  const errors: string[] = [];
  p.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 150)));

  // ---- coordinator: the two confirmation dialogs
  await signIn(p, "maya@demo.test");
  const slug = "bookkeeping-help-for-small-local-shops"; // the demo group that Maya coordinates
  await p.goto(`${BASE}/community/groups/${slug}/members`);
  const before = await p.getByRole("button", { name: "Make coordinator" }).count();
  await p.getByRole("button", { name: "Make coordinator" }).first().click();
  const dialog = p.getByRole("alertdialog");
  check("Make coordinator asks first", await dialog.isVisible(), (await dialog.textContent())?.slice(0, 90) ?? "");
  await p.screenshot({ path: `${OUT}/stage3-05-make-coordinator-asks-first.png` });
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await dialog.waitFor({ state: "detached", timeout: 5000 }).catch(() => {});
  check("…and Cancel changes nothing", (await p.getByRole("button", { name: "Make coordinator" }).count()) === before && !(await p.getByRole("alertdialog").count()));
  await p.getByRole("button", { name: /^Remove .* from the group$/ }).first().click();
  const d2 = p.getByRole("alertdialog");
  check("Remove asks first and says what cannot be undone", (await d2.textContent())?.includes("cannot rejoin by themselves") ?? false);
  await p.screenshot({ path: `${OUT}/stage3-06-remove-member-asks-first.png` });
  await d2.getByRole("button", { name: "Cancel" }).click();
  await d2.waitFor({ state: "detached", timeout: 5000 }).catch(() => {});
  check("the group still has 4 members", (await p.getByText("Members (4)").count()) === 1);

  // ---- who can read what
  await p.goto(`${BASE}/community/groups/${slug}/discussions`);
  check("discussions say who can read them", (await p.getByText("Who can read this page:").count()) === 1);
  await p.goto(`${BASE}/community/groups/${slug}/chat`);
  await p.getByLabel("Message").first().waitFor({ timeout: 10000 }).catch(() => {});
  check("chat says who can read it", (await p.getByText("members of this group only").count()) === 1);
  check("one control named for attaching a file", (await p.getByRole("button", { name: "Attach a file" }).count()) === 1 && (await p.getByLabel("Message").count()) === 1, `buttons ${await p.getByRole("button", { name: "Attach a file" }).count()}, fields called Message ${await p.getByLabel("Message").count()}`);

  // ---- a removed or unknown page inside the member area
  await p.goto(`${BASE}/community/groups/this-group-does-not-exist`);
  check("unknown group shows the plain page inside the member area", (await p.getByRole("heading", { name: "This is no longer available" }).count()) === 1 && (await p.getByRole("link", { name: "Business Ideas" }).count()) > 0);
  await p.screenshot({ path: `${OUT}/stage3-07-removed-page-inside-member-area.png` });

  // ---- banners: text from the address is not displayed
  for (const path of [`/community/groups/${slug}?ok=Your+account+was+hacked`, `/community/groups/${slug}/members?ok=Call+this+number`, `/application?error=Payment+required`, `/account/security?ok=Send+us+your+password`]) {
    await p.goto(BASE + path);
    // What a person can see (not the page's internal data).
    const body = await p.locator("body").innerText();
    check(`no address text shown on ${path.split("?")[0]}`, !/hacked|Call this number|Payment required|Send us your password/.test(body));
  }
  await p.goto(`${BASE}/application`);
  check("an approved member is not offered an application", (await p.getByRole("link", { name: /Start my application|Continue my application/ }).count()) === 0);
  await p.screenshot({ path: `${OUT}/stage3-08-member-application-page.png` });

  // ---- the site icon
  const icon = await p.request.get(`${BASE}/favicon.ico`);
  check("site icon is served", icon.status() === 200, icon.headers()["content-type"] ?? "");
  check("no console errors on these pages", errors.length === 0, errors.join(" | "));

  for (const [name, ok, detail] of results) console.log(ok ? "ok  " : "FAIL", name, detail ? `(${detail})` : "");
  console.log(`\n${results.filter((r) => r[1]).length} of ${results.length} checks passed`);
  await b.close();
})();
