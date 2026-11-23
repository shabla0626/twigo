import "server-only";
import { cache } from "react";
import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { env } from "../env";
import { logger } from "../logger";
import { brand } from "@/config/brand";
import { defaultContent } from "./defaults";
import { CONTENT_KEYS, contentSchemas, type ContentKey, type ContentValue, type SiteContentMap } from "./schema";

export function defaults(): SiteContentMap {
  const e = env();
  return defaultContent({ name: e.ORG_NAME, contactEmail: e.ORG_CONTACT_EMAIL, tagline: brand().tagline });
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
    // The organization's name has ONE source: the ORG_NAME setting (an organization-wide,
    // owner-controlled setting). A name saved earlier with the website content is ignored,
    // so the site, the sign-in pages and all emails always show the same name.
    (merged.company as SiteContentMap["company"]) = { ...(merged.company as SiteContentMap["company"]), name: base.company.name };
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
