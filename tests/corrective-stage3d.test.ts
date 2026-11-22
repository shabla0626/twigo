/**
 * Regression tests for the corrective implementation plan, Stage 3: housekeeping items
 * (noted in the audit without an ID).
 */
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { resetEmailTransport, sendEmail } from "@/lib/email";
import { resetEnvCache } from "@/lib/env";
import { runRetention } from "@/ops/retention";
import { addComment, deleteComment } from "@/server/community/comments";
import { createIdea } from "@/server/community/ideas";
import { fileReport, moderate } from "@/server/community/reports";
import { isTestDatabaseName } from "./global-setup";
import { cookieJar, createMember, createUser, resetDb } from "./helpers";

beforeEach(async () => {
  await resetDb();
  cookieJar.clear();
});
afterAll(async () => {
  await db.$disconnect();
});

describe("housekeeping: looking at the Privacy page leaves no record", () => {
  it("a preview counts without writing; a real run is recorded", async () => {
    const dir = path.join(tmpdir(), "cowork-test-storage");
    const preview = await runRetention(db, { dryRun: true, storageDir: dir });
    await runRetention(db, { dryRun: true, storageDir: dir });
    expect(preview.jobRunId).toBeNull();
    expect(preview.categories.length).toBeGreaterThan(0);
    expect(await db.jobRun.count()).toBe(0);
    const real = await runRetention(db, { dryRun: false, storageDir: dir });
    expect(real.jobRunId).not.toBeNull();
    expect(await db.jobRun.count({ where: { job: "retention", dryRun: false, ok: true } })).toBe(1);
  });
});

describe("housekeeping: only a database named …_test may be emptied by the tests", () => {
  it("the name decides, not any other part of the connection text", () => {
    expect(isTestDatabaseName("cowork_test")).toBe(true);
    for (const name of ["cowork", "cowork_demo", "cowork_e2e", "test", "contest", "cowork_latest", "cowork_test_copy", "", "cowork_test; DROP"]) {
      expect(isTestDatabaseName(name), name).toBe(false);
    }
    const s = readFileSync("tests/global-setup.ts", "utf8");
    // The old check accepted any connection text containing "test" (for example in a password).
    expect(s).not.toContain("/test/i.test(url)");
  });
});

describe("housekeeping: transport security header", () => {
  it("is sent in production without 'preload'", () => {
    const s = readFileSync("next.config.ts", "utf8");
    const header = /value: "(max-age=[^"]+)"/.exec(s)?.[1];
    expect(header).toBe("max-age=63072000; includeSubDomains");
  });
});

describe("housekeeping: a failed email does not put the recipient's address into the log", () => {
  afterEach(() => {
    process.env.SMTP_HOST = "";
    resetEnvCache();
    resetEmailTransport();
    vi.restoreAllMocks();
  });

  it("logs the kind of failure and the delivery id only", async () => {
    process.env.SMTP_HOST = "127.0.0.1";
    process.env.SMTP_PORT = "1"; // nothing listens there
    process.env.EMAIL_FROM = "no-reply@cowork.test";
    resetEnvCache();
    resetEmailTransport();
    const lines: string[] = [];
    vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => void lines.push(a.join(" ")));
    vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => void lines.push(a.join(" ")));
    const res = await sendEmail({ to: "private.person@example.test", subject: "A very private subject", text: "Private text" }, "delivery-123");
    expect(res.status).toBe("failed");
    const logged = lines.join("\n");
    expect(logged).toContain("email.send_failed");
    expect(logged).toContain("delivery-123");
    expect(logged).not.toContain("private.person");
    expect(logged).not.toContain("A very private subject");
    expect(logged).not.toContain("Private text");
  });
});

describe("housekeeping: comment counters follow deletions", () => {
  async function ideaWithComments() {
    const [a, b] = [await createMember("Alice"), await createMember("Bob")];
    const res = await createIdea(a.id, {
      title: "Neighborhood bookkeeping service",
      summary: "Small local shops need simple, affordable monthly bookkeeping help.",
      category: "ONLINE_SERVICES",
      description: null, problem: null, proposal: null, customers: null, revenueModel: null, skillsNeeded: null, timeEstimate: null,
      links: [],
    });
    if (!res.ok) throw new Error(res.error);
    for (const body of ["First comment", "Second comment", "Third comment"]) {
      const c = await addComment(b.id, { ideaId: res.id }, { body, parentId: null });
      if (!c.ok) throw new Error(c.error);
    }
    const comments = await db.comment.findMany({ where: { ideaId: res.id }, orderBy: { createdAt: "asc" } });
    const count = async () => (await db.businessIdea.findUniqueOrThrow({ where: { id: res.id } })).commentCount;
    return { a, b, ideaId: res.id, comments, count };
  }

  it("deleting, moderating and adding all leave the number equal to the readable comments", async () => {
    const { a, b, ideaId, comments, count } = await ideaWithComments();
    expect(await count()).toBe(3);
    expect((await deleteComment(b.id, comments[0]!.id)).ok).toBe(true);
    expect(await count()).toBe(2);
    // Deleting the same comment again is refused and changes nothing.
    expect((await deleteComment(b.id, comments[0]!.id)).ok).toBe(false);
    expect(await count()).toBe(2);

    const owner = await createUser({ email: "owner@example.test", role: "OWNER", totp: true });
    const report = await fileReport(a.id, { targetType: "COMMENT", targetId: comments[1]!.id, reason: "SPAM", details: null });
    expect(report.ok).toBe(true);
    const open = await db.contentReport.findFirstOrThrow({ where: { targetId: comments[1]!.id } });
    expect((await moderate(owner.id, open.id, "remove", "spam")).ok).toBe(true);
    expect(await count()).toBe(1);

    expect((await addComment(a.id, { ideaId }, { body: "A new one", parentId: null })).ok).toBe(true);
    expect(await count()).toBe(2);
  });

  it("a number that drifted in the past is corrected by the next deletion", async () => {
    const { b, ideaId, comments, count } = await ideaWithComments();
    await db.businessIdea.update({ where: { id: ideaId }, data: { commentCount: 99 } });
    await deleteComment(b.id, comments[2]!.id);
    expect(await count()).toBe(2);
  });

  it("adding and deleting at the same moment never loses a comment from the count", async () => {
    const { a, b, ideaId, comments, count } = await ideaWithComments();
    await Promise.all([
      deleteComment(b.id, comments[0]!.id),
      addComment(a.id, { ideaId }, { body: "At the same time 1", parentId: null }),
      deleteComment(b.id, comments[1]!.id),
      addComment(a.id, { ideaId }, { body: "At the same time 2", parentId: null }),
    ]);
    const readable = await db.comment.count({ where: { ideaId, deletedAt: null, removedAt: null } });
    expect(readable).toBe(3);
    expect(await count()).toBe(readable);
  });
});
