/**
 * Regression tests for the corrective implementation plan, Stage 2: checks without a database.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { outstandingLaunchItems, SETTING_PLACEHOLDER_USES, TEXT_PLACEHOLDERS } from "@/config/launch-placeholders";

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

describe("P2-20: every public placeholder is known and listed for the owner", () => {
  it("the list matches the placeholders that are really in the public pages", () => {
    const uses = SITE.reduce((n, f) => n + (text(f).match(/<Placeholder>/g)?.length ?? 0), 0);
    expect(uses).toBe(TEXT_PLACEHOLDERS.length + SETTING_PLACEHOLDER_USES);
  });

  it("with nothing supplied all ten items are listed; supplying the three settings leaves the legal texts", () => {
    const nothing = outstandingLaunchItems({ legalName: "", jurisdiction: "", contactEmail: "" });
    expect(nothing).toHaveLength(TEXT_PLACEHOLDERS.length + 3);
    expect(nothing.map((i) => i.what)).toEqual(expect.arrayContaining(["Legal name of the organization", "Governing law and jurisdiction", "Official contact email address"]));
    const set = outstandingLaunchItems({ legalName: "Organization LLC", jurisdiction: "Somewhere", contactEmail: "hello@organization.org" });
    expect(set).toEqual(TEXT_PLACEHOLDERS);
    for (const item of nothing) {
      expect(item.pages.length).toBeGreaterThan(0);
      for (const page of item.pages) expect(page.href.startsWith("/")).toBe(true);
    }
  });
});

describe("P2-19: the public revenue explanation says what was decided, and nothing more", () => {
  const page = text("src/app/(site)/compensation/page.tsx");
  const flow = text("src/components/visuals/revenue-flow.tsx");
  const faq = text("src/lib/content/defaults.ts");

  it("states disclosure, prior written agreement of expenses and fees, and no fixed percentage", () => {
    expect(page).toContain("The revenue a customer pays for a project is disclosed to the people who work on that project.");
    expect(page).toContain("Project expenses, any organizational fee, and each person's compensation are agreed in writing before commercial work begins.");
    expect(page).toContain("There is no fixed organizational percentage.");
    expect(page).toContain("What is distributed follows actual contributions and those agreements.");
    expect(page).toContain("There are no undisclosed deductions.");
    expect(flow).toContain("Agreed expenses and fees");
    expect(flow).toContain("Nothing else is deducted.");
    expect(faq).toContain("there is no fixed organizational percentage and there are no undisclosed deductions");
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
