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
import { CLIENT_ADDRESS_HEADER, resolveClientAddress } from "./src/lib/client-address";

if (process.argv.includes("--production")) (process.env as Record<string, string>).NODE_ENV = "production";
loadDotEnv();

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT || 3000);
// 127.0.0.1 rather than "localhost": some Windows setups block IPv6 loopback (::1).
const hostname = process.env.HOST || (dev ? "127.0.0.1" : "0.0.0.0");

function log(msg: string, meta: object = {}) {
  console.log(JSON.stringify({ level: "info", msg, time: new Date().toISOString(), ...meta }));
}

async function main() {
  // Create the shared Prisma client before Next.js loads, so app code reuses it.
  const { createPrismaClient } = await import("./src/lib/db-core");
  const g = globalThis as unknown as { prisma?: ReturnType<typeof createPrismaClient> };
  const db = (g.prisma ??= createPrismaClient());

  // Development only: when .env points email at this computer, start the local
  // test mail server (SMTP + web inbox) so sending never fails with ECONNREFUSED.
  const smtpHost = (process.env.SMTP_HOST || "").toLowerCase();
  if (dev && process.env.DEV_MAIL_CATCHER !== "false" && ["127.0.0.1", "localhost"].includes(smtpHost)) {
    const { startLocalMail } = await import("./scripts/dev-mail");
    const mail = await startLocalMail({ smtpPort: Number(process.env.SMTP_PORT || 2525) }).catch((err: Error) => {
      log("devmail.failed", { error: err.message });
      return null;
    });
    if (mail) log("devmail.ready", { smtp: `127.0.0.1:${mail.smtpPort}`, inbox: mail.uiUrl, state: mail.smtp, note: "test emails are captured locally, not delivered" });
  }

  const app = next({ dev, hostname, port, webpack: true });
  const handle = app.getRequestHandler();
  await app.prepare();
  const upgrade = app.getUpgradeHandler();

  // The address each request really came from (used to count sign-in and form attempts).
  // Always overwritten here, so a value sent by a visitor is never used.
  const trustedHops = Math.max(0, Math.trunc(Number(process.env.TRUSTED_PROXY_HOPS || 0)) || 0);
  const httpServer = createServer((req, res) => {
    req.headers[CLIENT_ADDRESS_HEADER] = resolveClientAddress(req.socket.remoteAddress, req.headers["x-forwarded-for"], trustedHops);
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
