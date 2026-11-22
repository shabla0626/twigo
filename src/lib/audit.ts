import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { logger } from "./logger";

/** Record a sensitive administrative operation. Never include personal data in metadata. */
export async function audit(
  actorId: string | null,
  action: string,
  entityType: string,
  entityId?: string | null,
  metadata?: Prisma.InputJsonValue,
) {
  try {
    await db.auditLog.create({ data: { actorId, action, entityType, entityId: entityId ?? null, metadata } });
  } catch (err) {
    // Audit failures must be visible but must not break the admin operation.
    logger.error("audit.write_failed", { action, entityType, err });
  }
}
