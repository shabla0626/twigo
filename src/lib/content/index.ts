import "server-only";
import { cache } from "react";
import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { env } from "../env";
import { logger } from "../logger";
import { defaultContent } from "./defaults";
import { CONTENT_KEYS, contentSchemas, type ContentKey, type ContentValue, type SiteContentMap } from "./schema";

export function defaults(): SiteContentMap {
  const e = env();
  return defaultContent({ name: e.ORG_NAME, contactEmail: e.ORG_CONTACT_EMAIL });
}

/** Loads all site content, falling back to defaults for missing or invalid entries. */
export const getSiteContent = cache(async (): Promise<SiteContentMap> => {
  const base = defaults();
  try {
    const rows = await db.siteContent.findMany({ where: { key: { in: CONTENT_KEYS } } });
    const merged = { ...base } as Record<ContentKey, unknown>;
    for (const row of rows) {
      const key = row.key as ContentKey;
      const parsed = contentSchemas[key].safeParse(row.value);
      if (parsed.success) merged[key] = parsed.data;
      else logger.warn("content.invalid_override", { key });
    }
    return merged as SiteContentMap;
  } catch (err) {
    // The public site must render even if the database is unavailable.
    logger.error("content.load_failed", { err });
    return base;
  }
});

export async function saveContent<K extends ContentKey>(key: K, value: ContentValue<K>, adminId: string) {
  const data = contentSchemas[key].parse(value) as Prisma.InputJsonValue;
  await db.siteContent.upsert({
    where: { key },
    create: { key, value: data, updatedBy: adminId },
    update: { value: data, updatedBy: adminId },
  });
}

export async function resetContent(key: ContentKey) {
  await db.siteContent.deleteMany({ where: { key } });
}

export type { SiteContentMap, ContentKey };
