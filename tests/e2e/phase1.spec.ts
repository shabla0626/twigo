/**
 * The founder's critical Phase 1 scenario, end to end, with independent
 * browser sessions (separate contexts = separate cookies) for each person.
 *
 * Voice/video: the founder chose Google Meet for Phase 1, so steps 16–18 test
 * the in-app meeting flow (start, member join link, non-member refusal). The
 * audio/video itself runs in Google Meet and is outside this test.
 */
import { readdirSync, readFileSync } from "node:fs";
import { spawn, type ChildProcess } from "node:child_process";
import { connect } from "node:net";
import path from "node:path";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Secret, TOTP } from "otpauth";
import { E2E } from "../../playwright.config";

test.describe.configure({ mode: "serial" });

const MEMBERS = {
  A: { name: "Ava Adams", email: "ava@e2e.test", display: "Ava Adams" },
  B: { name: "Ben Brown", email: "ben@e2e.test", display: "Ben Brown" },
  C: { name: "Cleo Carter", email: "cleo@e2e.test", display: "Cleo Carter" },
  D: { name: "Dev Diaz", email: "dev@e2e.test", display: "Dev Diaz" },
  // E stays an applicant (waitlisted, then declined); F registers during an email outage.
  E: { name: "Eve Evans", email: "eve@e2e.test", display: "Eve Evans" },
  F: { name: "Finn Foster", email: "finn@e2e.test", display: "Finn Foster" },
} as const;
type Key = keyof typeof MEMBERS;
type Person = { name: string; email: string };

const IDEA = "Weekend bookkeeping for local shops";
const sessions: Partial<Record<Key | "admin", { ctx: BrowserContext; page: Page }>> = {};
let groupUrl = "";

// The local test mail server runs as its own process, so one test can stop it to simulate an outage.
// (It must not run inside this process: on Windows the browser started later would inherit its port.)
let mail: ChildProcess | null = null;
const portOpen = () =>
  new Promise<boolean>((resolve) => {
    const sock = connect({ host: "127.0.0.1", port: E2E.smtpPort });
    sock.once("connect", () => (sock.destroy(), resolve(true)));
    sock.once("error", () => resolve(false));
    sock.setTimeout(1000, () => (sock.destroy(), resolve(false)));
  });
async function waitForPort(open: boolean) {
  for (let i = 0; i < 100; i++) {
    if ((await portOpen()) === open) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`mail server did not ${open ? "start" : "stop"}`);
}
const startMail = async () => {
  mail = spawn(process.execPath, ["--import", "tsx", "scripts/dev-mail.ts"], {
    env: { ...process.env, DEV_MAIL_PORT: String(E2E.smtpPort), DEV_MAIL_UI_PORT: String(E2E.smtpPort + 6000), DEV_MAIL_DIR: E2E.mailDir },
    stdio: "ignore",
  });
  await waitForPort(true);
};
const stopMail = async () => {
  if (!mail) return;
  const done = new Promise((r) => mail!.once("exit", r));
  mail.kill();
  await done;
  mail = null;
  await waitForPort(false);
};
test.beforeAll(startMail);

function totp() {
  return new TOTP({ secret: Secret.fromBase32(E2E.totpSecret), digits: 6, period: 30 }).generate();
}

function mailsTo(to: string): { subject: string; text: string }[] {
  const files = readdirSync(E2E.mailDir).filter((f) => f.endsWith(".json")).sort().reverse();
  const out = [];
  for (const f of files) {
    const meta = JSON.parse(readFileSync(path.join(E2E.mailDir, f), "utf8")) as { to: string[]; subject: string };
    if (meta.to.includes(to)) out.push({ subject: meta.subject, text: readFileSync(path.join(E2E.mailDir, f.replace(".json", ".eml")), "utf8").replace(/=\r?\n/g, "").replace(/=3D/g, "=") });
  }
  return out;
}
function latestMail(to: string): string {
  const m = mailsTo(to)[0];
  if (!m) throw new Error(`No email to ${to}`);
  return m.text;
}
const linkIn = (text: string, route: string) => new RegExp(`(http://127\\.0\\.0\\.1:3210/${route}/[A-Za-z0-9_-]+)`).exec(text)?.[1];

async function newSession(browser: Browser) {
  const ctx = await browser.newContext();
  return { ctx, page: await ctx.newPage() };
}

