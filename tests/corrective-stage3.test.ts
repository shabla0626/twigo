/**
 * Regression tests for the corrective implementation plan, Stage 3 (low-priority findings).
 * P3-1, P3-2, P3-4, P3-5, P3-6, P3-7, P3-8, P3-9, P3-10, P3-11, P3-12, P3-13.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { applicationView } from "@/lib/application-view";
import { TEMPLATES } from "@/lib/email/templates";
import { LIST_PAGE_SIZE, pageHref, pageNumber, pageWindow } from "@/lib/paging";
import { channelAccess, sendMessage } from "@/realtime/chat-service";
import { groupUnread } from "@/server/community/group-page";
import { joinGroup, myGroups, unreadSince } from "@/server/community/groups";
import { createIdea, endorseIdea } from "@/server/community/ideas";
import { listNotifications, markRead, notify } from "@/server/community/notifications";
import { cookieJar, createMember, resetDb } from "./helpers";

beforeEach(async () => {
  await resetDb();
  cookieJar.clear();
});
afterAll(async () => {
  await db.$disconnect();
});

const source = (rel: string) => readFileSync(rel, "utf8");
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("P3-4 / P3-5: the application page says one thing", () => {
  const base = { membership: "NONE" as const, communityAccess: false, status: null, contact: null };

  it("a member who never applied is told they are a member, and is not offered an application", () => {
    const v = applicationView({ ...base, membership: "ACTIVE", communityAccess: true });
    expect(v.label).toBe("You Are a Member");
    expect(v.mayStart).toBe(false);
    // The same for a member who happens to have an unfinished draft.
    expect(applicationView({ ...base, membership: "ACTIVE", communityAccess: true, status: "DRAFT" }).mayStart).toBe(false);
  });

  it("paused or removed access is the only message, whatever the application says", () => {
    for (const status of [null, "ACCEPTED", "DRAFT", "SUBMITTED"] as const) {
      const paused = applicationView({ ...base, membership: "SUSPENDED", status });
      expect(paused.label).toBe("Community Access Paused");
      expect(paused.text).not.toMatch(/can enter|accepted|Welcome/i);
      expect(paused.mayStart).toBe(false);
      const removed = applicationView({ ...base, membership: "REVOKED", status });
      expect(removed.label).toBe("Community Access Removed");
      expect(removed.text).not.toMatch(/can enter|accepted|Welcome/i);
    }
  });

  it("an accepted person is told they can enter only when they really can", () => {
    const withAccess = applicationView({ ...base, membership: "ACTIVE", communityAccess: true, status: "ACCEPTED" });
    expect(withAccess.text).toContain("You can enter the member community");
    const without = applicationView({ ...base, membership: "NONE", communityAccess: false, status: "ACCEPTED" });
    expect(without.text).not.toContain("You can enter");
    expect(without.text).toContain("being set up");
  });

  it("a visitor without an application is invited to start, and a draft can be continued", () => {
    expect(applicationView(base)).toMatchObject({ label: "Application Not Started", mayStart: true });
    expect(applicationView({ ...base, status: "DRAFT" }).mayStart).toBe(true);
    expect(applicationView({ ...base, status: "SUBMITTED" })).toMatchObject({ mayStart: false, badge: "No action needed from you" });
    // A contact address is used when one is configured, and never invented when it is not.
    expect(applicationView({ ...base, membership: "SUSPENDED", contact: "help@example.test" }).text).toContain("help@example.test");
    expect(applicationView({ ...base, membership: "SUSPENDED" }).text).toContain("reply to any email");
  });
});

describe("P3-1, P3-2, P3-6 to P3-10: small visible corrections are in place", () => {
  it("the site has an icon, made from its own logo", () => {
    for (const f of ["src/app/favicon.ico", "src/app/icon.svg", "src/app/apple-icon.png"]) {
      expect(existsSync(f), f).toBe(true);
      expect(statSync(f).size).toBeGreaterThan(200);
    }
    // No outside address inside the drawing.
    expect(source("src/app/icon.svg")).not.toMatch(/https?:\/\/(?!www\.w3\.org)/);
  });

  it("each signed-in area has a loading placeholder that announces itself", () => {
    for (const dir of ["src/app/community/(portal)", "src/app/admin/(panel)", "src/app/(applicant)"]) {
      const s = source(`${dir}/loading.tsx`);
      expect(s).toContain('role="status"');
      expect(s).toContain("Loading");
    }
    expect(source("src/app/globals.css")).toContain("@keyframes fadein");
  });

  it("filter boxes are as wide as their text", () => {
    for (const f of ["src/app/community/(portal)/page.tsx", "src/app/community/(portal)/groups/page.tsx"]) {
      const s = source(f);
      expect(s).toContain("max-content");
      expect(s).not.toContain("minmax(0,1fr)_minmax(0,1fr)");
    }
  });

  it("each place to talk says who can read it", () => {
    expect(source("src/components/community/chat.tsx")).toContain("members of this group only");
    expect(source("src/app/community/(portal)/groups/[slug]/discussions/page.tsx")).toContain("every approved member of the community, not only this group");
    expect(source("src/app/community/(portal)/ideas/[id]/page.tsx")).toContain("Every approved member can read and answer them");
  });

  it("the chat offers ONE named control for attaching a file, and the two admin links are underlined", () => {
    const chat = source("src/components/community/chat.tsx");
    // The file field itself is hidden from keyboard and screen readers; the named button opens it.
    expect(chat).toMatch(/id="chat-file" tabIndex=\{-1\} aria-hidden="true"/);
    expect(chat).toContain('aria-label="Attach a file"');
    // Nothing else on the page is called "Message", so the message box can be found by its name.
    expect(chat.match(/[Mm]essage\s*<\/label>/g)).toHaveLength(1);
    expect(source("src/app/admin/(panel)/inquiries/page.tsx")).toMatch(/mailto:\$\{q\.email\}`\} className="text-accent-700 underline/);
    expect(source("src/app/admin/(panel)/privacy/page.tsx")).toMatch(/href="\/admin\/applications" className="text-accent-700 underline/);
  });

  it("on a phone the less-used application filters are folded away", () => {
    const s = source("src/app/admin/(panel)/applications/page.tsx");
    expect(s).toContain("<MoreFilters");
    // The search box stays outside the folded part.
    expect(s.indexOf('id="q"')).toBeLessThan(s.indexOf("<MoreFilters"));
  });

  it("the email page shows the delivery log before the templates, and no sentence twice", () => {
    const s = source("src/app/admin/(panel)/email/page.tsx");
    expect(s.indexOf("Delivery log")).toBeGreaterThan(0);
    expect(s.indexOf("Delivery log")).toBeLessThan(s.indexOf("Email templates ("));
    for (const t of Object.values(TEMPLATES)) expect(t.description, t.label).not.toMatch(/sent only by an administrator/i);
  });
});

describe("P3-3: the repeated blocks the founder approved are gone, and the facts remain elsewhere", () => {
  const page = (p: string) => source(`src/app/(site)/${p}page.tsx`);

  it("1. Home no longer repeats three FAQ questions; the FAQ page has them all and stays in the menu", () => {
    expect(page("")).not.toContain("Common questions");
    expect(page("")).not.toContain("FaqList");
    expect(page("faq/")).toContain("<FaqList items={c.faq.items} />");
    expect(source("src/components/site/nav.ts")).toContain('{ href: "/faq", label: "FAQ" }');
  });

  it("2. About no longer has 'The value of cooperation'; its point stays in 'Why we exist' and on Home", () => {
    expect(page("about/")).not.toContain("The value of cooperation");
    expect(page("about/")).toContain("People can accomplish together what is difficult for them to accomplish individually.");
    expect(page("")).toContain("Accomplish together what is hard to accomplish alone.");
  });

  it("3. Founding Contributors no longer has 'People we welcome'; the same points stay in its own list", () => {
    const s = page("founding-contributors/");
    expect(s).not.toContain("People we welcome");
    for (const kept of ["Fully remote participation", "Flexible availability", "different levels of professional experience", "No joining fees"]) expect(s).toContain(kept);
  });

  it("7. the closing banner stays on Home, How It Works and Founding Contributors only", () => {
    const withBanner = ["", "how-it-works/", "founding-contributors/"];
    const without = ["about/", "compensation/", "participation/", "faq/"];
    for (const p of withBanner) expect(page(p), p || "home").toContain("<CtaBand");
    for (const p of without) expect(page(p), p).not.toContain("CtaBand");
  });

  it("the photos of the removed sections keep their files, so nothing has to be found again", () => {
    for (const f of ["about/cooperation-side-by-side.jpg", "founding-contributors/portrait-remote-worker-1.jpg", "founding-contributors/portrait-remote-worker-2.jpg", "founding-contributors/portrait-remote-worker-3.jpg"]) {
      expect(existsSync(`public/images/people/${f}`), f).toBe(true);
    }
  });
});

describe("P3-11: every record of a long admin list can be reached", () => {
  it("page numbers from the address are safe", () => {
    expect(pageNumber(undefined)).toBe(1);
    expect(pageNumber("3")).toBe(3);
    expect(pageNumber(["4", "9"])).toBe(4);
    for (const bad of ["0", "-2", "1.5", "abc", "999999999", "1e3x"]) expect(pageNumber(bad), bad).toBe(1);
  });

  it("the window never goes beyond the last page", () => {
    expect(pageWindow(1, 0)).toEqual({ page: 1, pages: 1, skip: 0, take: LIST_PAGE_SIZE });
    expect(pageWindow(2, 120)).toEqual({ page: 2, pages: 3, skip: 50, take: 50 });
    expect(pageWindow(99, 120)).toMatchObject({ page: 3, skip: 100 });
  });

  it("links to other pages keep the filter", () => {
    expect(pageHref("/admin/audit", { area: undefined }, 1)).toBe("/admin/audit");
    expect(pageHref("/admin/audit", { area: "User" }, 2)).toBe("/admin/audit?area=User&page=2");
    expect(pageHref("/admin/email", { filter: "problems" }, 1)).toBe("/admin/email?filter=problems");
  });

  it("walking through the pages returns every audit entry exactly once", async () => {
    const m = await createMember("Paige");
    await db.auditLog.deleteMany();
    await db.auditLog.createMany({
      data: Array.from({ length: 120 }, (_, i) => ({ actorId: m.id, action: `test.entry_${i}`, entityType: i % 2 ? "User" : "Idea", createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i % 7)) })),
    });
    const total = await db.auditLog.count();
    const seen = new Set<string>();
    for (let p = 1; p <= pageWindow(1, total).pages; p++) {
      const { skip, take } = pageWindow(p, total);
      // Same order as the page: time, then id, so rows with the same time never swap between pages.
      const rows = await db.auditLog.findMany({ orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip, take, select: { id: true } });
      for (const r of rows) seen.add(r.id);
    }
    expect(seen.size).toBe(120);
  });

  it("the three pages use paging and no longer stop at a fixed number", () => {
    for (const f of ["audit", "inquiries", "email"]) {
      const s = source(`src/app/admin/(panel)/${f}/page.tsx`);
      expect(s, f).toContain("pageWindow(");
      expect(s, f).toContain("<Pager");
      expect(s, f).not.toMatch(/take: (100|200),/);
      expect(s, f).not.toMatch(/latest (100|200)/);
    }
  });
});

describe("P3-12: notifications keep their place when read", () => {
  it("reading a notification does not move it, and a repeated event still brings it to the top", async () => {
    const m = await createMember("Nora");
    await notify([m.id], { type: "GROUP_STATUS", title: "first", dedupeKey: "a" });
    await pause(15);
    await notify([m.id], { type: "GROUP_STATUS", title: "second" });
    await pause(15);
    await notify([m.id], { type: "GROUP_STATUS", title: "third" });
    const titles = async () => (await listNotifications(m.id)).items.map((n) => n.title);
    expect(await titles()).toEqual(["third", "second", "first"]);

    const all = (await listNotifications(m.id)).items;
    const oldest = all.find((n) => n.title === "first")!;
    await pause(15);
    await markRead(m.id, [oldest.id]);
    expect(await titles()).toEqual(["third", "second", "first"]);
    const after = await db.notification.findUniqueOrThrow({ where: { id: oldest.id } });
    expect(after.readAt).not.toBeNull();
    expect(after.updatedAt.getTime()).toBe(oldest.updatedAt.getTime());

    await pause(15);
    await markRead(m.id, "all");
    expect(await titles()).toEqual(["third", "second", "first"]);
    expect(await db.notification.count({ where: { userId: m.id, readAt: null } })).toBe(0);

    // A new event for the same subject is news again.
    await pause(15);
    await notify([m.id], { type: "GROUP_STATUS", title: "first", dedupeKey: "a" });
    expect((await titles())[0]).toBe("first");
  });

  it("marking as read never touches another person's notifications", async () => {
    const [a, b] = [await createMember("Ann"), await createMember("Ben")];
    await notify([a.id, b.id], { type: "GROUP_STATUS", title: "for both" });
    const mine = (await listNotifications(a.id)).items[0]!;
    const theirs = (await listNotifications(b.id)).items[0]!;
    await markRead(a.id, [mine.id, theirs.id]);
    await markRead(a.id, []);
    expect((await db.notification.findUniqueOrThrow({ where: { id: mine.id } })).readAt).not.toBeNull();
    expect((await db.notification.findUniqueOrThrow({ where: { id: theirs.id } })).readAt).toBeNull();
  });

  it("a link to something that was removed ends on a plain page inside the member area", () => {
    const s = source("src/app/community/(portal)/not-found.tsx");
    expect(s).toContain("This is no longer available");
    expect(s).toContain('href="/community/notifications"');
  });
});

describe("P3-13: a new group member does not start with a full unread badge", () => {
  let n = 0;
  async function say(userId: string, channelId: string, body: string) {
    const access = (await channelAccess(db, userId, channelId))!;
    const res = await sendMessage(db, userId, access, { channelId, body, clientId: `stage3-${++n}`, attachmentIds: [] });
    if (!res.ok) throw new Error(res.error);
  }
  async function group(title: string, a: string, b: string, c: string) {
    const res = await createIdea(a, {
      title,
      summary: "Small local shops need simple, affordable monthly bookkeeping help.",
      category: "ONLINE_SERVICES",
      description: null, problem: null, proposal: null, customers: null, revenueModel: null, skillsNeeded: null, timeEstimate: null,
      links: [],
    });
    if (!res.ok) throw new Error(res.error);
    await endorseIdea(b, res.id);
    await endorseIdea(c, res.id);
    const g = await db.researchGroup.findUniqueOrThrow({ where: { ideaId: res.id }, include: { channels: true } });
    return { g, channelId: g.channels[0]!.id };
  }

  it("only messages written after joining count as unread, in both places that show the number", async () => {
    const [a, b, c, dora] = [await createMember("Alice"), await createMember("Bob"), await createMember("Cara"), await createMember("Dora")];
    const one = await group("Neighborhood bookkeeping service", a.id, b.id, c.id);
    const two = await group("Translation help for small shops", a.id, b.id, c.id);
    await say(a.id, one.channelId, "old one");
    await say(b.id, one.channelId, "old two");
    await say(a.id, two.channelId, "old three");
    await pause(20);
    expect((await joinGroup(dora.id, one.g.id)).ok).toBe(true);
    expect((await joinGroup(dora.id, two.g.id)).ok).toBe(true);
    expect(await groupUnread(one.g.id, dora.id)).toBe(0);
    expect((await myGroups(dora.id)).map((x) => x.unread)).toEqual([0, 0]);

    await pause(20);
    // Writing a message marks the chat as read up to that point, so Dora writes first.
    await say(dora.id, one.channelId, "my own message never counts");
    await pause(20);
    await say(a.id, one.channelId, "new for Dora");
    expect(await groupUnread(one.g.id, dora.id)).toBe(1);
    expect(await groupUnread(two.g.id, dora.id)).toBe(0);
    const mine = await myGroups(dora.id);
    expect(Object.fromEntries(mine.map((x) => [x.group.id, x.unread]))).toEqual({ [one.g.id]: 1, [two.g.id]: 0 });
    // The founding members still see everything written by others as unread.
    expect(await groupUnread(one.g.id, c.id)).toBe(4);
  });

  it("the starting point is the later of 'last read' and 'joined'", () => {
    const joined = new Date("2026-03-01T10:00:00Z");
    expect(unreadSince(null, joined)).toEqual(joined);
    expect(unreadSince(new Date("2026-02-01T10:00:00Z"), joined)).toEqual(joined);
    expect(unreadSince(new Date("2026-04-01T10:00:00Z"), joined)).toEqual(new Date("2026-04-01T10:00:00Z"));
  });
});
