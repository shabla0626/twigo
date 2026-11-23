/**
 * Stage 4: problems found during the final verification (not among the 59 audit findings).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) files(p, out);
    else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

describe("unread badges are readable", () => {
  it("white text never sits on the light reds (contrast below 4.5 to 1); the badges use rose-700", () => {
    // Found by the accessibility check of the Stage 4 crawl: white on rose-500 is about 3.7 to 1.
    // The badges only appear when there are unread messages, which is why earlier crawls missed them.
    const offenders: string[] = [];
    let badges = 0;
    for (const f of files("src")) {
      for (const line of readFileSync(f, "utf8").split("\n")) {
        if (/bg-rose-(300|400|500|600)\b/.test(line) && /text-white/.test(line)) offenders.push(`${f}: ${line.trim().slice(0, 80)}`);
        if (/bg-rose-700\b/.test(line) && /text-white/.test(line)) badges++;
      }
    }
    expect(offenders).toEqual([]);
    expect(badges).toBeGreaterThanOrEqual(4);
  });
});