async function a11y(page: Page, label: string) {
  // After a form that leads to another page, the framework sets the new page title one frame
  // after the content (measured: about 8 ms, scripts/audit/title-timing.ts). A check that runs in
  // exactly that frame sees no title; this was the cause of the occasional failures of tests B
  // and 16–18 (P3-22). Wait until the title is there, as it is for every visitor a moment later.
  await page.waitForFunction(() => document.title.trim().length > 0, undefined, { timeout: 10_000 });
  const res = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  const serious = res.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${label}: ${v.id} (${v.nodes.length})`)).toEqual([]);
}

async function signIn(page: Page, email: string, password: string = E2E.password) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign In" }).click();
}
async function signOut(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByText("You are signed out.")).toBeVisible();
}

/** Create Account form (from the public "Join" button). */
async function register(page: Page, m: Person) {
  await page.goto("/");
  await page.getByRole("banner").getByRole("link", { name: /^Join / }).click();
  await expect(page.getByRole("heading", { name: /^Join / })).toBeVisible();
  await page.getByLabel("Full name").fill(m.name);
  await page.getByLabel("Email address").fill(m.email);
  await page.getByLabel("Password", { exact: true }).fill(E2E.password);
  await page.getByLabel("Confirm password").fill(E2E.password);
  for (const consent of ["acceptTerms", "acceptGuidelines", "ackPrivacy"]) await page.locator(`input[name="${consent}"]`).check();
  await page.getByRole("button", { name: "Create Account" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
}

/** Opens the emailed link and presses the confirmation button; ends on the application form. */
async function verifyEmail(page: Page, m: Person) {
  const link = linkIn(latestMail(m.email), "verify-email");
  expect(link, `verification link for ${m.email}`).toBeTruthy();
  await page.goto(link!);
  await page.getByRole("button", { name: "Confirm my email" }).click();
  await expect(page.getByText("Your email address is confirmed.")).toBeVisible();
  await expect(page).toHaveURL(/\/apply/);
  return link!;
}

async function fillStep1(page: Page) {
  await page.getByLabel("Country").fill("United States");
  await page.getByLabel("State or region").fill("Ohio");
  await page.getByLabel("What do you do now?").fill("Store employee");
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page.getByRole("heading", { name: /Step 2 of 4/ })).toBeVisible();
}
async function fillStep2(page: Page) {
  await page.getByLabel("Your skills and abilities").fill("Bookkeeping, Excel");
  await page.locator("#wc-GENERAL_REMOTE").check();
  await page.getByLabel("About how many hours a week could you give?").selectOption("5");
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page.getByRole("heading", { name: /Step 3 of 4/ })).toBeVisible();
}
async function fillStep3AndSubmit(page: Page) {
  await page.getByLabel(/Why do you want to take part/).fill("I want to earn extra income by building something real with others.");
  await page.getByLabel("What do you think you can contribute?").fill("Careful bookkeeping and reliable follow-through.");
  await page.getByRole("button", { name: "Save and review" }).click();
  await expect(page.getByRole("heading", { name: /Step 4 of 4/ })).toBeVisible();
  await page.locator('input[name="confirm"]').check();
  await page.getByRole("button", { name: "Submit application" }).click();
  await expect(page.getByText("Your application was received and saved.")).toBeVisible();
}

/** Opens one application in the admin panel and waits for its page. */
async function openApplication(page: Page, name: string) {
  await page.goto("/admin/applications");
  await page.getByRole("link", { name }).first().click();
  await page.waitForURL(/\/admin\/applications\/[a-z0-9-]+(\?.*)?$/);
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
}

test.afterAll(async () => {
  for (const x of Object.values(sessions)) await x?.ctx.close();
  await stopMail();
});

test("A. a new visitor creates an account, confirms their email and reaches the application", async ({ browser }) => {
  const s = await newSession(browser);
  sessions.A = s;
  const { page } = s;
  // The public site offers exactly two account actions.
  await page.goto("/");
  await expect(page.getByRole("banner").getByRole("link", { name: "Sign In" })).toBeVisible();
  await page.getByRole("banner").getByRole("link", { name: /^Join / }).click();
  await a11y(page, "join");
  // Friendly validation: weak password and mismatch are explained, nothing is created.
  await page.getByLabel("Full name").fill(MEMBERS.A.name);
  await page.getByLabel("Email address").fill(MEMBERS.A.email);
  await page.getByLabel("Password", { exact: true }).fill("short-pass-1");
  await page.getByLabel("Confirm password").fill("different-pass-1");
  await page.getByRole("button", { name: "Show password" }).first().click();
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("type", "text");
  for (const consent of ["acceptTerms", "acceptGuidelines", "ackPrivacy"]) await page.locator(`input[name="${consent}"]`).check();
  await page.getByLabel("Password", { exact: true }).fill("short-pass-12");
  await page.getByRole("button", { name: "Create Account" }).click();
  await expect(page.getByText("The two passwords do not match.")).toBeVisible();

  await register(page, MEMBERS.A);
  await expect(page.getByText(MEMBERS.A.email)).toBeVisible();
  await a11y(page, "check your email");
  // Before confirming: signing in works, but only leads to the verification instructions.
  await signIn(page, MEMBERS.A.email);
  await expect(page).toHaveURL(/\/verify-email/);
  await page.goto("/community");
  await expect(page).toHaveURL(/\/verify-email/);
  await page.goto("/apply");
  await expect(page).toHaveURL(/\/verify-email/);
  // Asking again too soon is refused politely.
  await page.getByRole("button", { name: "Send the email again" }).click();
  await expect(page.getByText(/Please wait .* before asking for another email/)).toBeVisible();

  const link = await verifyEmail(page, MEMBERS.A);
  await expect(page.getByRole("heading", { name: /Step 1 of 4/ })).toBeVisible();
  await expect(page.getByText(`Applying as ${MEMBERS.A.name}`)).toBeVisible();
  await a11y(page, "application form");
  // The link cannot be used twice.
  const again = await browser.newPage();
  await again.goto(link);
  await expect(again.getByText(/already used/)).toBeVisible();
  await again.goto("/verify-email/not-a-real-link");
  await expect(again.getByText(/not valid/)).toBeVisible();
  await again.close();
});

test("A2. creating an account twice with the same address does not create a second account or reveal anything", async ({ browser }) => {
  const { page, ctx } = await newSession(browser);
  await register(page, { ...MEMBERS.A, name: "Someone Else" });
  // Same page as for a new account; the owner of the address gets an email instead.
  await expect(page.getByText(MEMBERS.A.email)).toBeVisible();
  expect(mailsTo(MEMBERS.A.email)[0]!.subject).toMatch(/already have an account/);
  await ctx.close();
});

test("B. the application is saved as a draft, resumed after signing in again, and submitted exactly once", async () => {
  const { page } = sessions.A!;
  await page.goto("/apply");
  await fillStep1(page);
  // Stop here and come back later: the draft is still there.
  await signOut(page);
  await signIn(page, MEMBERS.A.email);
  await expect(page).toHaveURL(/\/apply/);
  await expect(page.getByRole("heading", { name: /Step 2 of 4/ })).toBeVisible();
  await page.goto("/apply?step=1");
  await expect(page.getByLabel("What do you do now?")).toHaveValue("Store employee");
  await page.goto("/apply?step=4"); // cannot skip ahead
  await expect(page.getByRole("heading", { name: /Step 2 of 4/ })).toBeVisible();
  await fillStep2(page);
  await fillStep3AndSubmit(page);
  await expect(page.getByText("Application Received")).toBeVisible();
  await expect(page.getByText("No action needed from you")).toBeVisible();
  await a11y(page, "application status");
  expect(mailsTo(MEMBERS.A.email)[0]!.subject).toMatch(/received your application/);
  // Going back or reloading cannot submit again or create another application.
  await page.goto("/apply");
  await expect(page).toHaveURL(/\/application$/);
  // Sign out and in again: the status page is where they land.
  await signOut(page);
  await signIn(page, MEMBERS.A.email);
  await expect(page).toHaveURL(/\/application$/);
  await expect(page.getByText("Application Received")).toBeVisible();
  // Not approved yet: the community is closed, with an explanation instead of an error.
  await page.goto("/community");
  await expect(page).toHaveURL(/\/application$/);
  expect((await page.request.get("/api/files/anything")).status()).toBe(404);
});

test("B2. four more people join and apply", async ({ browser }) => {
  for (const k of ["B", "C", "D", "E"] as const) {
    const s = await newSession(browser);
    sessions[k] = s;
    await register(s.page, MEMBERS[k]);
    await verifyEmail(s.page, MEMBERS[k]);
    await fillStep1(s.page);
    await fillStep2(s.page);
    await fillStep3AndSubmit(s.page);
  }
});

test("C. the administrator reviews, approves and notifies; approval gives the same account community access", async ({ browser }) => {
  const admin = await newSession(browser);
  sessions.admin = admin;
  const { page } = admin;
  await page.goto("/login?next=/admin");
  await page.getByLabel("Email address").fill(E2E.ownerEmail);
  await page.getByLabel("Password", { exact: true }).fill(E2E.password);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/login\/verify/);
  await page.getByLabel("Code").fill(totp());
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

  // Exactly one application per person (5 new ones plus the one from before accounts existed).
  await page.goto("/admin/applications");
  await expect(page.getByText("6 matching applications")).toBeVisible();
  await expect(page.getByRole("link", { name: MEMBERS.A.name })).toHaveCount(1);
  await page.goto("/admin/applications?status=NEW"); // an old bookmark still works
  await expect(page.getByText("6 matching applications")).toBeVisible();

  for (const k of ["A", "B", "C", "D"] as const) {
    await openApplication(page, MEMBERS[k].name);
    await expect(page.getByText("Email confirmed")).toBeVisible();
    await expect(page.getByText("Not a member")).toBeVisible();
    if (k === "A") {
      await a11y(page, "admin application");
      // Approval needs an explicit confirmation.
      await page.getByRole("button", { name: "Approve and Notify" }).click();
      await expect(page.getByText(/Tick the box to confirm the approval/)).toBeVisible();
      await expect(page.getByText("Not a member")).toBeVisible();
    }
    await page.getByLabel(/I confirm: approve/).check();
    await page.getByRole("button", { name: "Approve and Notify" }).click();
    await expect(page.getByText(/Approved\. This person can now enter the member community/)).toBeVisible();
    // Local test email is never presented as a real delivery.
    await expect(page.getByText(/Test email captured locally\. This message was not sent to the recipient's real email inbox\./)).toBeVisible();
    await expect(page.getByText("Active member")).toBeVisible();
    await expect(page.getByText("Accepted", { exact: true })).toBeVisible();
    expect(mailsTo(MEMBERS[k].email)[0]!.subject).toMatch(/your application was accepted/);
  }
  // The waiting list is a status change with an optional email; it gives no access.
  await openApplication(page, MEMBERS.E.name);
  await page.getByLabel("New status").selectOption("WAITLISTED");
  await page.getByLabel(/Also email the applicant/).check();
  await page.getByRole("button", { name: "Update status" }).click();
  await expect(page.getByText(/Status updated\./)).toBeVisible();
  await expect(page.getByText("Not a member")).toBeVisible();
  // The earlier, account-less application is clearly marked.
  await openApplication(page, "Lena Legacy");
  await expect(page.getByText("No account yet").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Email them a request to create an account" })).toBeVisible();
});

test("C2. approved people enter the community with the email and password they already had", async () => {
  // A is still signed in from before the approval: the status page now offers the community.
  const a = sessions.A!.page;
  await a.goto("/application");
  await expect(a.getByText("Accepted", { exact: true })).toBeVisible();
  await a.getByRole("link", { name: "Enter the Community" }).click();
  await expect(a.getByRole("heading", { name: "Business Ideas", level: 1 })).toBeVisible();
  await expect(a.getByText(`Welcome, ${MEMBERS.A.display}.`)).toBeVisible();
  await a11y(a, "community home");
  // B signs in fresh with the original password and lands in the community: no second account, no activation step.
  const b = sessions.B!.page;
  await signOut(b);
  await signIn(b, MEMBERS.B.email);
  await expect(b).toHaveURL(/\/community$/);
  for (const k of ["C", "D"] as const) {
    await sessions[k]!.page.goto("/continue");
    await expect(sessions[k]!.page).toHaveURL(/\/community$/);
  }
});

test("D. waitlisted and declined applicants can sign in and see their status, but cannot enter the community", async () => {
  const e = sessions.E!.page;
  await signOut(e);
  await signIn(e, MEMBERS.E.email);
  await expect(e).toHaveURL(/\/application$/);
  await expect(e.getByText("Waitlisted", { exact: true })).toBeVisible();
  await expect(e.getByText(/waiting list for now/)).toBeVisible();
  for (const path of ["/community", "/community/ideas/new", "/community/groups"]) {
    await e.goto(path);
    await expect(e, path).toHaveURL(/\/application$/);
  }
  expect((await e.request.get("/api/files/anything")).status()).toBe(404);
  // The admin area is not theirs: they are sent back to their own page (no error page, nothing shown).
  await e.goto("/admin");
  await expect(e).toHaveURL(/\/application$/);
  await e.goto("/admin/members");
  await expect(e).toHaveURL(/\/application$/);

  const admin = sessions.admin!.page;
  await openApplication(admin, MEMBERS.E.name);
  await admin.getByLabel("New status").selectOption("DECLINED");
  await admin.getByRole("button", { name: "Update status" }).click();
  await expect(admin.getByText(/Status updated\./)).toBeVisible();

  await e.goto("/application");
  await expect(e.getByText("Declined", { exact: true })).toBeVisible();
  await expect(e.getByRole("link", { name: "Start a new application" })).toBeVisible();
  await expect(e.getByRole("link", { name: "Enter the Community" })).toHaveCount(0);
  await e.goto("/community");
  await expect(e).toHaveURL(/\/application$/);
});

test("E. an email outage loses nothing: the account is kept, the problem is explained, and resending works afterwards", async ({ browser }) => {
  await stopMail();
  const s = await newSession(browser);
  sessions.F = s;
  const { page } = s;
  await page.goto("/join");
  await page.getByLabel("Full name").fill(MEMBERS.F.name);
  await page.getByLabel("Email address").fill(MEMBERS.F.email);
  await page.getByLabel("Password", { exact: true }).fill(E2E.password);
  await page.getByLabel("Confirm password").fill(E2E.password);
  for (const consent of ["acceptTerms", "acceptGuidelines", "ackPrivacy"]) await page.locator(`input[name="${consent}"]`).check();
  await page.getByRole("button", { name: "Create Account" }).click();
  await expect(page.getByText(/Your account was saved, but we could not send the email right now/)).toBeVisible();
  expect(mailsTo(MEMBERS.F.email)).toHaveLength(0);
  // The account exists: signing in works and resending still fails with a clear message.
  await signIn(page, MEMBERS.F.email);
  await expect(page).toHaveURL(/\/verify-email/);
  await page.getByRole("button", { name: "Send the email again" }).click();
  await expect(page.getByText(/We could not send the email/)).toBeVisible();
  // The administrator sees the failed attempts, clearly labeled.
  const admin = sessions.admin!.page;
  await admin.goto("/admin/email?filter=problems");
  await expect(admin.getByText("Not sent: email server unreachable").first()).toBeVisible();

  await startMail();
  await page.getByRole("button", { name: "Send the email again" }).click();
  await expect(page.getByText(/We sent a new confirmation link/)).toBeVisible();
  await verifyEmail(page, MEMBERS.F);
  await fillStep1(page);
  await fillStep2(page);
  await fillStep3AndSubmit(page);
  await expect(page.getByText("Application Received")).toBeVisible();
});

test("F. password recovery through email; used and invalid links are refused", async ({ browser }) => {
  const { page, ctx } = await newSession(browser);
  await page.goto("/login");
  await page.getByRole("link", { name: "Forgot Password?" }).click();
  // The answer is the same for unknown addresses.
  await page.getByLabel("Email").fill("nobody@e2e.test");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText(/If an active account exists/)).toBeVisible();
  expect(mailsTo("nobody@e2e.test")).toHaveLength(0);
  await page.reload();
  await page.getByLabel("Email").fill(MEMBERS.F.email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText(/If an active account exists/)).toBeVisible();
  await expect.poll(() => mailsTo(MEMBERS.F.email)[0]?.subject ?? "").toMatch(/reset your password/);
  const link = linkIn(latestMail(MEMBERS.F.email), "reset-password");
  expect(link).toBeTruthy();
  await page.goto(link!);
  const NEW_PASSWORD = "a-new-strong-password-77";
  await page.getByLabel("New password", { exact: true }).fill(NEW_PASSWORD);
  await page.getByLabel("Repeat the new password").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page.getByText("Your password was changed.")).toBeVisible();
  // The old password stops working, the new one works, and existing sessions were ended.
  await signIn(page, MEMBERS.F.email);
  await expect(page.getByText("Invalid email or password.")).toBeVisible();
  await signIn(page, MEMBERS.F.email, NEW_PASSWORD);
  await expect(page).toHaveURL(/\/application$/);
  await sessions.F!.page.goto("/application");
  await expect(sessions.F!.page).toHaveURL(/\/login/);
  // A used link and a made-up link are refused.
  await page.goto(link!);
  await expect(page.getByText(/not valid|expired|already used/).first()).toBeVisible();
  await page.goto("/reset-password/not-a-real-link");
  await expect(page.getByText(/not valid|expired|already used/).first()).toBeVisible();
  await ctx.close();
});

test("5. Member A publishes a business idea", async () => {
  const { page } = sessions.A!;
  await page.goto("/community");
  await page.getByRole("link", { name: "Propose a Business Idea" }).click();
  await page.getByLabel("Idea title").fill(IDEA);
  await page.getByLabel("What is the idea?").fill("Small shops in our towns need affordable, reliable monthly bookkeeping done remotely.");
  await page.getByLabel("How might it make money?").fill("A flat monthly fee paid by each shop.");
  await page.getByLabel("Which area fits best?").selectOption("ONLINE_SERVICES");
  await page.getByLabel("I understand who can see my idea and that it is not confidential.").check();
  await page.getByRole("button", { name: "Publish idea" }).click();
  await expect(page.getByRole("heading", { name: IDEA })).toBeVisible();
  await expect(page.getByText("Your idea is published.")).toBeVisible();
  await expect(page.getByText("A flat monthly fee paid by each shop.")).toBeVisible();
  await a11y(page, "idea page");
});

test("6–8. Member B endorses; no group exists yet", async () => {
  const { page } = sessions.B!;
  await page.goto("/community");
  await expect(page.getByText("Needs 2 more supporters")).toBeVisible();
  await page.getByRole("link", { name: IDEA }).click();
  await expect(page.getByText(/automatically becomes a group member/)).toBeVisible();
  await page.getByRole("button", { name: "Support this idea" }).click();
  await expect(page.getByText("Your support was recorded.")).toBeVisible();
  await expect(page.getByText(/1\s*of 2 supporters needed/)).toBeVisible();
  await expect(page.getByText("You support this idea")).toBeVisible();
  await page.goto("/community/groups");
  await expect(page.getByText("No project groups yet")).toBeVisible();
});

test("9–13. Member C endorses; exactly one group is created with A, B and C", async () => {
  const { page } = sessions.C!;
  await page.goto("/community");
  await expect(page.getByText("Needs 1 more supporter")).toBeVisible();
  await page.getByRole("button", { name: `Support “${IDEA}”` }).click();
  await expect(page.getByText(/a project group has been created and you are a founding member/)).toBeVisible();
  groupUrl = new URL(page.url()).pathname;
  await page.goto("/community/groups");
  await expect(page.getByRole("link", { name: IDEA })).toHaveCount(1);
  await page.goto(`${groupUrl}/members`);
  const main = page.locator("#main");
  for (const k of ["A", "B", "C"] as const) await expect(main.getByRole("link", { name: MEMBERS[k].display, exact: true })).toBeVisible();
  await expect(page.getByText("Coordinator", { exact: true })).toBeVisible();
  await a11y(page, "group members");
});

test("14–15. real-time chat between independent sessions, persistent after reload", async () => {
  const a = sessions.A!.page;
  const c = sessions.C!.page;
  await a.goto(`${groupUrl}/chat`);
  await c.goto(`${groupUrl}/chat`);
  await expect(a.getByTestId("chat-status")).toHaveText(/Connected/);
  await expect(c.getByTestId("chat-status")).toHaveText(/Connected/);
  await a.getByLabel("Message").fill("Hello team, shall we start with market research?");
  await a.getByRole("button", { name: "Send" }).click();
  await expect(c.getByTestId("chat-messages").getByText("Hello team, shall we start with market research?")).toBeVisible();
  await c.getByLabel("Message").fill("Yes! I will list local competitors.");
  await c.keyboard.press("Enter");
  await expect(a.getByTestId("chat-messages").getByText("Yes! I will list local competitors.")).toBeVisible();
  await c.reload();
  await expect(c.getByTestId("chat-messages").getByText("Hello team, shall we start with market research?")).toBeVisible();
  await expect(c.getByTestId("chat-messages").getByText("Yes! I will list local competitors.")).toBeVisible();
});

test("16–18. members start and join meetings (Google Meet links)", async () => {
  const a = sessions.A!.page;
  const c = sessions.C!.page;
  for (const [round, url] of [
    [1, "https://meet.google.com/abc-defg-hij"],
    [2, "https://meet.google.com/xyz-uvwx-rst"],
  ] as const) {
    await a.goto(`${groupUrl}/meetings`);
    await a.getByLabel("Paste the Google Meet link").fill(url);
    await a.getByRole("button", { name: "Start Meeting" }).click();
    await expect(a.getByText("In progress", { exact: true })).toBeVisible();
    await expect(a.getByRole("heading", { name: "Meeting", exact: true })).toBeVisible();
    // Other members see it on the group overview and on the Meetings tab.
    await c.goto(groupUrl);
    await expect(c.getByText(/meeting is happening now/)).toBeVisible();
    await c.goto(`${groupUrl}/meetings`);
    await expect(c.getByRole("button", { name: "Join Meeting" })).toBeVisible();
    // Joining records attendance and redirects to the Meet link.
    const [req] = await Promise.all([c.waitForRequest((r) => r.url().startsWith(url)).catch(() => null), c.getByRole("button", { name: "Join Meeting" }).click()]);
    expect(req?.url().startsWith(url)).toBe(true);
    await a.goto(`${groupUrl}/meetings`);
    if (round === 1) await a11y(a, "meeting in progress");
    await a.getByRole("button", { name: "End meeting" }).click();
    await expect(a.getByRole("button", { name: "Start Meeting" })).toBeVisible();
  }
});

test("19. a shared research note and task are created", async () => {
  const a = sessions.A!.page;
  await a.goto(`${groupUrl}/research`);
  // The add-note form starts open while the group has no notes.
  await a.getByLabel("Topic").selectOption("MARKET");
  await a.locator("#n-title").fill("Competitors in town");
  await a.locator("#n-body").fill("Two local firms charge $300/month; none offer weekend service.");
  await a.getByRole("button", { name: "Add note" }).click();
  await expect(a.getByRole("heading", { name: "Market research" })).toBeVisible();
  await expect(a.getByText("Competitors in town")).toBeVisible();
  await a.getByText("Add a task").click();
  await a.getByLabel("Task", { exact: true }).fill("Call five shop owners");
  await a.getByRole("button", { name: "Add task" }).click();
  await expect(a.getByText("Call five shop owners")).toBeVisible();
  await a11y(a, "shared research");
  // The task shows up as a next step on the group overview.
  await a.goto(groupUrl);
  await expect(a.getByRole("heading", { name: "Next steps" })).toBeVisible();
  await expect(a.getByText("Call five shop owners")).toBeVisible();
});

test("20–26. Member D discovers the group; private areas open only while a member", async () => {
  const d = sessions.D!.page;
  await d.goto("/community/groups");
  await d.getByRole("link", { name: IDEA }).click();
  await expect(d.getByRole("heading", { name: IDEA })).toBeVisible();
  for (const tab of ["chat", "research", "files", "meetings"]) {
    await d.goto(`${groupUrl}/${tab}`);
    await expect(d.getByTestId("members-only")).toBeVisible();
  }
  await expect(d.getByText("Hello team")).toHaveCount(0);
  await d.goto(groupUrl);
  await d.getByRole("button", { name: "Join group" }).first().click();
  await expect(d.getByText(/You joined the group/)).toBeVisible();
  await d.goto(`${groupUrl}/chat`);
  await expect(d.getByTestId("chat-messages").getByText("Hello team, shall we start with market research?")).toBeVisible();
  await d.goto(`${groupUrl}/research`);
  await expect(d.getByText("Competitors in town")).toBeVisible();

  // Leaving revokes access immediately, including an open chat tab.
  const live = await sessions.D!.ctx.newPage();
  await live.goto(`${groupUrl}/chat`);
  await expect(live.getByTestId("chat-status")).toHaveText(/Connected/);
  await d.goto(groupUrl);
  await d.getByRole("button", { name: "Leave group" }).click();
  await expect(d.getByText("Leave this group?")).toBeVisible();
  await d.getByRole("button", { name: "Yes, leave group" }).click();
  await expect(d.getByText(/You left the group/)).toBeVisible();
  await expect(d.getByText(/Your account is still active/)).toBeVisible();
  await expect(live.getByText("You no longer have access to this chat.")).toBeVisible();
  await live.close();
  await d.goto(`${groupUrl}/chat`);
  await expect(d.getByTestId("members-only")).toBeVisible();
});

test("27. moderation and audit: a report is reviewed by the administrator", async () => {
  const d = sessions.D!.page;
  await d.goto("/community/ideas");
  // The card links to the idea (title) and to its group (same name); the first is the idea.
  await d.getByRole("link", { name: IDEA }).first().click();
  await d.getByText("Report idea").click();
  await d.getByLabel("Reason").selectOption("SPAM");
  await d.getByRole("button", { name: "Send report" }).click();
  await expect(d.getByText(/report was sent/)).toBeVisible();

  const admin = sessions.admin!.page;
  await admin.goto("/admin/reports");
  await expect(admin.getByText(IDEA).first()).toBeVisible();
  await admin.getByLabel(/Note/).first().fill("Legitimate idea; not spam.");
  await admin.getByRole("button", { name: "Dismiss" }).click();
  await expect(admin.getByText(/Report handled/)).toBeVisible();
  await admin.goto("/admin/audit");
  await expect(admin.getByText("moderation.dismiss")).toBeVisible();
  await expect(admin.getByText("group.auto_created")).toBeVisible();
  await a11y(admin, "admin audit");
});

test("28. existing application and project features still work", async () => {
  const admin = sessions.admin!.page;
  await admin.goto("/admin/applications");
  await expect(admin.getByText(MEMBERS.A.name)).toBeVisible();
  await admin.goto("/admin/projects");
  await expect(admin.getByRole("heading", { name: "Earlier project records" })).toBeVisible();
  await admin.goto("/admin/groups");
  await admin.getByRole("link", { name: IDEA }).click();
  await expect(admin.getByText(/Private chat messages and files are not shown/)).toBeVisible();
});

test("29. Twigo: the group plans a project, every participant accepts its agreement, and work starts", async () => {
  const [a, b, c] = [sessions.A!.page, sessions.B!.page, sessions.C!.page];
  await a.goto(`${groupUrl}/projects`);
  await a11y(a, "group projects");
  await a.getByLabel("Project name").fill("Bookkeeping pilot");
  await a.getByLabel("Business objective").fill("Monthly bookkeeping for three local shops, for six months.");
  await a.getByRole("button", { name: "Create project" }).click();
  await expect(a.getByText("Project created. Next: draft its agreement.")).toBeVisible();
  const projectUrl = new URL(a.url()).pathname;
  await expect(a.getByText(/is not a party to this project and receives no share, commission or fee/)).toBeVisible();

  // The coordinator writes the terms; nothing is preset.
  await a.getByLabel("5. Contracting arrangement").selectOption("PROJECT_REPRESENTATIVE");
  await a.getByLabel("Compensation method").selectOption("CONTRIBUTION");
  const terms: [string, string][] = [
    ["1. Project scope", "Monthly ledgers for three shops."],
    ["6. Who receives customer payments", "Member A, who passes on each share within 7 days."],
    ["8a. Gross customer receipts", "Everything the shops pay for the service."],
    ["8b. Taxes and mandatory deductions", "Each participant handles their own taxes."],
    ["8c. Refunds and chargebacks", "Shared in the same proportion as revenue."],
    ["8d. Net distributable project revenue", "Gross receipts minus refunds and approved expenses."],
    ["9. Revenue distribution formula", "In proportion to recorded hours."],
    ["10. Payment schedule", "Monthly, after the shops pay."],
    ["12. Intellectual property", "Each keeps their own templates; ledgers belong to the shops."],
    ["13. Confidentiality", "Shop data stays within the project."],
    ["14. Withdrawal and termination", "Two weeks notice; work done until then is paid."],
    ["15. Dispute resolution", "Discuss in the group first, then an agreed mediator."],
  ];
  for (const [label, value] of terms) await a.getByLabel(label).fill(value);
  const include = a.locator('input[name$="_include"]');
  await expect(include).toHaveCount(3);
  for (let i = 0; i < 3; i++) {
    await include.nth(i).check();
    await a.locator('textarea[name$="_responsibilities"]').nth(i).fill("Prepares the ledgers for one shop.");
    await a.locator('textarea[name$="_compensation"]').nth(i).fill(`Share by hours, participant ${i + 1}`);
  }
  await a.getByRole("button", { name: "Save draft" }).click();
  await expect(a.getByText(/Draft saved\. Nothing is binding/)).toBeVisible();
  await a.getByRole("button", { name: "Ask the participants to accept this version" }).click();
  await expect(a.getByText("The participants were asked to review and accept this version.")).toBeVisible();
  // Not commercially active before everyone accepted.
  await a.reload();
  await expect(a.getByText("Waiting for acceptance: version 1")).toBeVisible();

  for (const [page, name] of [[a, "A"], [b, "B"], [c, "C"]] as const) {
    if (page !== a) await page.goto(projectUrl);
    await page.getByLabel(/I have read version 1/).check();
    await page.getByRole("button", { name: "Accept this version" }).click();
    await expect(page.getByText("Your acceptance was recorded."), `acceptance by ${name}`).toBeVisible();
  }
  await a.reload();
  await expect(a.getByText("Agreement in force: version 1")).toBeVisible();
  await a11y(a, "project agreement");
  // The copy contains the exact text, its fingerprint and three acceptances.
  const href = await a.getByRole("link", { name: "Download a copy" }).getAttribute("href");
  const copy = await a.request.get(href!);
  expect(copy.status()).toBe(200);
  const body = await copy.text();
  expect(body).toMatch(/SHA-256 fingerprint of the agreement text below: [0-9a-f]{64}/);
  expect(body.match(/accepted \d{4}-/g)).toHaveLength(3);
  await a.getByRole("button", { name: "Start commercial work" }).click();
  await expect(a.getByText("The project is commercially active under the accepted agreement.")).toBeVisible();
});

test("30. Twigo: new owner and member pages open and pass the accessibility check", async () => {
  const owner = sessions.admin!.page;
  for (const p of ["/admin/legal", "/admin/legal/terms", "/admin/legal/notices", "/admin/legal/acceptances", "/admin/agreements", "/admin/support", "/admin/privacy-requests", "/admin/email"]) {
    await owner.goto(p);
    await expect(owner, p).toHaveURL(new RegExp(`${p}$`));
    await a11y(owner, p);
  }
  // Acceptances recorded by the browser tests above (registrations and supporting the idea) are listed.
  await owner.goto("/admin/legal/acceptances");
  await expect(owner.getByText("registration").first()).toBeVisible();
  await expect(owner.getByText("idea-support").first()).toBeVisible();
  // The owner sees the group project and its acceptance count.
  await owner.goto("/admin/agreements");
  await expect(owner.getByText("Bookkeeping pilot")).toBeVisible();
  await expect(owner.getByText("3 of 3")).toBeVisible();
  const member = sessions.B!.page;
  for (const p of ["/account/agreements", "/account/data", "/legal", "/support"]) {
    await member.goto(p);
    await a11y(member, p);
  }
  await member.goto("/account/agreements");
  await expect(member.getByRole("link", { name: /Terms of Use/ }).first()).toBeVisible();
});

test("navigation: three main areas, account menu and help", async () => {
  const page = sessions.C!.page;
  await page.goto("/community");
  const nav = page.getByRole("navigation", { name: "Community", exact: true });
  await expect(nav.getByRole("link")).toHaveText(["Business Ideas", "Explore Groups", "My Groups"]);
  await expect(nav.getByRole("link", { name: "Business Ideas" })).toHaveAttribute("aria-current", "page");
  // A group the member belongs to is part of "My Groups".
  await page.goto(groupUrl);
  await expect(nav.getByRole("link", { name: "My Groups" })).toHaveAttribute("aria-current", "page");
  await page.goto("/community/groups/mine");
  await expect(page.getByRole("link", { name: IDEA })).toBeVisible();
  // Profile, settings and help are in the account menu.
  await page.locator("summary", { hasText: "Open account menu" }).click();
  await expect(page.getByRole("link", { name: "My Profile" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Account Settings" })).toBeVisible();
  await page.getByRole("link", { name: "Help" }).click();
  await expect(page.getByRole("heading", { name: "How it works" })).toBeVisible();
  await a11y(page, "help");
  await page.goto("/community/groups");
  await a11y(page, "explore groups");
  // Old links keep working.
  await page.goto("/community/ideas");
  await expect(page).toHaveURL(/\/community$/);
  await page.goto(`${groupUrl}/files`);
  await expect(page).toHaveURL(new RegExp(`${groupUrl}/research`));
});

test("security: unauthenticated and member access to private areas is refused", async ({ browser }) => {
  const anon = await browser.newPage();
  for (const p of ["/community", "/admin", groupUrl, "/account", "/application"]) {
    await anon.goto(p);
    await expect(anon).toHaveURL(/\/login/);
  }
  // The application form sends visitors to account creation first.
  await anon.goto("/apply");
  await expect(anon).toHaveURL(/\/join$/);
  const r = await anon.request.get("/api/files/does-not-exist");
  expect(r.status()).toBe(404);
  await anon.close();
  // A member who opens an admin address is sent back to the community (no error page, nothing shown).
  const m = sessions.B!.page;
  for (const p of ["/admin", "/admin/applications", "/admin/settings"]) {
    await m.goto(p);
    await expect(m, p).toHaveURL(/\/community$/);
  }
});

test("public pages and mobile layouts", async ({ browser }) => {
  // Reduced motion: scroll-reveal fade-ins would otherwise be scanned mid-animation.
  const ctx = await browser.newContext({ reducedMotion: "reduce" });
  const page = await ctx.newPage();
  const PUBLIC = ["/", "/how-it-works", "/about", "/compensation", "/participation", "/founding-contributors", "/faq", "/contact", "/work-with-us", "/support", "/legal", "/legal/terms", "/legal/privacy", "/legal/community-guidelines", "/legal/notices", "/join", "/login", "/forgot-password", "/verify-email"];
  for (const p of PUBLIC) {
    await page.goto(p, { waitUntil: "networkidle" });
    await a11y(page, p);
  }
  // The header shows only the main pages; everything else is in the footer.
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link")).toHaveText(["How It Works", "About", "Pay & Fairness", "FAQ"]);
  for (const label of ["For Businesses", "Contact", "Community Support", "Terms of Use", "Privacy Policy", "Community Guidelines"]) {
    await expect(page.getByRole("contentinfo").getByRole("link", { name: label })).toBeVisible();
  }
  // Public pages fit a phone screen without sideways scrolling, and the phone menu works.
  await page.setViewportSize({ width: 375, height: 812 });
  for (const p of PUBLIC) {
    await page.goto(p);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `horizontal overflow on ${p}`).toBeLessThanOrEqual(1);
  }
  await page.goto("/");
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByText("More pages").click();
  await expect(page.getByRole("navigation", { name: "Mobile" }).getByRole("link", { name: "For Businesses" })).toBeVisible();
  await ctx.close();
  const phone = await sessions.C!.ctx.newPage();
  await phone.setViewportSize({ width: 390, height: 844 });
  for (const p of ["/community", "/community/ideas/new", "/community/groups", "/community/groups/mine", "/community/help", groupUrl, `${groupUrl}/meetings`, `${groupUrl}/research`, `${groupUrl}/chat`]) {
    await phone.goto(p);
    const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `horizontal overflow on ${p}`).toBeLessThanOrEqual(1);
  }
  await expect(phone.getByRole("navigation", { name: "Community (mobile)" })).toBeVisible();
  await expect(phone.getByTestId("chat-messages").getByText("Yes! I will list local competitors.")).toBeVisible();
  // The message box is on screen (not hidden under the bottom navigation).
  const box = await phone.getByLabel("Message").boundingBox();
  const nav = await phone.getByRole("navigation", { name: "Community (mobile)" }).boundingBox();
  expect(box && nav && box.y + box.height <= nav.y).toBe(true);
  await phone.screenshot({ path: "test-results/mobile-chat.png" });
  // The joining pages work on a phone too (E is a declined applicant, so both pages are open to them).
  const applicantPhone = await sessions.E!.ctx.newPage();
  await applicantPhone.setViewportSize({ width: 375, height: 812 });
  for (const p of ["/application", "/apply", "/account"]) {
    await applicantPhone.goto(p);
    const overflow = await applicantPhone.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `horizontal overflow on ${p}`).toBeLessThanOrEqual(1);
  }
  await applicantPhone.close();
  await phone.close();
});
