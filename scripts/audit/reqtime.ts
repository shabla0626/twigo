/** AUDIT DIAGNOSTIC (temporary): time to network-idle and slow/unfinished requests, repeated. */
import { chromium } from "@playwright/test";
const BASE = process.env.AUDIT_URL ?? "http://127.0.0.1:3100";
(async () => {
  const b = await chromium.launch({ channel: "msedge" });
  for (let i = 0; i < Number(process.argv[3] ?? 6); i++) {
    const ctx = await b.newContext({ viewport: { width: 1366, height: 860 }, reducedMotion: "reduce" });
    const p = await ctx.newPage();
    const open = new Map<string, number>();
    p.on("request", (r) => open.set(r.url(), Date.now()));
    const done = (r: { url(): string }) => {
      const t = open.get(r.url());
      if (t && Date.now() - t > 1500) console.log("   slow", Date.now() - t, "ms", r.url().replace(BASE, "").slice(0, 80));
      open.delete(r.url());
    };
    p.on("requestfinished", done);
    p.on("requestfailed", done);
    const t0 = Date.now();
    const ok = await p.goto(BASE + process.argv[2], { waitUntil: "networkidle", timeout: 25000 }).then(() => true).catch(() => false);
    console.log(i, ok ? "idle after" : "NOT idle after", Date.now() - t0, "ms; still open:", [...open.keys()].map((u) => u.replace(BASE, "").slice(0, 70)));
    await ctx.close();
  }
  await b.close();
})();
