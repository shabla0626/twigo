import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CATEGORY_PHOTO_IDS, PHOTOS, type PhotoSlot } from "@/content/photos";

const root = process.cwd();
const slots = Object.entries(PHOTOS as Record<string, PhotoSlot>);

describe("photo manifest", () => {
  it("uses unique, local, descriptive file paths", () => {
    const srcs = slots.map(([, s]) => s.src);
    expect(new Set(srcs).size).toBe(srcs.length);
    for (const src of srcs) {
      expect(src).toMatch(/^\/images\/people\/[a-z-]+\/[a-z0-9-]+\.(jpg|webp)$/);
      expect(existsSync(path.join(root, "public", path.dirname(src)))).toBe(true);
    }
  });

  it("gives every slot alt text, a brief and a sensible minimum width", () => {
    for (const [id, s] of slots) {
      expect(s.alt.length, id).toBeGreaterThan(10);
      expect(s.brief.length, id).toBeGreaterThan(20);
      expect(s.minWidth, id).toBeGreaterThanOrEqual(1000);
    }
  });

  it("never describes people as members, staff or founders", () => {
    for (const [id, s] of slots) {
      expect(s.alt.toLowerCase(), id).not.toMatch(/our team|our staff|our founder|member of|employee/);
    }
  });

  it("maps category photos to existing slots", () => {
    for (const id of CATEGORY_PHOTO_IDS) expect(PHOTOS).toHaveProperty(id);
  });

  it("is fully documented in the shot list and the credits table", () => {
    const shotList = readFileSync(path.join(root, "docs/PHOTO-SHOT-LIST.md"), "utf8");
    const credits = readFileSync(path.join(root, "docs/IMAGE-CREDITS.md"), "utf8");
    for (const [id, s] of slots) {
      expect(shotList, id).toContain(`\`${id}\``);
      expect(shotList, id).toContain(`public${s.src}`);
      expect(credits, id).toContain(`\`${id}\``);
    }
  });
});

describe("image security", () => {
  const config = readFileSync(path.join(root, "next.config.ts"), "utf8");
  it("does not allow remote images", () => {
    expect(config).not.toMatch(/remotePatterns|domains\s*:/);
  });
  it("keeps the image CSP limited to the site itself", () => {
    expect(config).toContain(`"img-src 'self' data: blob:"`);
  });
});
