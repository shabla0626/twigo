/**
 * Production and development entry point: one Node.js process serves the
 * Next.js app, the Socket.IO realtime endpoint (/socket.io) and the daily
 * jobs (retention, backup). Requires an always-on host (VPS, Render,
 * Railway, Fly.io...); not compatible with serverless platforms.
 *
 *   npm run dev     (development, webpack)
 *   npm start       (production, after `npm run build`; runs `tsx server.ts --production`)
 */
import { createServer } from "node:http";
import path from "node:path";
import next from "next";
import { loadDotEnv } from "./scripts/load-env";
import { CLIENT_ADDRESS_HEADER, forwardedChainTooShort, resolveClientAddress } from "./src/lib/client-address";

if (process.argv.includes("--production")) (process.env as Record<string, string>).NODE_ENV = "production";
// Without --production this is the development server: say so explicitly, so every module (for example
// the email rule that keeps development mail on this computer) sees the same mode from the start.
else (process.env as Record<string, string>).NODE_ENV ??= "development";
loadDotEnv();

const dev = process.env.NODE_ENV !== "production";
// Production listens on 1010 (founder decision: the same port inside Docker and on the host, and the
// central Caddy's upstream). Development keeps 3000. PORT overrides both.
const port = Number(process.env.PORT || (dev ? 3000 : 1010));
// 127.0.0.1 rather than "localhost": some Windows setups block IPv6 loopback (::1).
const hostname = process.env.HOST || (dev ? "127.0.0.1" : "0.0.0.0");

function log(msg: string, meta: object = {}) {
  console.log(JSON.stringify({ level: "info", msg, time: new Date().toISOString(), ...meta }));
}

/** Stops the start with a readable list of what is wrong. Nothing is served. */
function refuseToStart(what: string, problems: string[]): never {
  console.error(`\nThe site was NOT started: ${what}.`);
  for (const p of problems) console.error(`  - ${p}`);
  console.error("See docs/DEPLOYMENT.md, section 4.\n");
  process.exit(1);
}

