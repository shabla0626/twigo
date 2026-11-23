/**
 * Regression tests for the corrective implementation plan, Stage 2: checks without a database.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { outstandingLaunchItems } from "@/config/launch-placeholders";

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) files(p, out);
    else if (/\.(tsx?|md)$/.test(name)) out.push(p);
  }
  return out;
}
const read = (p: string) => readFileSync(p, "utf8");
const SITE = files("src/app/(site)");
const text = (p: string) => read(p);

describe("P2-20 (updated for Twigo): no unfinished placeholder is public; open points are listed for the owner", () => {
  it("no public page or component shows a bracketed placeholder", () => {
    const offenders = [...SITE, ...files("src/components/site"), ...files("src/content/legal")].filter((f) => /<Placeholder>|\[(Company Name|Legal Address|Legal entity name|Jurisdiction)\]/.test(text(f)));
    expect(offenders).toEqual([]);
  });

  it("the owner's list names every unconfirmed notice and every unpublished document", () => {
    const items = outstandingLaunchItems({
      legalDocs: [{ key: "terms", title: "Terms of Use", status: "PENDING_LEGAL_REVIEW" }, { key: "cookies", title: "Cookie Policy", status: "PUBLISHED" }],
      unconfirmedNotices: ["Legal operator name", "Jurisdiction"],
      contactEmail: "",
    });
    expect(items.map((i) => i.what)).toEqual(["Legal operator name not confirmed", "Jurisdiction not confirmed", "Official contact email address", "Terms of Use: legal review and publication"]);
    for (const item of items) for (const page of item.pages) expect(page.href.startsWith("/")).toBe(true);
    expect(outstandingLaunchItems({ legalDocs: [{ key: "terms", title: "Terms of Use", status: "PUBLISHED" }], unconfirmedNotices: [], contactEmail: "a@b.example" })).toEqual([]);
  });
});

describe("P2-19: the public revenue explanation says what was decided, and nothing more", () => {
  const page = text("src/app/(site)/compensation/page.tsx");
  const flow = text("src/components/visuals/revenue-flow.tsx");
  const faq = text("src/lib/content/defaults.ts");

  // Founder's Twigo decision (23 November 2026) replaces decision 3: the platform takes no commission at all;
  // the participants of each project decide how its revenue is shared.
  it("states no fee, no commission, no automatic deduction, and that the participants decide", () => {
    expect(page).toContain("No membership fee, ever.");
    expect(page).toContain("No commission, percentage or ownership share of project revenue for ${name}.");
    expect(page).toContain("No automatic deductions: ${name} never collects, holds or distributes project money.");
    expect(page).toContain("Every participant must accept the agreement.");
    expect(page).toContain("Voluntary support for ${name} is separate and never comes out of project earnings.");
    expect(flow).toContain("Nothing else is deducted.");
    expect(flow).toContain("receives nothing");
    expect(faq).toContain("takes no commission, percentage or ownership share of project revenue, and never deducts anything");
    for (const source of [page, flow, faq]) expect(source).not.toMatch(/organizational fee|organizational percentage/);
  });

  it("publishes no percentage and no amount", () => {
    for (const source of [page, faq]) {
      const visible = source.replace(/className="[^"]*"/g, "").replace(/w-\[\d+%\]/g, "");
      expect(visible).not.toMatch(/\d+\s?%/);
      expect(visible).not.toMatch(/[$€£]\s?\d/);
    }
    // The diagram's bar widths are layout only; its own caption says so.
    expect(flow).toContain("the proportions are not real figures, percentages or a promise of any amount");
  });
});

describe("P2-10: public and member wording describes meetings accurately", () => {
  const all = [...files("src/app"), ...files("src/components"), ...files("src/lib/content")].map(text).join("\n");

  it("no page promises voice or video built into the site", () => {
    expect(all).not.toMatch(/voice and video meetings/i);
    expect(all).not.toMatch(/Start (Voice|Video) Meeting/);
    expect(all).not.toMatch(/meet by voice or video/i);
  });

  it("the public page and the help page name Google Meet", () => {
    expect(text("src/app/(site)/how-it-works/page.tsx")).toContain("holds its meetings through Google Meet");
    expect(text("src/app/community/(portal)/help/page.tsx")).toContain("Meetings run in Google Meet");
  });
});

describe("P2-18: the organization's name is not written into the code", () => {
  it("no source file outside the defaults contains the name as fixed text", () => {
    const offenders = [...files("src/app"), ...files("src/components"), ...files("src/server"), ...files("src/lib"), ...files("src/ops"), ...files("src/realtime")]
      .filter((f) => !/env-schema\.ts$|brand\.ts$/.test(f.replace(/\\/g, "/")))
      .filter((f) => /CoWork/.test(text(f)));
    expect(offenders).toEqual([]);
  });
});
