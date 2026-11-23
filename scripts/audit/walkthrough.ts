/**
 * STAGE 4 WALKTHROUGH (local, separate demo database only).
 *
 * Goes through the site role by role in a real browser, the way people would use it, and records
 * every step with a result line and a screenshot. It covers the paths the browser tests do not
 * already cover (see docs/ROLE-WALKTHROUGH.md for the full list and for which test covers the rest).
 *
 * It CHANGES data, so it must only run against a throw-away demo database:
 *   bash scripts/audit/walkthrough-run.sh
 * which seeds "cowork_walk_demo", starts a mail catcher and a server, runs this file, and stops both.
 *
 *   AUDIT_URL=http://127.0.0.1:3400 WALK_MAIL_DIR=.walk-mail npx tsx scripts/audit/walkthrough.ts <screenshot folder>
 */
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { Secret, TOTP } from "otpauth";
import { DEMO } from "../demo-config";

const BASE = process.env.AUDIT_URL ?? "http://127.0.0.1:3400";
const OUT = process.argv[2] ?? "walkthrough-out";
const MAIL = process.env.WALK_MAIL_DIR ?? ".walk-mail";
const GROUP = "/community/groups/bookkeeping-help-for-small-local-shops";
const ADMIN = { name: "Ada Admin", email: "ada.admin@demo.test", password: "walkthrough-admin-pass-42" };

/** A real, tiny PNG image (1 x 1 pixel). */
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

type Row = { role: string; step: string; ok: boolean; detail: string; shot?: string };
const rows: Row[] = [];
let shotNo = 0;
let role = "";

// ------------------------------------------------------------------ helpers

function mailsTo(to: string) {
  const files = readdirSync(MAIL).filter((f) => f.endsWith(".json")).sort().reverse();
  const out: { subject: string; text: string }[] = [];
  for (const f of files) {
    const meta = JSON.parse(readFileSync(path.join(MAIL, f), "utf8")) as { to: string[]; subject: string };
    if (meta.to.includes(to)) out.push({ subject: meta.subject, text: readFileSync(path.join(MAIL, f.replace(".json", ".eml")), "utf8").replace(/=\r?\n/g, "").replace(/=3D/g, "=") });
  }
  return out;
}
const linkIn = (text: string, route: string) => new RegExp(`(${BASE.replace(/[.:/]/g, (c) => `\\${c}`)}/${route}/[A-Za-z0-9_-]+)`).exec(text)?.[1];
const code = (secret: string) => new TOTP({ secret: Secret.fromBase32(secret), digits: 6, period: 30 }).generate();
const visible = async (p: Page) => (await p.locator("main").first().innerText().catch(() => "")) || (await p.locator("body").innerText());

async function shot(p: Page, name: string, full = false) {
  const file = `${String(++shotNo).padStart(2, "0")}-${name}.png`;
  await p.screenshot({ path: path.join(OUT, file), fullPage: full });
  return file;
}

/** One step: runs `fn`; a thrown error or a false check is a failed step. Never stops the walkthrough. */
async function step(name: string, fn: () => Promise<string | void>, opts: { page?: Page; shotName?: string; full?: boolean } = {}) {
  let ok = true;
  let detail = "";
  try {
    detail = (await fn()) ?? "";
  } catch (e) {
    ok = false;
    detail = String((e as Error).message ?? e).split("\n")[0]!.slice(0, 220);
  }
  let file: string | undefined;
  if (opts.page && (opts.shotName || !ok)) file = await shot(opts.page, `${role.toLowerCase().replace(/[^a-z]+/g, "-")}-${opts.shotName ?? "FAILED-" + name.slice(0, 30).replace(/[^a-z0-9]+/gi, "-")}`, opts.full).catch(() => undefined);
  rows.push({ role, step: name, ok, detail, shot: file });
  console.log(`${ok ? "ok  " : "FAIL"} [${role}] ${name}${detail ? ` — ${detail}` : ""}`);
}
function must(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}
async function expectText(p: Page, text: string | RegExp, timeout = 15000) {
  await p.getByText(text).first().waitFor({ state: "visible", timeout });
}

