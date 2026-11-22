/**
 * Regression tests for the corrective implementation plan, Stage 2 (third part).
 * P2-11 attachments, P2-16 sign-in answers, P2-22 job lock, P2-24 upload limit, P2-25 single instance.
 */
import { mkdirSync, mkdtempSync, existsSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { POST as uploadRoute } from "@/app/api/files/route";
import { authenticate } from "@/lib/auth/service";
import { rateLimit, rateLimitReached, resetRateLimits } from "@/lib/rate-limit";
import { updateApplicationStatus } from "@/server/admin/applications";
import { requestPasswordReset } from "@/server/accounts";
import { authorizeDownload, discardUnsentAttachment, listGroupFiles } from "@/server/community/files";
import { createIdea, endorseIdea } from "@/server/community/ideas";
import { fileReport, moderate } from "@/server/community/reports";
import { resendVerificationByEmail } from "@/server/onboarding";
import { purgeUnsentAttachments } from "@/ops/housekeeping";
import { holdInstanceLock, INSTANCE_LOCK, releaseInstanceLock } from "@/ops/instance-lock";
import { runRetention } from "@/ops/retention";
import { LOCKS, withJobLock } from "@/ops/scheduler";
import { saveSetting } from "@/server/settings";
import { channelAccess, sendMessage } from "@/realtime/chat-service";
import { Client } from "pg";
import { cookieJar, createApplicantAccount, createMember, createUser, PASSWORD, resetDb, signIn, submitTestApplication } from "./helpers";

const storage = process.env.STORAGE_DIR!;
beforeEach(async () => {
  await resetDb();
  cookieJar.clear();
  resetRateLimits();
});
afterAll(async () => {
  await releaseInstanceLock();
  await db.$disconnect();
});

async function group() {
  const [a, b, c] = [await createMember("Alice"), await createMember("Bob"), await createMember("Cara")];
  const res = await createIdea(a.id, {
    title: "Neighborhood bookkeeping service", summary: "Small local shops need simple, affordable monthly bookkeeping help.", category: "ONLINE_SERVICES",
    description: null, problem: null, proposal: null, customers: null, revenueModel: null, skillsNeeded: null, timeEstimate: null, links: [],
  });
  if (!res.ok) throw new Error(res.error);
  await endorseIdea(b.id, res.id);
  await endorseIdea(c.id, res.id);
  const g = await db.researchGroup.findUniqueOrThrow({ where: { ideaId: res.id }, include: { channels: true } });
  return { a, b, c, g, channelId: g.channels[0]!.id };
}
/** A stored chat upload with a real file on disk. */
async function upload(ownerId: string, groupId: string, key: string, at = new Date()) {
  const storageKey = `chat_attachment/test/${key}`;
  mkdirSync(path.join(storage, "chat_attachment", "test"), { recursive: true });
  writeFileSync(path.join(storage, storageKey), "file content");
  return db.storedFile.create({ data: { ownerId, scope: "CHAT_ATTACHMENT", groupId, originalName: `${key}.pdf`, mimeType: "application/pdf", size: 12, sha256: key, storageKey, createdAt: at } });
}
const onDisk = (f: { storageKey: string }) => existsSync(path.join(storage, f.storageKey));
let n = 0;
async function send(userId: string, channelId: string, body: string, attachmentIds: string[] = []) {
  const access = (await channelAccess(db, userId, channelId))!;
  return sendMessage(db, userId, access, { channelId, body, clientId: `corrective-stage2c-${++n}`, attachmentIds });
}

describe("P2-11: chat attachments follow their messages", () => {
  it("a file that was chosen but never sent is not shown to the group and only its uploader can open it", async () => {
    const { a, b, g } = await group();
    const f = await upload(a.id, g.id, "unsent");
    expect(await listGroupFiles(g.id, b.id)).toEqual([]);
    expect(await listGroupFiles(g.id, a.id)).toEqual([]);
    expect(await authorizeDownload(b.id, f.id)).toBeNull();
    expect((await authorizeDownload(a.id, f.id))?.id).toBe(f.id);
  });

  it("removing it from the message box deletes it; nobody else can do that, and a sent file cannot be discarded", async () => {
    const { a, b, g, channelId } = await group();
    const f = await upload(a.id, g.id, "removed");
    expect(await discardUnsentAttachment(b.id, f.id)).toBe(false);
    expect(await discardUnsentAttachment(a.id, f.id)).toBe(true);
    expect(await db.storedFile.count({ where: { id: f.id } })).toBe(0);
    expect(onDisk(f)).toBe(false);

    const sent = await upload(a.id, g.id, "sent");
    expect((await send(a.id, channelId, "with file", [sent.id])).ok).toBe(true);
    expect(await discardUnsentAttachment(a.id, sent.id)).toBe(false);
    expect((await listGroupFiles(g.id, b.id)).map((x) => x.originalName)).toEqual(["sent.pdf"]);
  });

  it("two messages sent at the same moment cannot both take the same file", async () => {
    const { a, g, channelId } = await group();
    const f = await upload(a.id, g.id, "contested");
    const results = await Promise.all([send(a.id, channelId, "one", [f.id]), send(a.id, channelId, "two", [f.id])]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toMatchObject({ ok: false, error: expect.stringContaining("attachment is missing") });
    expect(await db.chatMessage.count({ where: { channelId, kind: "USER" } })).toBe(1);
  });

  it("uploads that were never sent are deleted after a day; newer ones and sent ones are kept", async () => {
    const { a, g, channelId } = await group();
    const old = await upload(a.id, g.id, "old-unsent", new Date(Date.now() - 30 * 3600_000));
    const fresh = await upload(a.id, g.id, "fresh-unsent");
    const oldSent = await upload(a.id, g.id, "old-sent", new Date(Date.now() - 30 * 3600_000));
    await send(a.id, channelId, "sent long ago", [oldSent.id]);
    expect(await purgeUnsentAttachments(db, storage)).toBe(1);
    expect([onDisk(old), onDisk(fresh), onDisk(oldSent)]).toEqual([false, true, true]);
    expect((await db.storedFile.findMany({ orderBy: { originalName: "asc" } })).map((x) => x.originalName)).toEqual(["fresh-unsent.pdf", "old-sent.pdf"]);
  });

  it("a message removed by moderation takes its attachments with it", async () => {
    const owner = await createUser({ totp: true });
    const { a, b, g, channelId } = await group();
    const f = await upload(a.id, g.id, "offending");
    const sent = await send(a.id, channelId, "bad message", [f.id]);
    if (!sent.ok) throw new Error(sent.error);
    expect((await authorizeDownload(b.id, f.id))?.id).toBe(f.id);
    expect((await fileReport(b.id, { targetType: "MESSAGE", targetId: sent.message.id, reason: "HARASSMENT", details: null })).ok).toBe(true);
    const report = await db.contentReport.findFirstOrThrow();
    expect((await moderate(owner.id, report.id, "remove", "not acceptable")).ok).toBe(true);
    expect(await authorizeDownload(b.id, f.id)).toBeNull();
    expect(await listGroupFiles(g.id, b.id)).toEqual([]);
  });

  it("when old chat messages are purged, their attachments are purged with them", async () => {
    const owner = await createUser({ totp: true });
    const { a, g, channelId } = await group();
    await saveSetting(owner.id, "retention.chatMessagesDays", 30);
    const f = await upload(a.id, g.id, "ancient");
    const old = await send(a.id, channelId, "ancient message", [f.id]);
    const keep = await upload(a.id, g.id, "recent");
    await send(a.id, channelId, "recent message", [keep.id]);
    if (!old.ok) throw new Error(old.error);
    await db.chatMessage.update({ where: { id: old.message.id }, data: { createdAt: new Date(Date.now() - 90 * 24 * 3600_000) } });
    await runRetention(db, { dryRun: false, storageDir: storage });
    expect((await db.storedFile.findMany()).map((x) => x.originalName)).toEqual(["recent.pdf"]);
    expect([onDisk(f), onDisk(keep)]).toEqual([false, true]);
  });
});

describe("P2-16: nothing about sign-in reveals whether an address has an account", () => {
  const ctx = (ip: string) => ({ ipHash: ip });

  it("forgot password: the same answer for every address, given before the email is sent", async () => {
    const m = await createMember("Mia");
    const known = await requestPasswordReset(m.email, "ip-1");
    // The answer is already there; the email is sent afterwards.
    expect(await db.emailDelivery.count()).toBe(0);
    expect(await db.accountToken.count({ where: { kind: "RESET_PASSWORD" } })).toBe(0);
    const unknown = await requestPasswordReset("ghost@example.test", "ip-1");
    expect(known.message).toBe(unknown.message);
    await known.done;
    await unknown.done;
    expect(await db.accountToken.count({ where: { kind: "RESET_PASSWORD", userId: m.id } })).toBe(1);
    expect(await db.emailDelivery.count({ where: { templateKey: "password_reset" } })).toBe(1);
  });

  it("resending a confirmation link works the same way", async () => {
    const waiting = await createApplicantAccount("waiting@example.test", "Wai Ting", { verified: false });
    const known = await resendVerificationByEmail("waiting@example.test", "ip-2");
    expect(await db.accountToken.count({ where: { kind: "VERIFY_EMAIL" } })).toBe(0);
    const unknown = await resendVerificationByEmail("ghost@example.test", "ip-2");
    expect(known.message).toBe(unknown.message);
    await known.done;
    expect(await db.accountToken.count({ where: { kind: "VERIFY_EMAIL", userId: waiting.id } })).toBe(1);
  });

  it("a locked sign-in answers exactly like a wrong password, for real and unknown addresses alike", async () => {
    const m = await createMember("Mia");
    const real: string[] = [];
    const ghost: string[] = [];
    for (let i = 0; i < 8; i++) {
      real.push(JSON.stringify(await authenticate(m.email, "wrong-password", ctx("ip-attacker"))));
      ghost.push(JSON.stringify(await authenticate("ghost@example.test", "wrong-password", ctx("ip-attacker-2"))));
    }
    expect(new Set([...real, ...ghost]).size).toBe(1);
    expect(real[0]).toBe(JSON.stringify({ ok: false, error: "Invalid email or password." }));
    // The lock is real: the correct password is refused from that network...
    expect((await authenticate(m.email, PASSWORD, ctx("ip-attacker"))).ok).toBe(false);
    // ...but not from another one. One outsider cannot lock someone else out.
    expect((await authenticate(m.email, PASSWORD, ctx("ip-home"))).ok).toBe(true);
    // Recorded once as a lock, not on every refused attempt.
    expect(await db.auditLog.count({ where: { action: "auth.locked", entityId: m.id } })).toBe(1);
  });

  it("looking at a counter does not count as an attempt", () => {
    expect(rateLimitReached("probe-key", 2)).toBe(false);
    rateLimit("probe-key", 2, 60_000);
    expect(rateLimitReached("probe-key", 2)).toBe(false);
    rateLimit("probe-key", 2, 60_000);
    for (let i = 0; i < 5; i++) expect(rateLimitReached("probe-key", 2)).toBe(true);
    expect(rateLimitReached("probe-key", 2, Date.now() + 61_000)).toBe(false);
  });
});

describe("P2-22: the job lock is taken and released on one connection", () => {
  const url = process.env.DATABASE_URL!;

  it("a second run is refused while the first is running, and allowed again afterwards (every time)", async () => {
    for (let i = 0; i < 5; i++) {
      let innerRan = false;
      let secondRan = false;
      const first = await withJobLock(url, LOCKS.backup, async () => {
        innerRan = true;
        secondRan = await withJobLock(url, LOCKS.backup, async () => {});
      });
      expect([first, innerRan, secondRan]).toEqual([true, true, false]);
    }
    expect(await withJobLock(url, LOCKS.backup, async () => {})).toBe(true);
  });

  it("a job that fails still releases the lock", async () => {
    await expect(withJobLock(url, LOCKS.retention, async () => Promise.reject(new Error("job broke")))).rejects.toThrow("job broke");
    expect(await withJobLock(url, LOCKS.retention, async () => {})).toBe(true);
  });

  it("different jobs do not block each other", async () => {
    let other = false;
    await withJobLock(url, LOCKS.backup, async () => {
      other = await withJobLock(url, LOCKS.retention, async () => {});
    });
    expect(other).toBe(true);
  });
});

describe("P2-25: one running instance per database", () => {
  it("a second instance cannot take the instance lock; it is free again when the first one is gone", async () => {
    const u = new URL(process.env.DATABASE_URL!);
    u.searchParams.delete("schema");
    const other = new Client({ connectionString: u.toString() });
    await other.connect();
    expect((await other.query("SELECT pg_try_advisory_lock($1) AS ok", [INSTANCE_LOCK])).rows[0].ok).toBe(true); // "another instance"
    expect(await holdInstanceLock(process.env.DATABASE_URL!)).toBe(false);
    await other.end(); // that instance stops (or crashes): its lock disappears with its connection
    expect(await holdInstanceLock(process.env.DATABASE_URL!)).toBe(true);
    expect(await holdInstanceLock(process.env.DATABASE_URL!)).toBe(true); // asking again is harmless
    await releaseInstanceLock();
  });
});

describe("P2-24: the upload size limit is enforced while reading", () => {
  const origin = "http://localhost:3000";
  const request = (body: BodyInit | null, headers: Record<string, string>) =>
    uploadRoute(new NextRequest(`${origin}/api/files`, { method: "POST", body, headers: { origin, ...headers }, ...(body ? { duplex: "half" } : {}) } as ConstructorParameters<typeof NextRequest>[1]));

  it("refuses an upload that does not state its size, and one that states too much", async () => {
    const m = await createMember("Mia");
    await signIn(m.id);
    const noSize = await request("x", { "content-type": "multipart/form-data; boundary=x" });
    // (fetch adds the length for a string body, so it is removed again to imitate a streamed upload)
    const streamed = new NextRequest(`${origin}/api/files`, { method: "POST", headers: { origin, "content-type": "multipart/form-data; boundary=x" } });
    expect((await uploadRoute(streamed)).status).toBe(411);
    expect([400, 411]).toContain(noSize.status);
    const tooBig = await request(null, { "content-type": "multipart/form-data; boundary=x", "content-length": String(500 * 1024 * 1024) });
    expect(tooBig.status).toBe(413);
  });

  it("stops reading when the body is larger than it claimed", async () => {
    const m = await createMember("Mia");
    await signIn(m.id);
    const { g } = await group();
    void g;
    const limitMb = Number(process.env.MAX_UPLOAD_MB ?? 10);
    let sent = 0;
    const chunk = new Uint8Array(1024 * 1024);
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        // Would send 200 MB if nobody stopped it.
        if (sent >= 200) return controller.close();
        sent++;
        controller.enqueue(chunk);
      },
    });
    const res = await request(stream, { "content-type": "multipart/form-data; boundary=x", "content-length": "1000" });
    expect(res.status).toBe(413);
    expect(sent).toBeLessThan(limitMb + 5);
  });

  it("a normal small upload still works", async () => {
    const { a, g } = await group();
    await signIn(a.id);
    const fd = new FormData();
    fd.set("scope", "GROUP_FILE");
    fd.set("groupId", g.id);
    fd.set("file", new File(["hello, this is a plain text note for the group"], "note.txt", { type: "text/plain" }));
    const probe = new Request(`${origin}/api/files`, { method: "POST", body: fd });
    const bytes = new Uint8Array(await probe.arrayBuffer());
    const res = await request(bytes, { "content-type": probe.headers.get("content-type")!, "content-length": String(bytes.byteLength) });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, file: { name: "note.txt" } });
    rmSync(mkdtempSync(path.join(os.tmpdir(), "x-")), { recursive: true, force: true });
  });
});

// Used above only to keep an import that documents intent.
void updateApplicationStatus;
void submitTestApplication;
