// Prisma client factory without `server-only`, for the custom server,
// realtime layer and CLI scripts. Application code imports `db` from ./db.
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Prisma's Rust-free client (queryCompiler + node-postgres driver adapter).
export function createPrismaClient(connectionString = process.env.DATABASE_URL): PrismaClient {
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const url = new URL(connectionString);
  const schema = url.searchParams.get("schema") ?? undefined;
  url.searchParams.delete("schema");
  const adapter = new PrismaPg({ connectionString: url.toString() }, schema ? { schema } : undefined);
  // PRISMA_QUERY_LOG=1 prints one line per query (used by `npm run perf:measure`; never in normal use).
  if (process.env.PRISMA_QUERY_LOG === "1") {
    const client = new PrismaClient({ adapter, log: [{ emit: "event", level: "query" }, "warn", "error"] });
    client.$on("query" as never, (e: { duration: number; query: string }) => {
      process.stdout.write(`[query] ${Math.round(e.duration * 10) / 10}ms ${e.query.replace(/\s+/g, " ").slice(0, 160)}\n`);
    });
    return client;
  }
  return new PrismaClient({ adapter, log: ["warn", "error"] });
}