/** Requests of each page that have started and not finished (named in the error when a page does not load). */
const openRequests = new WeakMap<Page, Map<object, string>>();
async function session(b: Browser): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  const open = new Map<object, string>();
  openRequests.set(page, open);
  page.on("request", (r) => open.set(r, `${r.method()} ${r.url().replace(BASE, "")}`));
  page.on("requestfinished", (r) => open.delete(r));
  page.on("requestfailed", (r) => open.delete(r));
  return { ctx, page };
}
async function signIn(p: Page, email: string, password = DEMO.password, totpSecret?: string) {
  await p.goto(`${BASE}/login`);
  await p.getByLabel("Email address").fill(email);
  await p.getByLabel("Password", { exact: true }).fill(password);
  await p.getByRole("button", { name: "Sign In" }).click();
  await p.waitForURL((u) => u.pathname !== "/login", { timeout: 20000 });
  if (p.url().includes("/login/verify")) {
    must(totpSecret, "a code was asked for, but this account has no known secret");
    await p.getByLabel("Code").fill(code(totpSecret));
    await p.getByRole("button", { name: "Verify" }).click();
    await p.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });
  }
}
async function go(p: Page, url: string) {
  try {
    await p.goto(BASE + url, { waitUntil: "load", timeout: 30000 });
  } catch (e) {
    const still = [...(openRequests.get(p)?.values() ?? [])].slice(0, 6).join(", ");
    const reason = String((e as Error).message).split(/\r?\n/)[0];
    throw new Error(`${url} did not finish loading; still open: ${still || "nothing"} (${reason})`);
  }
  await p.waitForLoadState("networkidle", { timeout: 4000 }).catch(() => {});
}
/** Submits the form that contains the field `fieldName` (for admin forms whose buttons share names). */
const formWith = (p: Page, selector: string) => p.locator("form", { has: p.locator(selector) });

async function fillApplication(p: Page) {
  await p.getByLabel("Country").fill("Canada");
  await p.getByLabel("State or region").fill("Ontario");
  await p.getByLabel("What do you do now?").fill("Office assistant");
  await p.getByRole("button", { name: "Save and continue" }).click();
  await expectText(p, /Step 2 of 4/);
  await p.getByLabel("Your skills and abilities").fill("Data entry, customer support");
  await p.locator("#wc-GENERAL_REMOTE").check();
  await p.getByLabel("About how many hours a week could you give?").selectOption("5");
  await p.getByRole("button", { name: "Save and continue" }).click();
  await expectText(p, /Step 3 of 4/);
  await p.getByLabel(/Why do you want to take part/).fill("I want to work with others on real projects and learn along the way.");
  await p.getByLabel("What do you think you can contribute?").fill("Careful, reliable work and clear communication.");
  await p.getByRole("button", { name: "Save and review" }).click();
  await expectText(p, /Step 4 of 4/);
  await p.locator('input[name="confirm"]').check();
  await p.getByRole("button", { name: "Submit application" }).click();
  await expectText(p, "Your application was received and saved.");
}
async function openApplicationOf(p: Page, name: string) {
  await go(p, "/admin/applications");
  await p.getByRole("link", { name }).first().click();
  await p.waitForURL(/\/admin\/applications\/[a-z0-9]+/);
}

// ------------------------------------------------------------------ the walkthrough

