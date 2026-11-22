/**
 * Stage 1 browser check (temporary diagnostic; DEMO site and fictional accounts only).
 * P1-1 in two real browser sessions: a member has the group chat open; the owner
 * joins the group; the member sees the line at once; the owner sees no earlier chat.
 *
 *   AUDIT_URL=http://127.0.0.1:3300 npx tsx scripts/audit/stage1-check.ts <screenshot folder>
 */
import { mkdirSync } from "node:fs";
import { chromium, type Page } from "@playwright/test";
import { TOTP } from "otpauth";
import { DEMO } from "../demo-config";

const BASE = process.env.AUDIT_URL ?? "http://127.0.0.1:3100";
const OUT = process.argv[2] ?? "docs/corrective-screenshots";
const GROUP = "/community/groups/bookkeeping-help-for-small-local-shops";
const say = (label: string, data: unknown) => console.log(`CHECK ${label}: ${JSON.stringify(data)}`);

async function signIn(page: Page, email: string, totp = false) {
  await page.goto(`${BASE}/login`);
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(DEMO.password);
  await page.getByRole("button", { name: "Sign In" }).click();
  if (totp) {
    await page.getByLabel("Code").fill(new TOTP({ secret: DEMO.totpSecret }).generate());
    await page.getByRole("button", { name: "Verify" }).click();
  }
  await page.waitForURL((u) => !u.pathname.startsWith("/login") && u.pathname !== "/continue", { timeout: 30000 });
}
const chatTexts = (page: Page) => page.locator("[data-message-id]").allInnerTexts();

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: "msedge" });
  const member = await (await browser.newContext({ viewport: { width: 1280, height: 860 } })).newPage();
  const owner = await (await browser.newContext({ viewport: { width: 1280, height: 860 } })).newPage();

  // Start clean: the owner must not be a member yet.
  await signIn(owner, DEMO.ownerEmail, true);
  await owner.goto(`${BASE}${GROUP}`);
  if (!(await owner.getByRole("button", { name: "Join group" }).count())) {
    await owner.getByRole("button", { name: "Leave group" }).first().click();
    await owner.getByRole("button", { name: "Yes, leave group" }).click();
    await owner.waitForURL(/left=1/);
  }

  await signIn(member, "maya@demo.test");
  await member.goto(`${BASE}${GROUP}/chat`);
  await member.getByPlaceholder(/message/i).first().waitFor({ timeout: 20000 });
  const NOTE = `Earlier private note ${new Date().toISOString().slice(11, 19)}`;
  await member.getByPlaceholder(/message/i).first().fill(NOTE);
  await member.keyboard.press("Enter");
  await member.getByText(NOTE).first().waitFor();
  await member.waitForTimeout(1500);
  const before = await chatTexts(member);
  say("member sees the chat before the owner joins (messages)", before.length);

  await owner.goto(`${BASE}${GROUP}`);
  await owner.getByRole("button", { name: "Join group" }).first().click();
  await owner.waitForURL(/joined=1/);

  // The member's open chat shows the line without reloading.
  await member.getByText(/Demo Owner \(administrator\) joined the group/).last().waitFor({ timeout: 10000 });
  say("member sees live", (await chatTexts(member)).filter((t) => /joined the group/.test(t)).map((t) => t.replace(/\s+/g, " ").trim()));
  await member.screenshot({ path: `${OUT}/stage1-01-member-sees-administrator-join.png` });

  await owner.goto(`${BASE}${GROUP}/chat`);
  await owner.getByText(/Demo Owner \(administrator\) joined the group/).first().waitFor({ timeout: 20000 });
  const ownerSees = (await chatTexts(owner)).map((t) => t.replace(/\s+/g, " ").trim());
  say("owner sees in the chat", ownerSees);
  say("owner sees the earlier private note", ownerSees.some((t) => t.includes(NOTE)));
  say("member still sees it", (await chatTexts(member)).some((t) => t.includes(NOTE)));
  say("owner is offered 'Load earlier messages'", await owner.getByRole("button", { name: "Load earlier messages" }).count());
  await owner.screenshot({ path: `${OUT}/stage1-02-administrator-sees-chat-only-from-joining.png` });

  await owner.goto(`${BASE}${GROUP}`);
  say("member list labels", (await owner.locator("aside, section").filter({ hasText: "Members" }).last().innerText()).replace(/\s+/g, " ").slice(0, 200));
  await owner.screenshot({ path: `${OUT}/stage1-03-member-list-labels-administrator.png` });

  // Leave again, so the demo group returns to its previous members.
  if (await owner.getByRole("button", { name: "Join group" }).count()) {
    say("owner was not a member", true);
  } else {
    await owner.getByRole("button", { name: "Leave group" }).first().click();
    await owner.getByRole("button", { name: "Yes, leave group" }).click();
    await owner.waitForURL(/left=1/);
  }
  const sawLeave = await member.getByText(/Demo Owner \(administrator\) left the group/).first().waitFor({ timeout: 10000 }).then(() => true).catch(() => false);
  say("member sees the owner leave", sawLeave);
  await member.screenshot({ path: `${OUT}/stage1-04-member-sees-administrator-leave.png` });
  await browser.close();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
