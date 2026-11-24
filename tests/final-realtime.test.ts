/**
 * Live chat and renewed acknowledgment (final completion, 24 November 2026): when a version that everyone
 * must accept again is published while the site runs, open chats are checked again; a member who has not
 * accepted it yet leaves the chat and receives nothing more until they accept.
 */
import { createServer, type Server as HttpServer } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { io as ioClient, type Socket } from "socket.io-client";
import { db } from "@/lib/db";
import { SESSION_COOKIE } from "@/lib/auth/constants";
import { createSession } from "@/lib/auth/session";
import { ensureLegalState } from "@/ops/legal-release";
import { changeStatus, recordAcceptance } from "@/server/legal";
import { attachRealtime, type RealtimeHandle } from "@/realtime/server";
import { cookieJar, createUser, resetDb } from "./helpers";
import { groupOfThree } from "./twigo-fixtures";

let http: HttpServer;
let rt: RealtimeHandle;
let port = 0;
const clients: Socket[] = [];

beforeAll(async () => {
  http = createServer();
  await new Promise<void>((r) => http.listen(0, "127.0.0.1", () => r()));
  port = (http.address() as { port: number }).port;
  rt = await attachRealtime(http, db, { siteUrl: `http://127.0.0.1:${port}`, databaseUrl: process.env.DATABASE_URL! });
});
beforeEach(async () => {
  await resetDb();
  cookieJar.clear();
});
afterAll(async () => {
  for (const c of clients) c.close();
  await rt.close();
  await db.$disconnect();
});

async function connect(userId: string) {
  const s = await createSession(userId, "MEMBER", { mfaVerified: true });
  const c = ioClient(`http://127.0.0.1:${port}`, {
    path: "/socket.io",
    transports: ["websocket"],
    extraHeaders: { cookie: `${SESSION_COOKIE}=${encodeURIComponent(s.token)}`, origin: `http://127.0.0.1:${port}` },
    reconnection: false,
  });
  clients.push(c);
  await new Promise<void>((resolve, reject) => {
    c.on("connect", () => resolve());
    c.on("connect_error", reject);
  });
  return c;
}
const emit = (c: Socket, ev: string, data: unknown) =>
  new Promise<Record<string, unknown> | "no answer">((resolve) => {
    const t = setTimeout(() => resolve("no answer"), 3000);
    c.emit(ev, data, (res: Record<string, unknown>) => {
      clearTimeout(t);
      resolve(res);
    });
  });

describe("publishing a version that must be accepted again", () => {
  it("removes members who have not accepted it from open chats; after accepting they chat again, the others receive nothing", async () => {
    const owner = await createUser({ email: "owner@example.test", role: "OWNER", totp: true });
    await ensureLegalState(db, "OtherName"); // version 1 and a version 2 awaiting review (another organization name: not the approved text)
    const f = await groupOfThree();
    const channel = await db.groupChannel.findFirstOrThrow({ where: { groupId: f.g.id } });
    const v1 = await db.legalDocumentVersion.findFirstOrThrow({ where: { document: { key: "privacy" }, version: 1 } });
    for (const u of [f.a, f.b]) await db.legalAcceptance.create({ data: { userId: u.id, versionId: v1.id, documentKey: "privacy", version: 1, contentHash: v1.contentHash, kind: "ACKNOWLEDGED", method: "registration" } });
    const ca = await connect(f.a.id);
    const cb = await connect(f.b.id);
    expect((await emit(ca, "channel:join", { channelId: channel.id }) as { ok: boolean }).ok).toBe(true);
    expect((await emit(cb, "channel:join", { channelId: channel.id }) as { ok: boolean }).ok).toBe(true);
    const revokedFor = (c: Socket) =>
      new Promise<boolean>((resolve) => {
        const t = setTimeout(() => resolve(false), 8000);
        c.once("access:revoked", () => (clearTimeout(t), resolve(true)));
      });
    const ra = revokedFor(ca);
    const rb = revokedFor(cb);
    // The owner approves and publishes version 2 (it asks everyone to accept it again).
    const v2 = await db.legalDocumentVersion.findFirstOrThrow({ where: { document: { key: "privacy" }, version: 2 } });
    expect(v2.requiresReacceptance).toBe(true);
    expect(await changeStatus(owner.id, v2.id, "APPROVED", { approvalNote: "Reviewed by counsel for this test, 24 November 2026." })).toEqual({ ok: true });
    expect((await changeStatus(owner.id, v2.id, "PUBLISHED")).ok).toBe(true);
    expect([await ra, await rb]).toEqual([true, true]);
    // Nothing can be sent or read until the new version is acknowledged.
    expect((await emit(ca, "message:send", { channelId: channel.id, body: "too early", clientId: "final-realtime-client-0", attachmentIds: [] }) as { ok: boolean }).ok).toBe(false);
    await recordAcceptance({ userId: f.a.id, key: "privacy", kind: "ACKNOWLEDGED", method: "reacceptance", versionId: v2.id });
    expect((await emit(ca, "channel:join", { channelId: channel.id }) as { ok: boolean }).ok).toBe(true);
    let leaked = false;
    cb.on("message:new", () => (leaked = true));
    expect((await emit(ca, "message:send", { channelId: channel.id, body: "after the update", clientId: "final-realtime-client-1", attachmentIds: [] }) as { ok: boolean }).ok).toBe(true);
    await new Promise((r) => setTimeout(r, 400));
    expect(leaked).toBe(false);
    expect((await emit(cb, "channel:join", { channelId: channel.id }) as { ok: boolean }).ok).toBe(false);
  });
});
