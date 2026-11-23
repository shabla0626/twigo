/** Release review: behaviour that was previously covered only by code review. */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createIdea, endorseIdea, listIdeas } from "@/server/community/ideas";
import { cookieJar, createMember, resetDb } from "./helpers";

beforeEach(async () => {
  await resetDb();
  cookieJar.clear();
});
afterAll(async () => {
  await db.$disconnect();
});

const idea = (title: string, summary: string, category: "ONLINE_SERVICES" | "EDUCATION_TRAINING" = "ONLINE_SERVICES") => ({
  title,
  summary,
  category,
  description: null, problem: null, proposal: null, customers: null, revenueModel: null, skillsNeeded: null, timeEstimate: null,
  links: [],
});

describe("idea feed: search, category filter, sorting and pagination", () => {
  it("finds, filters, orders and pages correctly", async () => {
    const [a, b, c] = [await createMember("Alice"), await createMember("Bob"), await createMember("Cara")];
    const made: string[] = [];
    for (const [t, s, cat] of [
      ["Bookkeeping for shops", "Monthly ledgers for small local shops.", "ONLINE_SERVICES"],
      ["Homework help", "Evening tutoring for primary school pupils.", "EDUCATION_TRAINING"],
      ["Garden design", "Small garden plans for busy families.", "ONLINE_SERVICES"],
    ] as const) {
      const r = await createIdea(a.id, idea(t, s, cat));
      if (!r.ok) throw new Error(r.error);
      made.push(r.id);
      await new Promise((x) => setTimeout(x, 15)); // distinct creation times
    }
    // Search is case-insensitive over title and summary.
    expect((await listIdeas({ q: "LEDGERS" })).items.map((i) => i.title)).toEqual(["Bookkeeping for shops"]);
    expect((await listIdeas({ q: "garden" })).items.map((i) => i.title)).toEqual(["Garden design"]);
    // Category filter.
    expect((await listIdeas({ category: "EDUCATION_TRAINING" })).items.map((i) => i.title)).toEqual(["Homework help"]);
    // Newest first by default.
    expect((await listIdeas({})).items.map((i) => i.title)).toEqual(["Garden design", "Homework help", "Bookkeeping for shops"]);
    // "Most supported" puts the supported idea first.
    await endorseIdea(b.id, made[1]!);
    expect((await listIdeas({ sort: "endorsed" })).items[0]!.title).toBe("Homework help");
    await endorseIdea(c.id, made[0]!);
    await endorseIdea(b.id, made[0]!); // second supporter: a group forms, the idea stays listed
    expect((await listIdeas({ sort: "endorsed" })).items[0]!.title).toBe("Bookkeeping for shops");
    // Pagination: no item twice, none missing.
    const p1 = await listIdeas({ take: 2 });
    expect(p1.items).toHaveLength(2);
    expect(p1.nextCursor).not.toBeNull();
    const p2 = await listIdeas({ take: 2, cursor: p1.nextCursor! });
    const ids = [...p1.items, ...p2.items].map((i) => i.id);
    expect(new Set(ids).size).toBe(3);
    expect(p2.nextCursor).toBeNull();
  });
});