(async () => {
  mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ channel: "msedge" });
  const owner = await session(b);
  await signIn(owner.page, DEMO.ownerEmail, DEMO.password, DEMO.totpSecret);
  const op = owner.page;

  // ================================================================ VISITOR
  role = "Visitor";
  const visitor = await session(b);
  const vp = visitor.page;
  for (const [url, heading] of [
    ["/", /Work Together/],
    ["/how-it-works", /Three simple parts/],
    ["/about", /Why this organization exists/],
    ["/compensation", /Fair results from real work/],
    ["/participation", /Ways to contribute/],
    ["/founding-contributors", /Help build the organization/],
    ["/faq", /Frequently asked questions/],
    ["/work-with-us", /./],
    ["/community-rules", /./],
    ["/privacy", /./],
    ["/terms", /./],
  ] as const) {
    await step(`opens ${url}`, async () => {
      const res = await vp.goto(BASE + url);
      must(res?.status() === 200, `status ${res?.status()}`);
      await vp.getByRole("heading", { level: 1, name: heading }).waitFor({ timeout: 10000 });
    }, { page: vp, shotName: url === "/" ? "home" : undefined, full: url === "/" });
  }
  await step("meetings are described as Google Meet, with no built-in voice or video promised", async () => {
    await go(vp, "/how-it-works");
    const t = await visible(vp);
    must(/Google Meet/.test(t), "Google Meet is not named");
    for (const p of ["/", "/how-it-works", "/faq", "/about"]) {
      await go(vp, p);
      must(!/built-in (voice|video)|voice and video calls in the app|in-app (voice|video)/i.test(await visible(vp)), `promise of built-in calls on ${p}`);
    }
  });
  await step("revenue wording matches the founder's decision", async () => {
    await go(vp, "/compensation");
    const t = await visible(vp);
    for (const s of ["There is no fixed organizational percentage.", "There are no undisclosed deductions.", "No membership fee is required, ever."]) must(t.includes(s), `missing: ${s}`);
    must(!/\d+\s?%/.test(t), "a percentage is published");
  }, { page: vp, shotName: "pay-and-fairness", full: true });
  await step("sends a message through the contact form", async () => {
    await go(vp, "/contact");
    await vp.getByLabel("Name").fill("Valerie Visitor");
    await vp.getByLabel("Email").fill("valerie@demo.test");
    await vp.getByLabel("Inquiry type").selectOption({ index: 1 });
    await vp.getByLabel("Subject").fill("Question from the walkthrough");
    await vp.getByLabel("Message").fill("Hello, I would like to know how projects are chosen. Thank you.");
    // The form refuses answers sent within 3 seconds of opening it (a check against robots); a person takes longer.
    await vp.waitForTimeout(3500);
    await vp.getByRole("button", { name: /Send/ }).click();
    await expectText(vp, "Thank you. Your message has been received and will be read by a member of the team.");
  }, { page: vp, shotName: "contact-sent" });
  await visitor.ctx.close();

  // ================================================================ APPLICANT
  role = "Applicant";
  const nina = await session(b);
  const np = nina.page;
  await step("Nina (account, no application) signs in and is offered the application", async () => {
    await signIn(np, "nina@demo.test");
    await go(np, "/application");
    await expectText(np, "Application Not Started");
  }, { page: np, shotName: "not-started" });
  await step("fills in and submits the application", async () => {
    await go(np, "/apply");
    await fillApplication(np);
    await expectText(np, "Application Received");
  }, { page: np, shotName: "received" });
  await step("the administrator asks for an interview; Nina sees the details", async () => {
    await openApplicationOf(op, "Nina Novak");
    await op.getByLabel("New status").selectOption("UNDER_REVIEW");
    await op.getByRole("button", { name: "Update status" }).click();
    await expectText(op, /Status updated\./);
    await op.getByLabel("New status").selectOption("INTERVIEW_REQUESTED");
    const details = op.locator('textarea[name="interviewDetails"]');
    if (await details.count()) await details.fill("A short video call on Tuesday at 10:00. Reply with another time if that does not suit you.");
    await op.getByRole("button", { name: "Update status" }).click();
    await expectText(op, /Status updated\./);
    await go(np, "/application");
    await expectText(np, "Interview details");
  }, { page: np, shotName: "interview" });
  await step("waitlisted, then declined: Nina can see it and may apply again, but cannot enter", async () => {
    await op.getByLabel("New status").selectOption("WAITLISTED");
    await op.getByRole("button", { name: "Update status" }).click();
    await expectText(op, /Status updated\./);
    await go(np, "/application");
    await expectText(np, "Waitlisted");
    await op.getByLabel("New status").selectOption("DECLINED");
    await op.getByRole("button", { name: "Update status" }).click();
    await expectText(op, /Status updated\./);
    await go(np, "/application");
    await expectText(np, "Declined");
    await go(np, "/community");
    must(new URL(np.url()).pathname === "/application", `a declined applicant reached ${np.url()}`);
  }, { page: np, shotName: "declined" });
  await step("re-applies after the decline", async () => {
    await go(np, "/application");
    await np.getByRole("link", { name: "Start a new application" }).click();
    await np.waitForURL(/\/apply/);
    await fillApplication(np);
    await expectText(np, "Application Received");
  }, { page: np, shotName: "re-applied" });
  await nina.ctx.close();

  const omar = await session(b);
  const om = omar.page;
  await step("Omar's application is approved; the same account opens the community", async () => {
    await openApplicationOf(op, "Omar Haddad");
    await op.getByLabel(/I confirm: approve/).check();
    await op.getByRole("button", { name: "Approve and Notify" }).click();
    await expectText(op, /Approved\. This person can now enter the member community/);
    must(mailsTo("omar@demo.test").some((m) => /accepted/i.test(m.subject)), "no acceptance email captured");
    await signIn(om, "omar@demo.test");
    await go(om, "/community");
    must(new URL(om.url()).pathname.startsWith("/community"), `landed on ${om.url()}`);
  }, { page: om, shotName: "approved-enters" });
  await step("password recovery and an email outage", async () => "covered by browser tests E and F (tests/e2e/phase1.spec.ts)");

  // ================================================================ APPROVED MEMBER (Tom)
  role = "Member";
  const tom = await session(b);
  const tp = tom.page;
  const grace = await session(b);
  const gp = grace.page;
  await signIn(tp, "tom@demo.test");
  await signIn(gp, "grace@demo.test");
  let ideaUrl = "";
  await step("navigates the three main areas", async () => {
    for (const name of ["Business Ideas", "Explore Groups", "My Groups"]) {
      await tp.getByRole("navigation", { name: "Community" }).getByRole("link", { name }).click();
      await tp.getByRole("heading", { level: 1 }).first().waitFor();
    }
  });
  await step("edits the profile", async () => {
    await go(tp, "/community/profile");
    await tp.getByLabel("Short headline").fill("Teacher, interested in research projects");
    await tp.getByRole("button", { name: "Save profile" }).click();
    await expectText(tp, "Profile saved.");
  }, { page: tp, shotName: "profile-saved" });
  await step("uploads a profile photo", async () => {
    await go(tp, "/community/profile");
    await tp.locator("#upload-PROFILE_PHOTO").setInputFiles({ name: "me.png", mimeType: "image/png", buffer: PNG });
    const status = tp.locator('p[role="status"]').filter({ hasText: /uploaded|fail|not|allowed|Invalid/i }).first();
    await status.waitFor({ timeout: 15000 });
    const said = await status.innerText();
    must(said.includes("me.png uploaded."), `the upload answered: ${said}`);
  }, { page: tp, shotName: "profile-photo" });
  await step("proposes a business idea", async () => {
    await go(tp, "/community/ideas/new");
    await tp.getByLabel("Idea title").fill("Homework help for primary school pupils");
    await tp.getByLabel("What is the idea?").fill("Parents often look for affordable online homework help. A small team of tutors could offer it in the evenings.");
    await tp.getByLabel("Which area fits best?").selectOption({ index: 1 });
    await tp.getByRole("button", { name: "Publish idea" }).click();
    await tp.waitForURL(/\/community\/ideas\/[a-z0-9]+\?published=1/);
    ideaUrl = new URL(tp.url()).pathname;
  }, { page: tp, shotName: "idea-published" });
  await step("a minor correction keeps support and is recorded in the history", async () => {
    await go(gp, ideaUrl);
    await gp.getByRole("button", { name: "Support this idea" }).click();
    await expectText(gp, "Thank you. Your support was recorded.");
    await go(tp, `${ideaUrl}/edit`);
    await tp.getByLabel("What is the idea?").fill("Parents often look for affordable online homework help. A small team of tutors could offer it in the evenings, online.");
    await tp.locator('input[name="changeKind"][value="MINOR"]').check();
    await tp.getByRole("button", { name: "Save changes" }).click();
    await expectText(tp, "Your changes were saved and added to the idea’s history.");
    await expectText(tp, /1 of 2 supporters needed/);
  }, { page: tp, shotName: "minor-edit" });
  await step("a material change resets support and tells the supporter", async () => {
    await go(tp, `${ideaUrl}/edit`);
    await tp.getByLabel("What is the idea?").fill("A paid evening tutoring service for secondary school pupils, sold as monthly subscriptions to parents.");
    await tp.locator('input[name="changeKind"][value="MATERIAL"]').check();
    await tp.getByRole("button", { name: "Save changes" }).click();
    await expectText(tp, /material change, earlier support was reset/);
    await go(gp, "/community/notifications");
    must(/changed|reset/i.test(await visible(gp)), "the supporter was not told");
  }, { page: gp, shotName: "supporter-notified" });
  await step("comments on an idea, and the author is notified", async () => {
    await go(gp, ideaUrl);
    await gp.locator('textarea[name="body"]').first().fill("I could help with maths for older pupils.");
    await gp.getByRole("button", { name: "Post comment" }).click();
    await expectText(gp, "I could help with maths for older pupils.");
    await go(tp, "/community/notifications");
    must(/comment/i.test(await visible(tp)), "the author was not told");
  }, { page: tp, shotName: "notifications" });
  await step("discovers a group and joins it; the group sees a line in its chat", async () => {
    await go(tp, "/community/groups");
    await tp.getByRole("link", { name: /Bookkeeping help/ }).first().click();
    await tp.getByRole("button", { name: /^Join/ }).first().click();
    await expectText(tp, /You joined the group/);
  }, { page: tp, shotName: "joined-group" });

  // ================================================================ GROUP MEMBER AND COORDINATOR
  role = "Group";
  const maya = await session(b);
  const mp = maya.page;
  const luis = await session(b);
  const lp = luis.page;
  await signIn(mp, "maya@demo.test");
  await signIn(lp, "luis@demo.test");
  await step("chat between two sessions, live", async () => {
    await go(mp, `${GROUP}/chat`);
    await go(lp, `${GROUP}/chat`);
    await mp.getByTestId("chat-status").getByText(/Connected/).waitFor({ timeout: 15000 });
    await lp.getByTestId("chat-status").getByText(/Connected/).waitFor({ timeout: 15000 });
    await lp.getByLabel("Message").fill("Shall we split the market research by district?");
    await lp.keyboard.press("Enter");
    await mp.getByTestId("chat-messages").getByText("Shall we split the market research by district?").waitFor({ timeout: 10000 });
  });
  await step("sends a file in the chat; the other member receives it", async () => {
    await lp.locator("#chat-file").setInputFiles({ name: "receipt.png", mimeType: "image/png", buffer: PNG });
    await lp.getByText(/receipt\.(png|webp)/).first().waitFor({ timeout: 15000 });
    await lp.getByLabel("Message").fill("Here is the receipt layout I mentioned.");
    await lp.keyboard.press("Enter");
    await mp.getByTestId("chat-messages").getByText("Here is the receipt layout I mentioned.").waitFor({ timeout: 10000 });
    // An image attachment is shown as the image itself, named by its alternative text.
    const img = mp.getByTestId("chat-messages").getByRole("img", { name: /receipt\.(png|webp)/ }).first();
    await img.waitFor({ timeout: 10000 });
    must(await img.evaluate((e) => (e as HTMLImageElement).complete && (e as HTMLImageElement).naturalWidth > 0), "the image did not load for the other member");
  }, { page: mp, shotName: "chat-attachment" });
  await step("membership changes appear in the chat as system lines", async () => {
    await mp.getByTestId("chat-messages").getByText(/Tom Becker joined the group/).waitFor({ timeout: 10000 });
  }, { page: mp, shotName: "chat-with-system-line" });
  await step("Tom leaves after confirming", async () => {
    await go(tp, GROUP);
    await tp.getByRole("button", { name: "Leave group" }).click();
    await tp.getByRole("button", { name: "Yes, leave group" }).click();
    await expectText(tp, /You left the group/);
    await mp.getByTestId("chat-messages").getByText(/Tom Becker left the group/).waitFor({ timeout: 10000 });
  });
  await step("starts a meeting, a member sees it, the meeting is ended", async () => {
    await go(mp, `${GROUP}/meetings`);
    await mp.getByLabel("Paste the Google Meet link").fill("https://meet.google.com/abc-defg-hij");
    await mp.getByRole("button", { name: "Start Meeting" }).click();
    await expectText(mp, "In progress");
    await go(lp, `${GROUP}/meetings`);
    await lp.getByRole("button", { name: "Join Meeting" }).waitFor();
    await mp.getByRole("button", { name: "End meeting" }).click();
    await mp.getByRole("button", { name: "Start Meeting" }).waitFor({ timeout: 10000 });
  }, { page: lp, shotName: "meeting-visible-to-member" });
  await step("meeting expiry after four hours", async () => "covered by automated tests (tests/corrective-meetings.test.ts); waiting four hours in a browser is not practical");
  await step("adds a note and a task, and marks the task done", async () => {
    await go(mp, `${GROUP}/research`);
    await mp.getByText("+ Add a research note").click();
    const noteForm = formWith(mp, 'button:has-text("Add note")');
    await noteForm.locator('[name="title"]').fill("Competitors in our district");
    await noteForm.locator('[name="body"]').fill("Three bookkeeping offices, all charging by the hour.");
    await noteForm.getByRole("button", { name: "Add note" }).click();
    await expectText(mp, "Note saved.");
    await mp.getByText("Add a task", { exact: true }).click();
    const taskForm = formWith(mp, 'button:has-text("Add task")');
    await taskForm.locator('[name="title"]').fill("Call five shops");
    await taskForm.getByRole("button", { name: "Add task" }).click();
    await expectText(mp, "Task added.");
    const task = mp.locator("li, div", { hasText: "Call five shops" }).filter({ has: mp.getByRole("button", { name: "Mark done" }) }).last();
    await task.getByRole("button", { name: "Mark done" }).click();
    await mp.locator("li, div", { hasText: "Call five shops" }).filter({ hasText: "Done" }).first().waitFor({ timeout: 10000 });
  }, { page: mp, shotName: "research", full: true });
  await step("uploads a file", async () => {
    await mp.locator("#upload-GROUP_FILE").setInputFiles({ name: "district-map.png", mimeType: "image/png", buffer: PNG });
    const status = mp.locator('p[role="status"]').filter({ hasText: /uploaded|fail|not|allowed|Invalid/i }).first();
    await status.waitFor({ timeout: 15000 });
    const said = await status.innerText();
    must(said.includes("district-map.png uploaded."), `the upload answered: ${said}`);
    await mp.reload();
    await expectText(mp, /district-map\.webp/); // images are re-encoded, which removes hidden metadata
  });
  await step("records a decision", async () => {
    await mp.getByText("Record a decision", { exact: true }).click();
    const form = formWith(mp, '[name="decision"]');
    await form.locator('[name="title"]').fill("Focus on shops with fewer than five staff");
    await form.locator('[name="decision"]').fill("We start with small shops only.");
    await form.getByRole("button", { name: "Record decision" }).click();
    await expectText(mp, "Decision recorded.");
  }, { page: mp, shotName: "decision" });
  await step("changes the group's purpose with a reason; it is announced and recorded", async () => {
    await go(mp, GROUP);
    await mp.getByText("Coordinator tools").click().catch(() => {});
    await mp.locator('[name="purpose"]').fill("Monthly bookkeeping for small shops, starting with those with fewer than five staff.");
    await mp.getByLabel("If you change the line above: what changes, and why?").fill("We narrowed the focus after talking to shop owners.");
    await mp.getByRole("button", { name: "Save details" }).click();
    await expectText(mp, /Saved|saved/);
    await go(lp, `${GROUP}/discussions`);
    must(/narrowed the focus/.test(await visible(lp)), "the change was not announced to members");
  }, { page: lp, shotName: "purpose-change-announced" });
  await step("hands the coordinator role over (asks first)", async () => {
    await go(mp, `${GROUP}/members`);
    const row = mp.locator("li", { hasText: "Luis Romero" });
    await row.getByRole("button", { name: "Make coordinator" }).click();
    await mp.getByRole("button", { name: "Yes, hand over" }).click();
    await expectText(mp, /handed over/);
    await go(lp, GROUP);
    await expectText(lp, "You coordinate this group");
  }, { page: lp, shotName: "new-coordinator" });
  await step("the coordinator's account is suspended: another member takes over at once", async () => {
    await go(op, "/admin/members?q=luis");
    await op.getByRole("link", { name: /Luis Romero/ }).first().click();
    await op.getByLabel(/reason/i).first().fill("Walkthrough: testing coordinator succession.");
    await op.getByRole("button", { name: "Suspend account" }).click();
    await expectText(op, "Account updated.");
    await go(mp, `${GROUP}/members`);
    const coordinatorRow = mp.locator("li", { has: mp.getByText("Coordinator", { exact: true }) });
    must(!/Luis Romero/.test(await coordinatorRow.innerText()), "the suspended person is still coordinator");
    await op.getByRole("button", { name: "Reactivate account" }).click();
    await expectText(op, "Account updated.");
  }, { page: mp, shotName: "succession" });

  // ================================================================ ADMINISTRATOR (not owner)
  role = "Administrator";
  const admin = await session(b);
  const ap = admin.page;
  let adminSecret = "";
  await step("the owner invites an administrator; the invitation is activated", async () => {
    await go(op, "/admin/admins");
    await op.locator("#name").fill(ADMIN.name);
    await op.locator("#email").fill(ADMIN.email);
    await op.locator("#role").selectOption("ADMIN");
    await op.getByRole("button", { name: "Send invitation" }).click();
    await expectText(op, /Invitation/);
    const link = linkIn(mailsTo(ADMIN.email)[0]?.text ?? "", "activate");
    must(link, "no activation link was captured");
    await ap.goto(link);
    await ap.getByLabel("Display name").fill(ADMIN.name);
    await ap.getByLabel("Password", { exact: true }).fill(ADMIN.password);
    await ap.getByLabel("Repeat the new password").fill(ADMIN.password);
    await ap.locator('input[name="agree"]').check();
    await ap.getByRole("button", { name: "Activate account" }).click();
    await ap.waitForURL((u) => !u.pathname.startsWith("/activate"), { timeout: 20000 });
  }, { page: ap, shotName: "activated" });
  await step("must set up two-step verification before the admin area opens", async () => {
    if (new URL(ap.url()).pathname === "/login") await signIn(ap, ADMIN.email, ADMIN.password);
    await go(ap, "/admin");
    must(new URL(ap.url()).pathname.startsWith("/account/security"), `the admin area opened without two-step verification (${ap.url()})`);
    await ap.getByRole("button", { name: "Set up two-step verification" }).click();
    if (new URL(ap.url()).pathname.startsWith("/account/confirm")) {
      await ap.getByLabel("Password").fill(ADMIN.password);
      await ap.getByRole("button", { name: "Confirm" }).click();
      await ap.waitForURL(/\/account\/security/);
      await ap.getByRole("button", { name: "Set up two-step verification" }).click().catch(() => {});
    }
    const key = (await ap.locator("code").first().innerText()).replace(/\s+/g, "");
    must(/^[A-Z2-7]{16,}$/.test(key), `no setup key found (${key.slice(0, 10)})`);
    adminSecret = key;
    await ap.getByLabel("6-digit code").fill(code(key));
    await ap.getByRole("button", { name: "Turn on" }).click();
    await ap.getByLabel("Recovery codes").waitFor({ timeout: 15000 });
  }, { page: ap, shotName: "two-step-on" });
  await step("works with applications, members, moderation and public content", async () => {
    await go(ap, "/admin");
    if (new URL(ap.url()).pathname.startsWith("/login") || new URL(ap.url()).pathname.startsWith("/account/confirm")) await signIn(ap, ADMIN.email, ADMIN.password, adminSecret);
    for (const url of ["/admin/applications", "/admin/members", "/admin/reports", "/admin/content"]) {
      await go(ap, url);
      must(new URL(ap.url()).pathname === url, `${url} was refused (${ap.url()})`);
    }
    await go(ap, "/admin/content");
    const save = ap.getByRole("button", { name: /^Save/ }).first();
    await save.click();
    await expectText(ap, /Changes saved\.|saved/i);
  }, { page: ap, shotName: "content-saved" });
  await step("owner-only areas are refused with a plain message", async () => {
    for (const url of ["/admin/settings", "/admin/backups", "/admin/admins"]) {
      await go(ap, url);
      must(new URL(ap.url()).pathname === "/admin/no-access", `${url} opened for an administrator`);
      must(/permission/i.test(await visible(ap)), "no explanation shown");
    }
  }, { page: ap, shotName: "no-access" });
  await step("joins a group as an ordinary member and sees no earlier chat; the group sees it", async () => {
    await go(ap, GROUP);
    await ap.getByRole("button", { name: /^Join/ }).first().click();
    await expectText(ap, /You joined the group/);
    await go(ap, `${GROUP}/chat`);
    await ap.getByTestId("chat-status").getByText(/Connected/).waitFor({ timeout: 15000 });
    const shown = await ap.getByTestId("chat-messages").innerText();
    must(!shown.includes("Shall we split the market research by district?"), "an earlier message is visible to the administrator");
    await go(mp, `${GROUP}/chat`);
    await mp.getByTestId("chat-messages").getByText(/Ada Admin \(administrator\) joined the group/).waitFor({ timeout: 10000 });
  }, { page: ap, shotName: "admin-sees-no-earlier-chat" });

  // ================================================================ OWNER
  role = "Owner";
  await step("sees the contact message from the visitor", async () => {
    await go(op, "/admin/inquiries");
    await expectText(op, "Question from the walkthrough");
  });
  await step("saves organization settings", async () => {
    await go(op, "/admin/settings");
    await op.getByRole("button", { name: "Save settings" }).click();
    await expectText(op, /saved/i);
  }, { page: op, shotName: "settings" });
  await step("creates a project, assigns a participant and records a compensation agreement", async () => {
    await go(op, "/admin/projects");
    await op.locator("#title").fill("Walkthrough pilot project");
    await op.locator("#summary").fill("A small pilot to check the project tools.");
    await op.getByRole("button", { name: "Create project" }).click();
    await op.waitForURL(/\/admin\/projects\/[a-z0-9]+/);
    await op.locator("#participantId").selectOption({ label: "Omar Haddad" });
    await formWith(op, "#participantId").locator('button[type="submit"]').click();
    await expectText(op, /assigned/i);
    const comp = formWith(op, '[name="terms"]');
    await comp.locator('[name="terms"]').fill("Fixed fee for the pilot, paid after the customer pays.");
    await comp.locator('[name="amount"]').fill("150.00");
    await comp.locator('[name="currency"]').fill("USD");
    await comp.locator('button[type="submit"]').click();
    await expectText(op, /Compensation record saved\./);
  }, { page: op, shotName: "compensation", full: true });
  await step("deleting the project is refused while an agreement exists; after removing it, deletion works", async () => {
    await op.locator("#confirm").last().fill("DELETE");
    await formWith(op, "#confirm").last().locator('button[type="submit"]').click();
    await expectText(op, "This project has 1 compensation agreement. Remove it first");
    await op.locator("summary", { hasText: "Compensation agreement" }).first().click();
    await op.getByText("Remove this agreement…").click();
    const rm = formWith(op, 'input[id^="rm-"]');
    await rm.locator('input[id^="rm-"]').fill("REMOVE");
    await rm.locator('button[type="submit"]').click();
    await expectText(op, /Compensation agreement removed\./);
    await op.locator("#confirm").last().fill("DELETE");
    await formWith(op, "#confirm").last().locator('button[type="submit"]').click();
    await op.waitForURL(/\/admin\/projects(\?|$)/);
    await expectText(op, "Deleted.");
  }, { page: op, shotName: "project-deleted" });
  await step("Back up now writes a backup", async () => {
    await go(op, "/admin/backups");
    await op.getByRole("button", { name: "Back up now" }).click();
    await expectText(op, /^Backup written/, 60000);
  }, { page: op, shotName: "backup-written" });
  await step("previews and runs the retention clean-up", async () => {
    await go(op, "/admin/privacy");
    must(/would be removed|records|Notifications/i.test(await visible(op)), "no preview shown");
    await op.locator("#confirm").fill("DELETE");
    await op.getByRole("button", { name: "Run now" }).click();
    if (new URL(op.url()).pathname.startsWith("/account/confirm")) {
      await op.getByLabel("Password").fill(DEMO.password);
      await op.getByLabel("Code from your authenticator app").fill(code(DEMO.totpSecret));
      await op.getByRole("button", { name: "Confirm" }).click();
      await op.waitForURL(/\/admin\/privacy/);
      await op.locator("#confirm").fill("DELETE");
      await op.getByRole("button", { name: "Run now" }).click();
    }
    await expectText(op, /Retention run finished/);
  }, { page: op, shotName: "retention" });

  await b.close();

  // ------------------------------------------------------------------ result
  const failed = rows.filter((r) => !r.ok);
  console.log(`\nRESULT: ${rows.length - failed.length} of ${rows.length} steps passed`);
  const md = ["| Role | Step | Result | Note | Screenshot |", "|---|---|---|---|---|", ...rows.map((r) => `| ${r.role} | ${r.step} | ${r.ok ? "passed" : "**FAILED**"} | ${r.detail.replace(/\|/g, "/")} | ${r.shot ? `\`${r.shot}\`` : ""} |`)];
  const { writeFileSync } = await import("node:fs");
  writeFileSync(path.join(OUT, "walkthrough-results.md"), md.join("\n") + "\n");
})();
