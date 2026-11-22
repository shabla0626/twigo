/**
 * Measures the production build against the local DEMO database:
 * response time, number of database queries and JavaScript sent, per page.
 *
 *   npm run demo:seed                         (fictional demo data)
 *   npm run perf:measure -- <label> --build   (production build into .next-perf, then measure)
 *   npm run perf:measure -- <label>           (measure the existing build)
 * Results: docs/performance/<label>.json
 *
 * Never touches the real database.
 */
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { createPrismaClient } from "../src/lib/db-core";
import { DEMO } from "./demo-config";

const PORT = 3300;
const BASE = `http://127.0.0.1:${PORT}`;
const RUNS = Number(process.env.PERF_RUNS ?? 7);
const label = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "baseline";

function build() {
  return new Promise<void>((resolve, reject) => {
    const p = spawn("npx next build --webpack", { shell: true, stdio: "inherit", env: { ...process.env, NEXT_DIST_DIR: ".next-perf", NODE_ENV: "production", SKIP_PROD_ENV_CHECK: "1", DATABASE_URL: DEMO.databaseUrl, SITE_URL: BASE } });
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`build failed (${code})`))));
  });
}
const COOKIE = "__Host-cw_session";

type Row = { path: string; who: string; status: number; medianMs: number; p90Ms: number; queries: number; queryMs: number; htmlKB: number; jsKB: number };

async function main() {
  if (process.argv.includes("--build")) await build();
  const db = createPrismaClient(DEMO.databaseUrl);
  // Sessions straight in the demo database (only the token's hash is stored).
  const session = async (email: string) => {
    const user = await db.user.findUniqueOrThrow({ where: { email } });
    const token = randomBytes(32).toString("base64url");
    await db.session.create({
      data: { tokenHash: createHash("sha256").update(token).digest("hex"), userId: user.id, mfaVerifiedAt: new Date(), reauthAt: new Date(), expiresAt: new Date(Date.now() + 3600_000) },
    });
    return token;
  };
  const who = { visitor: "", applicant: await session("omar@demo.test"), member: await session("maya@demo.test"), admin: await session(DEMO.ownerEmail) };
  const group = "/community/groups/bookkeeping-help-for-small-local-shops";
  const idea = await db.businessIdea.findFirstOrThrow({ where: { title: { startsWith: "Evening tutoring" } } });
  const app = await db.application.findFirstOrThrow({ where: { applicant: { email: "omar@demo.test" } } });
  const discussion = await db.groupDiscussion.findFirstOrThrow();
  const pages: [keyof typeof who, string][] = [
    ["visitor", "/"],
    ["visitor", "/how-it-works"],
    ["visitor", "/join"],
    ["visitor", "/login"],
    ["applicant", "/application"],
    ["member", "/community"],
    ["member", `/community/ideas/${idea.id}`],
    ["member", "/community/groups"],
    ["member", "/community/groups/mine"],
    ["member", group],
    ["member", `${group}/chat`],
    ["member", `${group}/research`],
    ["member", `${group}/meetings`],
    ["member", `${group}/discussions`],
    ["member", `${group}/discussions/${discussion.id}`],
    ["member", "/community/notifications"],
    ["member", "/community/profile"],
    ["admin", "/admin"],
    ["admin", "/admin/applications"],
    ["admin", `/admin/applications/${app.id}`],
    ["admin", "/admin/members"],
    ["admin", "/admin/email"],
  ];

  let queries = 0;
  let queryMs = 0;
  let trace: string[] = [];
  const server = spawn(process.execPath, ["--import", "tsx", "server.ts", "--production"], {
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(PORT),
      HOST: "127.0.0.1",
      SITE_URL: BASE,
      DATABASE_URL: DEMO.databaseUrl,
      NEXT_DIST_DIR: process.env.NEXT_DIST_DIR ?? ".next-perf",
      PRISMA_QUERY_LOG: "1",
      JOBS_ENABLED: "false",
      DEV_MAIL_CATCHER: "false",
      SMTP_HOST: "",
      SKIP_PROD_ENV_CHECK: "1",
      ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || "perf-measure-encryption-key-0123456789",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (b: Buffer) => {
    for (const line of b.toString().split("\n")) {
      const m = /^\[query\] ([\d.]+)ms/.exec(line);
      if (m) {
        queries++;
        queryMs += Number(m[1]);
        trace.push(line);
      }
    }
  });
  server.stderr.on("data", () => {});
  try {
    for (let i = 0; i < 120; i++) {
      const ok = await fetch(`${BASE}/api/health`).then((r) => r.ok).catch(() => false);
      if (ok) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    const jsCache = new Map<string, number>();
    const jsSize = async (src: string) => {
      if (!jsCache.has(src)) jsCache.set(src, (await (await fetch(new URL(src, BASE))).arrayBuffer()).byteLength);
      return jsCache.get(src)!;
    };
    const rows: Row[] = [];
    for (const [w, path] of pages) {
      const headers: Record<string, string> = w === "visitor" ? {} : { cookie: `${COOKIE}=${who[w]}` };
      const get = () => fetch(`${BASE}${path}`, { headers, redirect: "manual" });
      await (await get()).text(); // warm-up
      const times: number[] = [];
      let status = 0;
      let html = "";
      let q = 0;
      let qms = 0;
      for (let r = 0; r < RUNS; r++) {
        await new Promise((res) => setTimeout(res, 30));
        trace = [];
        const q0 = queries;
        const ms0 = queryMs;
        const t0 = performance.now();
        const res = await get();
        html = await res.text();
        times.push(performance.now() - t0);
        status = res.status;
        await new Promise((res2) => setTimeout(res2, 60));
        if (r === RUNS - 1) {
          q = queries - q0;
          qms = queryMs - ms0;
        }
      }
      // PERF_TRACE=<part of a path> prints the queries of that page.
      if (process.env.PERF_TRACE && path.includes(process.env.PERF_TRACE)) console.log([`--- queries for ${path}`, ...trace].join("\n"));
      times.sort((a, b) => a - b);
      const scripts = [...new Set([...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]!))];
      let js = 0;
      for (const s of scripts) js += await jsSize(s);
      rows.push({
        path: path.replace(idea.id, ":idea").replace(app.id, ":app").replace(discussion.id, ":discussion"),
        who: w,
        status,
        medianMs: Math.round(times[Math.floor(times.length / 2)]!),
        p90Ms: Math.round(times[Math.floor(times.length * 0.9)]!),
        queries: q,
        queryMs: qms,
        htmlKB: Math.round(html.length / 102.4) / 10,
        jsKB: Math.round(js / 102.4) / 10,
      });
      console.log(`${w.padEnd(9)} ${rows.at(-1)!.path.padEnd(58)} ${status} ${String(rows.at(-1)!.medianMs).padStart(5)}ms  q=${String(q).padStart(3)}  js=${rows.at(-1)!.jsKB}KB`);
    }
    mkdirSync("docs/performance", { recursive: true });
    writeFileSync(`docs/performance/${label}.json`, JSON.stringify({ label, measuredAt: new Date().toISOString(), runs: RUNS, rows }, null, 2));
    console.log(`saved docs/performance/${label}.json`);
  } finally {
    server.kill();
    await db.session.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() + 2 * 3600_000) }, mfaVerifiedAt: { not: null }, ipHash: null, userAgent: null } });
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
