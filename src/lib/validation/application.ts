import { z } from "zod";
import { CONTACT_METHODS, EXPERIENCE_LEVELS, REMOTE_EXPERIENCE, WORK_CATEGORIES, keysOf } from "../labels";

export const PRIVACY_NOTICE_VERSION = "2026-11-draft-2";

const trimmed = (max: number) => z.string().trim().max(max, `Must be ${max} characters or fewer.`);
const required = (label: string, max: number) => trimmed(max).min(1, `${label} is required.`);
const optional = (max: number) =>
  trimmed(max)
    .optional()
    .transform((v) => (v ? v : undefined));

const mustAccept = (msg: string) => z.boolean().refine((v) => v === true, { message: msg });

/** Splits "a, b; c" into unique normalized tags. */
export function parseSkillList(input: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input.split(/[,;\n]/)) {
    const label = raw.trim().replace(/\s+/g, " ").slice(0, 60);
    const key = label.toLowerCase();
    if (label && !seen.has(key)) {
      seen.add(key);
      out.push(label);
    }
  }
  return out.slice(0, 15);
}

const urlField = z
  .string()
  .trim()
  .max(300)
  .optional()
  .transform((v) => (v ? v : undefined))
  .refine((v) => !v || /^https:\/\/[^\s]+$/i.test(v), { message: "Please enter a full https:// link." });

// ------------------------------------------------------------------ membership application (3 short steps)
// Name and email come from the account, so they are never asked again.

const choice = <T extends Record<string, string>>(labels: T, message: string) =>
  z.preprocess((v) => (v === "" ? undefined : v), z.enum(keysOf(labels), { message }).optional());

/** Step 1: about you. */
export const stepAboutSchema = z.object({
  country: required("Country", 80),
  region: optional(80),
  occupation: required("Your current occupation or background", 160),
  education: optional(160),
  profileUrl: urlField,
  experienceLevel: choice(EXPERIENCE_LEVELS, "Please choose an option."),
  relevantExperience: optional(2000),
  timeZone: optional(60),
});

/** Step 2: skills and time. */
export const stepSkillsSchema = z.object({
  mainSkills: required("Your skills", 500).refine((v) => parseSkillList(v).length > 0, { message: "List at least one skill (separate them with commas)." }),
  secondarySkills: optional(500),
  workCategories: z.array(z.enum(keysOf(WORK_CATEGORIES))).min(1, "Choose at least one kind of work.").max(7),
  desiredWork: optional(1000),
  hoursPerWeek: z.coerce.number({ message: "Choose about how many hours you have." }).int().min(1, "Choose about how many hours you have.").max(60),
  schedule: optional(200),
  willingToLearn: z.boolean(),
});

/** Step 3: motivation. */
export const stepMotivationSchema = z.object({
  motivation: required("This answer", 2000).min(20, "Please write a sentence or two (at least 20 characters)."),
  contribution: required("This answer", 2000).min(20, "Please write a sentence or two (at least 20 characters)."),
  additionalComments: optional(2000),
});

export const APPLICATION_STEPS = [
  { n: 1, title: "About you", schema: stepAboutSchema },
  { n: 2, title: "Skills and time", schema: stepSkillsSchema },
  { n: 3, title: "Why you want to join", schema: stepMotivationSchema },
] as const;

/** Final confirmation, required only when submitting. */
export const submitConfirmSchema = z.object({
  confirm: mustAccept("Please confirm the statement above to submit your application."),
});

export type StepAbout = z.output<typeof stepAboutSchema>;
export type StepSkills = z.output<typeof stepSkillsSchema>;
export type StepMotivation = z.output<typeof stepMotivationSchema>;

// Kept for reading older applications (no longer collected).
export { CONTACT_METHODS, REMOTE_EXPERIENCE };
