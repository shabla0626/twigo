import { z } from "zod";

const text = (max: number) => z.string().trim().max(max);

export const contentSchemas = {
  company: z.object({
    name: text(80).min(1),
    tagline: text(160),
    mission: text(600).min(1),
  }),
  hero: z.object({
    eyebrow: text(80),
    headline: text(120).min(1),
    subheadline: text(400).min(1),
  }),
  announcement: z.object({
    enabled: z.boolean(),
    title: text(120),
    body: text(800),
  }),
  contact: z.object({
    email: z.union([z.literal(""), z.string().trim().email().max(200)]),
    responseNote: text(300),
  }),
  faq: z.object({
    items: z.array(z.object({ q: text(200).min(1), a: text(1500).min(1) })).max(40),
  }),
  categories: z.object({
    items: z
      .array(z.object({ title: text(80).min(1), description: text(400).min(1), examples: text(300) }))
      .max(20),
  }),
} as const;

export type ContentKey = keyof typeof contentSchemas;
export type ContentValue<K extends ContentKey> = z.infer<(typeof contentSchemas)[K]>;
export type SiteContentMap = { [K in ContentKey]: ContentValue<K> };
export const CONTENT_KEYS = Object.keys(contentSchemas) as ContentKey[];
