/**
 * Found during the Stage 4 walkthrough (not one of the 59 audit findings): every upload from the
 * site's real address was refused with "Invalid origin.", because the upload endpoint compared
 * the browser's Origin with the address the server sees for itself (an internal name such as
 * "localhost"). Group files, chat attachments and profile photos were all affected.
 */
import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { resetEnvCache } from "@/lib/env";
import { uploadOriginAllowed } from "@/lib/origin";
import { createIdea, endorseIdea } from "@/server/community/ideas";
import { POST as uploadRoute } from "@/app/api/files/route";
import { cookieJar, createMember, resetDb, signIn } from "./helpers";

const PUBLIC = "https://cowork.example";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

let savedSiteUrl: string | undefined;
beforeEach(async () => {
  await resetDb();
  cookieJar.clear();
  savedSiteUrl = process.env.SITE_URL;
});
afterEach(() => {
  process.env.SITE_URL = savedSiteUrl;
  resetEnvCache();
});
afterAll(async () => {
  await db.$disconnect();
});

describe("upload origin check", () => {
  it("accepts exactly the site's public address", () => {
    expect(uploadOriginAllowed(PUBLIC, PUBLIC)).toBe(true);
    expect(uploadOriginAllowed(PUBLIC, `${PUBLIC}/`)).toBe(true);
    expect(uploadOriginAllowed("https://cowork.example:443", PUBLIC)).toBe(false); // not how a browser writes it
    for (const bad of [null, "", "null", "https://evil.example", "http://cowork.example", "https://cowork.example.evil.example", "https://cowork.example/path", "not a url"]) {
      expect(uploadOriginAllowed(bad, PUBLIC), String(bad)).toBe(false);
    }
  });

  it("a member uploads a group file from the public address while the server knows itself by an internal name", async () => {
    process.env.SITE_URL = PUBLIC;
    resetEnvCache();
    const [a, b, c] = [await createMember("Alice"), await createMember("Bob"), await createMember("Cara")];
    const res = await createIdea(a.id, {
      title: "Neighborhood bookkeeping service",
      summary: "Small local shops need simple, affordable monthly bookkeeping help.",
      category: "ONLINE_SERVICES",
      description: null, problem: null, proposal: null, customers: null, revenueModel: null, skillsNeeded: null, timeEstimate: null,
      links: [],
    });
    if (!res.ok) throw new Error(res.error);
    await endorseIdea(b.id, res.id);
    await endorseIdea(c.id, res.id);
    const g = await db.researchGroup.findUniqueOrThrow({ where: { ideaId: res.id } });
    await signIn(a.id);

    // One multipart body, sent several times. The server sees an internal address
    // ("localhost:3400"), exactly as behind a proxy or with HOST=127.0.0.1.
    const form = new FormData();
    form.set("scope", "GROUP_FILE");
    form.set("groupId", g.id);
    form.set("file", new File([PNG], "map.png", { type: "image/png" }));
    const asResponse = new Response(form);
    const contentType = asResponse.headers.get("content-type")!;
    const body = await asResponse.arrayBuffer();
    const request = (origin: string) =>
      uploadRoute(new NextRequest("http://localhost:3400/api/files", { method: "POST", body, headers: { origin, "content-type": contentType, "content-length": String(body.byteLength) } }));

    const ok = await request(PUBLIC);
    expect(ok.status).toBe(200);
    // Images are re-encoded (which also removes hidden metadata such as location), hence ".webp".
    expect(await ok.json()).toMatchObject({ ok: true, file: { name: "map.webp", mimeType: "image/webp" } });
    expect(await db.storedFile.count({ where: { groupId: g.id, scope: "GROUP_FILE", deletedAt: null } })).toBe(1);

    // Another site is still refused, and so is the internal name itself.
    for (const origin of ["https://evil.example", "http://localhost:3400"]) {
      const refused = await request(origin);
      expect(refused.status, origin).toBe(403);
    }
    expect(await db.storedFile.count()).toBe(1);
  });
});
