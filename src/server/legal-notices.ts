import "server-only";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

/**
 * Legal notices: who operates the site, under which law. Stored privately in OrgSetting
 * ("legal.notices"). Each field is shown publicly only when the owner has filled it in AND marked it
 * confirmed for publication. Nothing is ever invented: an empty or unconfirmed field is shown as
 * "Not yet confirmed".
 */
export const NOTICE_FIELDS = {
  operatorName: { label: "Legal operator name", help: "The person or organization legally responsible for the site." },
  entityType: { label: "Legal entity type", help: "For example sole proprietor, limited company, association. Leave empty if not applicable." },
  jurisdiction: { label: "Jurisdiction", help: "Where the operator is established." },
  registeredAddress: { label: "Registered address", help: "Only if the law requires it to be published." },
  registrationNumber: { label: "Registration number", help: "Only if the operator is registered." },
  contactEmail: { label: "Official contact email", help: "" },
  privacyContact: { label: "Privacy contact", help: "Email or person for privacy requests." },
  governingLaw: { label: "Governing law", help: "The law that governs the Terms of Use." },
  effectiveDate: { label: "Effective date of these notices", help: "For example 1 March 2027." },
} as const;

export type NoticeKey = keyof typeof NOTICE_FIELDS;
export const NOTICE_KEYS = Object.keys(NOTICE_FIELDS) as NoticeKey[];
export type Notices = Record<NoticeKey, { value: string; confirmed: boolean }>;

const SETTING_KEY = "legal.notices";
const fieldSchema = z.object({ value: z.string().trim().max(300).default(""), confirmed: z.boolean().default(false) });

export function emptyNotices(): Notices {
  return Object.fromEntries(NOTICE_KEYS.map((k) => [k, { value: "", confirmed: false }])) as Notices;
}

export async function readNotices(): Promise<Notices> {
  const row = await db.orgSetting.findUnique({ where: { key: SETTING_KEY } });
  const out = emptyNotices();
  const stored = (row?.value ?? {}) as Record<string, unknown>;
  for (const k of NOTICE_KEYS) {
    const parsed = fieldSchema.safeParse(stored[k]);
    if (parsed.success) out[k] = parsed.data;
  }
  // The production settings hold facts the founder confirmed (the site refuses to start without them).
  // They fill any field the owner has not confirmed in Admin -> Legal -> Legal notices.
  const e = env();
  const fromSettings: Partial<Record<NoticeKey, string>> = {
    operatorName: e.ORG_LEGAL_NAME,
    jurisdiction: e.ORG_JURISDICTION,
    governingLaw: e.ORG_JURISDICTION,
    contactEmail: e.ORG_CONTACT_EMAIL,
    privacyContact: e.ORG_CONTACT_EMAIL,
  };
  for (const [k, v] of Object.entries(fromSettings) as [NoticeKey, string][]) {
    if (v && !(out[k].confirmed && out[k].value)) out[k] = { value: v, confirmed: true };
  }
  return out;
}

/** What visitors may see: only filled-in, confirmed fields. */
export async function publicNotices(): Promise<{ key: NoticeKey; label: string; value: string | null }[]> {
  const n = await readNotices();
  return NOTICE_KEYS.map((k) => ({ key: k, label: NOTICE_FIELDS[k].label, value: n[k].confirmed && n[k].value ? n[k].value : null }));
}

export async function saveNotices(ownerId: string, input: Notices) {
  const clean = emptyNotices();
  for (const k of NOTICE_KEYS) {
    const p = fieldSchema.safeParse(input[k]);
    if (p.success) clean[k] = { value: p.data.value, confirmed: p.data.confirmed && p.data.value.length > 0 };
  }
  await db.orgSetting.upsert({ where: { key: SETTING_KEY }, create: { key: SETTING_KEY, value: clean, updatedById: ownerId }, update: { value: clean, updatedById: ownerId } });
  // The audit entry records which fields are public, not their values.
  await audit(ownerId, "legal.notices_saved", "OrgSetting", SETTING_KEY, { confirmed: NOTICE_KEYS.filter((k) => clean[k].confirmed) });
}

/** Unconfirmed notices, for the owner's "Before launch" list. */
export async function unconfirmedNotices(): Promise<string[]> {
  const n = await readNotices();
  const needed: NoticeKey[] = ["operatorName", "jurisdiction", "contactEmail", "privacyContact", "governingLaw"];
  return needed.filter((k) => !(n[k].confirmed && n[k].value)).map((k) => NOTICE_FIELDS[k].label);
}
