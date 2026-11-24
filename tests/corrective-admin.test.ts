/**
 * Regression tests for the corrective implementation plan.
 * P2-17: the admin area shows one person's state in one place, counters match
 * their lists, and the menu is shorter without losing a page.
 */
import { existsSync, readFileSync } from "node:fs";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { setMembership, suspendUser } from "@/server/accounts";
import { updateApplicationStatus } from "@/server/admin/applications";
import { MEMBERS_WITH_ACCESS, MEMBERS_WITH_ACCESS_HREF, MEMBER_LISTS, accountTypeLabel, memberListWhere, type MemberList } from "@/server/admin/members";
import { cookieJar, createApplicantAccount, createMember, createUser, resetDb, submitTestApplication } from "./helpers";

beforeEach(async () => {
  await resetDb();
  cookieJar.clear();
});
afterAll(async () => {
  await db.$disconnect();
});

const count = (opts: Parameters<typeof memberListWhere>[0]) => db.user.count({ where: memberListWhere(opts) });

describe("P2-17: member lists and counters", () => {
  async function people() {
    const owner = await createUser({ email: "owner@example.test", totp: true });
    await createUser({ email: "admin@example.test", role: "ADMIN", totp: true });
    const [m1, m2, m3] = [await createMember("Mia"), await createMember("Noah"), await createMember("Olga")];
    await createApplicantAccount("registered@example.test", "Reg Istered"); // registered, never applied
    const { application } = await submitTestApplication({ email: "applied@example.test" }); // applied, not decided
    await updateApplicationStatus(owner.id, application.id, "WAITLISTED");
    await setMembership(owner.id, m2.id, "SUSPENDED"); // access paused
    await suspendUser(owner.id, m3.id, "test"); // account suspended
    return { owner, m1, m2, m3 };
  }

  it("every account is in exactly one of the three lists, and the list names say what they contain", async () => {
    await people();
    const [members, applicants, staff, all] = await Promise.all((["members", "applicants", "staff", "all"] as MemberList[]).map((show) => count({ show })));
    expect([members, applicants, staff, all]).toEqual([3, 2, 2, 7]);
    expect(members + applicants + staff).toBe(all);
    // The default list is "Members": approved people only, not every account.
    expect(await count({})).toBe(members);
    expect(MEMBER_LISTS.members.description).toContain("approved");
    expect(MEMBER_LISTS.applicants.description).toContain("do not have community access");
  });

  it("the overview counter 'Members with community access' equals the list it links to", async () => {
    await people();
    // Three approved people: one has paused access, one a suspended account, so one can use the community.
    expect(await count(MEMBERS_WITH_ACCESS)).toBe(1);
    const params = new URL(MEMBERS_WITH_ACCESS_HREF, "http://x").searchParams;
    expect(Object.fromEntries(params)).toEqual({ show: "members", status: "ACTIVE", access: "ACTIVE" });
    expect(await count({ show: params.get("show") as MemberList, status: "ACTIVE", access: "ACTIVE" })).toBe(1);
  });

  it("filters combine: paused access, suspended accounts, and search", async () => {
    await people();
    expect(await count({ show: "members", access: "SUSPENDED" })).toBe(1);
    expect(await count({ show: "members", status: "SUSPENDED" })).toBe(1);
    expect(await count({ show: "all", q: "noah" })).toBe(1);
    expect(await count({ show: "staff", q: "noah" })).toBe(0);
  });

  it("the account type is never shown as a bare 'Member' (which read like 'is a member of the community')", () => {
    expect(accountTypeLabel("MEMBER")).toBe("Member account");
    expect(accountTypeLabel("ADMIN")).toBe("Administrator");
    expect(accountTypeLabel("OWNER")).toBe("Owner");
    const page = readFileSync("src/app/admin/(panel)/members/[id]/page.tsx", "utf8");
    expect(page).toContain("Where this person stands");
    for (const fact of ["1. Account", "2. Email address", "3. Application", "4. Community access"]) expect(page).toContain(fact);
    expect(page).not.toContain('u.role === "MEMBER" ? "Member" :');
  });
});

describe("P2-17: a shorter menu without losing a page", () => {
  const layout = readFileSync("src/app/admin/(panel)/layout.tsx", "utf8");
  const tabs = readFileSync("src/app/admin/(panel)/admin-tabs.tsx", "utf8");
  const navBlock = layout.slice(layout.indexOf("const NAV"), layout.indexOf("];", layout.indexOf("const NAV")));
  const entries = [...navBlock.matchAll(/\{ href: "(\/admin[^"]*)", label: "([^"]+)"/g)].map((m) => ({ href: m[1]!, label: m[2]! }));

  // Twigo added three sections (project agreements, community support, legal); the twelve earlier
  // entries are all still there, with the groups and old projects entries relabelled.
  it("has the twelve earlier entries plus the three Twigo sections and Group access", () => {
    expect(entries).toHaveLength(16);
    expect(entries.map((e) => e.label)).toEqual(["Overview", "Applications", "Members", "Moderation", "Project groups", "Group access", "Project agreements", "Earlier project records", "Community support", "Customer inquiries", "Email", "Website content", "Settings", "Legal", "Privacy & data", "Audit log"]);
  });

  it("the four pages that left the menu are tabs of a related page, and still exist at their old address", () => {
    for (const moved of ["/admin/admins", "/admin/participants", "/admin/ideas", "/admin/backups"]) {
      expect(entries.map((e) => e.href)).not.toContain(moved);
      expect(navBlock).toContain(`"${moved}"`); // listed under `also`, so the entry stays highlighted there
      expect(tabs).toContain(`href: "${moved}"`);
      expect(existsSync(`src/app/admin/(panel)${moved.replace("/admin", "")}/page.tsx`)).toBe(true);
    }
  });

  it("every page reached through a tab is permission-checked for the tab bar too", () => {
    for (const href of ["/admin/members", "/admin/admins", "/admin/projects", "/admin/participants", "/admin/reports", "/admin/ideas", "/admin/privacy", "/admin/backups"]) {
      expect(layout).toMatch(new RegExp(`\\{ href: "${href}", perm: "[a-z.]+" \\}`));
    }
    // Owner-only pages keep their owner-only permission in the tab list.
    expect(layout).toContain('{ href: "/admin/admins", perm: "admins.manage" }');
    expect(layout).toContain('{ href: "/admin/backups", perm: "backups.manage" }');
  });

  it("the overview starts with what is waiting, and names the application status as members see it", () => {
    const overview = readFileSync("src/app/admin/(panel)/page.tsx", "utf8");
    expect(overview.indexOf("Waiting for you")).toBeLessThan(overview.indexOf("StatCard label="));
    expect(overview).toContain("Applications received");
    expect(overview).not.toContain("New applications");
    expect(overview).toContain("Before launch");
  });
});
