/**
 * DIAGNOSTIC (read-only): follows the background "prefetch" requests a signed-in page makes
 * and reports, for each one, what the server answered and whether the browser saw it finish.
 *
 *   AUDIT_URL=http://127.0.0.1:3300 npx tsx scripts/audit/rsc.ts /community /admin
 */
import { chromium, type Request } from "@playwright/test";
import { TOTP } from "otpauth";
import { DEMO } from "../demo-config";

const BASE = process.env.AUDIT_URL ?? "http://127.0.0.1:3300";
const short = (u: string) => u.replace(BASE, "").slice(0, 70);

(async () => {
  const b = await chromium.launch({ channel: "msedge" });
  const p = await (await b.newContext({ viewport: { width: 1366, height: 860 } })).newPage();
  await p.goto(`${BASE}/login`);
  await p.getByLabel("Email address").fill(DEMO.ownerEmail);
  await p.getByLabel("Password", { exact: true }).fill(DEMO.password);
  await p.getByRole("button", { name: "Sign In" }).click();
  await p.waitForURL((u) => u.pathname !== "/login", { timeout: 20000 }).catch(() => {});
  if (p.url().includes("/login/verify")) {
    await p.getByLabel("Code").fill(new TOTP({ secret: DEMO.totpSecret }).generate());
    await p.getByRole("button", { name: "Verify" }).click();
    await p.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 }).catch(() => {});
  }

  type Row = { url: string; started: number; status?: number; location?: string; ended?: string; ms?: number; from?: string; bytes?: number };
  const rows = new Map<Request, Row>();
  let t0 = Date.now();
  p.on("request", (r) => {
    if (!r.url().includes("_rsc")) return;
    rows.set(r, { url: short(r.url()), started: Date.now() - t0, from: r.redirectedFrom() ? "redirect" : "page" });
  });
  p.on("response", async (res) => {
    const row = rows.get(res.request());
    if (!row) return;
    row.status = res.status();
    row.location = res.headers()["location"]?.replace(BASE, "").slice(0, 60);
  });
  p.on("requestfinished", async (r) => {
    const row = rows.get(r);
    if (!row) return;
    row.ended = "finished";
    row.ms = Date.now() - t0 - row.started;
    row.bytes = (await r.sizes().catch(() => null))?.responseBodySize;
  });
  p.on("requestfailed", (r) => {
    const row = rows.get(r);
    if (!row) return;
    row.ended = `failed: ${r.failure()?.errorText}`;
    row.ms = Date.now() - t0 - row.started;
  });

  // What the browser itself reports (cache use, and whether it ever reports the end of a request).
  const cdp = await p.context().newCDPSession(p);
  await cdp.send("Network.enable");
  const cdpRows = new Map<string, { url: string; cache?: boolean; ended?: boolean; type?: string; initiator?: string }>();
  cdp.on("Network.requestWillBeSent", (e) => {
    if (e.request.url.includes("_rsc")) cdpRows.set(e.requestId, { url: short(e.request.url), type: e.type, initiator: e.initiator.type });
  });
  cdp.on("Network.requestServedFromCache", (e) => {
    const r = cdpRows.get(e.requestId);
    if (r) r.cache = true;
  });
  cdp.on("Network.responseReceived", (e) => {
    const r = cdpRows.get(e.requestId);
    if (r && (e.response.fromDiskCache || e.response.fromPrefetchCache)) r.cache = true;
  });
  cdp.on("Network.loadingFinished", (e) => {
    const r = cdpRows.get(e.requestId);
    if (r) r.ended = true;
  });
  cdp.on("Network.loadingFailed", (e) => {
    const r = cdpRows.get(e.requestId);
    if (r) r.ended = true;
  });

  for (const path of process.argv.slice(2)) {
    rows.clear();
    cdpRows.clear();
    t0 = Date.now();
    const idle = await p.goto(BASE + path, { waitUntil: "networkidle", timeout: 15000 }).then(() => true).catch(() => false);
    const idleMs = Date.now() - t0;
    await p.waitForTimeout(Number(process.env.WAIT ?? 6) * 1000);
    const list = [...rows.values()];
    const open = list.filter((r) => !r.ended);
    console.log(`\n${path}: ${idle ? "idle" : "NOT idle"} after ${idleMs} ms; ${list.length} background requests, ${open.length} never finished`);
    const c = [...cdpRows.values()];
    console.log(`  browser's own view: ${c.length} requests, ${c.filter((x) => x.cache).length} answered from its cache, ${c.filter((x) => !x.ended).length} with no end reported`);
    for (const x of c.filter((x) => !x.ended || x.cache)) console.log(`    ${x.cache ? "from cache" : "network   "} ${x.ended ? "ended   " : "NO END  "} ${x.type} ${x.initiator} ${x.url}`);
    if (process.env.QUIET) continue;
    for (const r of list) console.log(`  ${String(r.started).padStart(5)}ms ${r.from!.padEnd(8)} ${String(r.status ?? "-").padEnd(4)} ${(r.ended ?? "STILL OPEN").padEnd(28)} ${r.ms ?? ""}ms ${r.bytes ?? ""}b ${r.url}${r.location ? " -> " + r.location : ""}`);
  }
  await b.close();
})();
