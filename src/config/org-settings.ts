// Organization setting definitions (no `server-only`: also used by the
// scheduler and CLI jobs). Values are stored in the OrgSetting table.
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";

/**
 * Organization settings controlled by the OWNER (stored in OrgSetting).
 * Retention values are in days; `null` means "keep" (no automatic deletion).
 */
export const SETTINGS = {
  "community.endorsementThreshold": {
    label: "Endorsements needed to create a research group",
    help: "Distinct active members other than the author. Default 2.",
    schema: z.coerce.number().int().min(1).max(50),
    default: 2 as number,
  },
  "retention.declinedApplicationsDays": {
    label: "Delete declined applications after (days)",
    help: "Applicant record is deleted unless the person became a participant.",
    schema: z.coerce.number().int().min(30).max(3650).nullable(),
    default: 365 as number | null,
  },
  "retention.closedInquiriesDays": {
    label: "Delete closed contact inquiries after (days)",
    help: "",
    schema: z.coerce.number().int().min(30).max(3650).nullable(),
    default: 365 as number | null,
  },
  "retention.deletedContentDays": {
    label: "Permanently remove deleted posts, comments and messages after (days)",
    help: "Content deleted by its author or removed by moderation is kept for this long (for moderation and appeals).",
    schema: z.coerce.number().int().min(7).max(3650).nullable(),
    default: 30 as number | null,
  },
  "retention.chatMessagesDays": {
    label: "Delete group chat messages older than (days)",
    help: "Leave empty to keep chat history for as long as the group exists.",
    schema: z.coerce.number().int().min(30).max(3650).nullable(),
    default: null as number | null,
  },
  "retention.archivedGroupFilesDays": {
    label: "Delete files of archived groups after (days)",
    help: "Counted from the date the group was archived.",
    schema: z.coerce.number().int().min(30).max(3650).nullable(),
    default: 365 as number | null,
  },
  "retention.notificationsDays": {
    label: "Delete read notifications after (days)",
    help: "",
    schema: z.coerce.number().int().min(7).max(3650).nullable(),
    default: 90 as number | null,
  },
  "retention.meetingMetadataDays": {
    label: "Delete meeting records (times, attendance) after (days)",
    help: "No audio or video is ever stored; this is metadata only.",
    schema: z.coerce.number().int().min(30).max(3650).nullable(),
    default: 365 as number | null,
  },
  "retention.emailLogDays": {
    label: "Delete email delivery records after (days)",
    help: "",
    schema: z.coerce.number().int().min(30).max(3650).nullable(),
    default: 730 as number | null,
  },
  "retention.sessionsDays": {
    label: "Delete expired sessions and used tokens after (days)",
    help: "",
    schema: z.coerce.number().int().min(1).max(365).nullable(),
    default: 30 as number | null,
  },
} as const;

export type SettingKey = keyof typeof SETTINGS;
export type SettingValue<K extends SettingKey> = (typeof SETTINGS)[K]["default"];

export async function readAllSettings(db: PrismaClient): Promise<Record<SettingKey, number | null>> {
  const rows = await db.orgSetting.findMany();
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const out = {} as Record<SettingKey, number | null>;
  for (const key of Object.keys(SETTINGS) as SettingKey[]) {
    const parsed = SETTINGS[key].schema.safeParse(map.get(key));
    out[key] = map.has(key) && parsed.success ? (parsed.data as number | null) : (SETTINGS[key].default as number | null);
  }
  return out;
}
