import "server-only";
import type { PrismaClient } from "@prisma/client";
import { createPrismaClient } from "./db-core";

// One client per process. The custom server (server.ts) creates the client
// first and stores it on globalThis, so Next.js code and the realtime layer
// share the same connection pool.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db: PrismaClient = globalForPrisma.prisma ?? createPrismaClient();
globalForPrisma.prisma = db;