async function main() {
  // Check the settings before anything else: a wrong production configuration
  // must stop the start, not fail later on the first request.
  const { loadEnv, startupProblems, isLocalProductionTest } = await import("./src/lib/env-schema");
  let settings: ReturnType<typeof loadEnv>;
  try {
    settings = loadEnv(process.env);
  } catch (err) {
    refuseToStart("the settings are not valid", [err instanceof Error ? err.message : String(err)]);
  }
  const wrong = startupProblems(process.env, settings);
  if (wrong.length) refuseToStart("the production settings are incomplete", wrong);

  // Create the shared Prisma client before Next.js loads, so app code reuses it.
  const { createPrismaClient } = await import("./src/lib/db-core");
  const g = globalThis as unknown as { prisma?: ReturnType<typeof createPrismaClient> };
  const db = (g.prisma ??= createPrismaClient());

  // Development only: all email goes to the local test mail server (SMTP + web inbox), whatever
  // SMTP_HOST says, so a real provider key in .env never sends real email from a development computer.
  // DEV_MAIL_CATCHER="false" turns this off. Production never starts or uses it.
  const { devMailCatcherPort } = await import("./src/lib/email/status");
  const catcherPort = devMailCatcherPort();
  if (dev && catcherPort !== null) {
    const { startLocalMail } = await import("./scripts/dev-mail");
    const mail = await startLocalMail({ smtpPort: catcherPort }).catch((err: Error) => {
      log("devmail.failed", { error: err.message });
      return null;
    });
    if (mail) log("devmail.ready", { smtp: `127.0.0.1:${mail.smtpPort}`, inbox: mail.uiUrl, state: mail.smtp, note: "test emails are captured locally, not delivered" });
  }

  // This site keeps sign-in limits, chat presence and a small settings cache in the memory of
  // ONE process (see docs/DEPLOYMENT.md). A second instance on the same database would make
  // those limits and the chat unreliable, so it is detected: refused in production, warned about elsewhere.
  const { holdInstanceLock } = await import("./src/ops/instance-lock");
  const single = await holdInstanceLock(process.env.DATABASE_URL!);
  if (!single) {
    if (!dev && !isLocalProductionTest(process.env, settings)) refuseToStart("another instance of the site is already running on this database", ["run exactly one instance (docs/DEPLOYMENT.md, section 5)"]);
    log("server.second_instance", { warning: "another instance is already running on this database; sign-in limits and chat presence are per instance" });
  }

  // A real production start also checks the database: no leftover test administrators, and an owner exists.
  if (!dev && !isLocalProductionTest(process.env, settings)) {
    const { launchProblems } = await import("./src/ops/launch-checks");
    const found = await launchProblems(db);
    if (found.length) refuseToStart("the database is not ready for production", found);
    // Legal documents that are not yet reviewed and published are shown as clearly marked drafts.
    const unpublished = await db.legalDocument.count({ where: { versions: { none: { status: "PUBLISHED" } } } });
    if (unpublished) {
      log("launch.legal_documents_unpublished", { warning: `${unpublished} legal document(s) have no reviewed, published version yet; they are shown as drafts awaiting legal review` });
    }
    // The site still starts without the email provider's key, but no email can be sent: say so at once
    // (every attempt is also recorded as "Not sent: email not set up" in Admin → Email). Never logs the key.
    if (settings.SMTP_USER && !settings.SMTP_PASSWORD) {
      log("email.credentials_missing", { warning: `SMTP_PASSWORD is empty: no email will be sent through ${settings.SMTP_HOST} until the API key is set and the site is restarted` });
    }
  }

  const app = next({ dev, hostname, port, webpack: true });
  const handle = app.getRequestHandler();
  await app.prepare();
  const upgrade = app.getUpgradeHandler();

  // The address each request really came from (used to count sign-in and form attempts).
  // Always overwritten here, so a value sent by a visitor is never used.
  const trustedHops = Math.max(0, Math.trunc(Number(process.env.TRUSTED_PROXY_HOPS || 0)) || 0);
  let chainWarnedAt = 0;
  const httpServer = createServer((req, res) => {
    req.headers[CLIENT_ADDRESS_HEADER] = resolveClientAddress(req.socket.remoteAddress, req.headers["x-forwarded-for"], trustedHops);
    if (forwardedChainTooShort(req.headers["x-forwarded-for"], trustedHops) && Date.now() - chainWarnedAt > 3_600_000) {
      chainWarnedAt = Date.now();
      log("proxy.forwarded_chain_too_short", {
        warning: `X-Forwarded-For has fewer entries than TRUSTED_PROXY_HOPS=${trustedHops}: all visitors would share one sign-in limit. Configure the reverse proxy to keep the forwarded chain (Caddy: trusted_proxies for Cloudflare), or lower TRUSTED_PROXY_HOPS (docs/DEPLOYMENT.md, section 5).`,
      });
    }
    void handle(req, res);
  });

  const { attachRealtime } = await import("./src/realtime/server");
  const realtime = await attachRealtime(httpServer, db, {
    siteUrl: process.env.SITE_URL || `http://localhost:${port}`,
    databaseUrl: process.env.DATABASE_URL!,
    log,
  });

  // Socket.IO handles its own upgrades; everything else (e.g. Next.js HMR in dev) goes to Next.
  httpServer.on("upgrade", (req, socket, head) => {
    if (req.url?.startsWith("/socket.io")) return;
    void upgrade(req, socket, head);
  });

  let stopJobs = () => {};
  if (process.env.JOBS_ENABLED !== "false") {
    const { startScheduler } = await import("./src/ops/scheduler");
    stopJobs = startScheduler(db, {
      databaseUrl: process.env.DATABASE_URL!,
      storageDir: path.resolve(process.env.STORAGE_DIR || "storage"),
      backupDir: process.env.BACKUP_DIR || "backups",
      backupKeep: Number(process.env.BACKUP_KEEP || 14),
      backupKey: process.env.BACKUP_ENCRYPTION_KEY || undefined,
      log,
    });
  }

  httpServer.listen(port, hostname, () =>
    log("server.ready", {
      url: `http://${hostname}:${port}`,
      dev,
      clientAddress: trustedHops ? `X-Forwarded-For, ${trustedHops} trusted proxy hop(s)` : "network connection (no proxy trusted)",
    }),
  );

  const shutdown = async (signal: string) => {
    log("server.shutdown", { signal });
    stopJobs();
    await realtime.close().catch(() => {});
    await db.$disconnect().catch(() => {});
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
