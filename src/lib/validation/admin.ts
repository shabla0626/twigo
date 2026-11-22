import { z } from "zod";
import { emailField } from "./email";
import {
  AGREEMENT_STATUSES,
  APPLICATION_STATUSES,
  ASSIGNMENT_STATUSES,
  EXPERIENCE_LEVELS,
  INQUIRY_STATUSES,
  MILESTONE_STATUSES,
  PARTICIPANT_STATUSES,
  PROJECT_STATUSES,
  WORK_CATEGORIES,
  keysOf,
} from "../labels";

const id = z.string().min(1).max(40);
const opt = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : null));
const optDate = z
  .string()
  .optional()
  .transform((v, ctx) => {
    if (!v) return null;
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) {
      ctx.addIssue({ code: "custom", message: "Invalid date" });
      return z.NEVER;
    }
    return d;
  });
// Unchecked checkboxes are absent from FormData, so the field must be optional.
const checkbox = z
  .string()
  .optional()
  .transform((v) => v === "on" || v === "true");

export const loginSchema = z.object({
  email: emailField(),
  password: z.string().min(1).max(200),
});

export const applicationFiltersSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  // Old links used NEW / INTERVIEW; map them to the current names.
  status: z
    .preprocess((v) => (v === "NEW" ? "SUBMITTED" : v === "INTERVIEW" ? "INTERVIEW_REQUESTED" : v), z.enum(keysOf(APPLICATION_STATUSES)).optional())
    .catch(undefined),
  experience: z.enum(keysOf(EXPERIENCE_LEVELS)).optional().catch(undefined),
  category: z.enum(keysOf(WORK_CATEGORIES)).optional().catch(undefined),
  skill: z.string().trim().max(60).optional().catch(undefined),
  minHours: z.coerce.number().int().min(0).max(60).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).optional().catch(undefined),
});
export type ApplicationFilters = z.infer<typeof applicationFiltersSchema>;

/** Statuses an administrator can set (drafts and withdrawals belong to the applicant). */
export const ADMIN_SETTABLE_STATUSES = ["UNDER_REVIEW", "INTERVIEW_REQUESTED", "WAITLISTED", "ACCEPTED", "DECLINED"] as const;
export const statusChangeSchema = z.object({
  id,
  status: z.enum(ADMIN_SETTABLE_STATUSES),
  notify: checkbox,
  confirm: checkbox,
  interviewDetails: opt(2000),
  details: opt(2000),
});
export const noteSchema = z.object({ id, body: z.string().trim().min(1, "Note cannot be empty").max(4000) });

export const participantUpdateSchema = z.object({
  id,
  status: z.enum(keysOf(PARTICIPANT_STATUSES)),
  hoursPerWeek: z
    .string()
    .optional()
    .transform((v) => (v ? Number(v) : null))
    .pipe(z.number().int().min(0).max(80).nullable()),
  availabilityNotes: opt(1000),
  skillsSummary: opt(2000),
  internalNotes: opt(5000),
  preferredCategories: z.array(z.enum(keysOf(WORK_CATEGORIES))).default([]),
});

export const projectSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(160),
  summary: z.string().trim().min(1, "Summary is required").max(1000),
  description: opt(10000),
  category: z
    .enum(keysOf(WORK_CATEGORIES))
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : null)),
  status: z.enum(keysOf(PROJECT_STATUSES)),
  isPublished: checkbox,
  publicSummary: opt(600),
  startDate: optDate,
  targetDate: optDate,
});

export const roleSchema = z.object({
  projectId: id,
  title: z.string().trim().min(1).max(120),
  responsibilities: opt(2000),
  openings: z.coerce.number().int().min(1).max(50).default(1),
  skills: z.string().trim().max(500).optional().default(""),
});

export const assignmentSchema = z.object({
  projectId: id,
  participantId: id,
  roleId: z
    .string()
    .optional()
    .transform((v) => (v ? v : null)),
  responsibilities: opt(2000),
});

export const assignmentStatusSchema = z.object({ id, status: z.enum(keysOf(ASSIGNMENT_STATUSES)) });

export const milestoneSchema = z.object({
  projectId: id,
  title: z.string().trim().min(1).max(200),
  dueDate: optDate,
});
export const milestoneStatusSchema = z.object({ id, status: z.enum(keysOf(MILESTONE_STATUSES)) });

export const compensationSchema = z.object({
  assignmentId: id,
  terms: z.string().trim().min(1, "Describe the agreed terms").max(5000),
  basis: opt(60),
  amount: z
    .string()
    .trim()
    .optional()
    .transform((v, ctx) => {
      if (!v) return null;
      if (!/^\d+(\.\d{1,2})?$/.test(v)) {
        ctx.addIssue({ code: "custom", message: "Amount must be a number with up to 2 decimals" });
        return z.NEVER;
      }
      return Math.round(Number(v) * 100);
    }),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || /^[A-Z]{3}$/.test(v), "Use a 3-letter currency code"),
  status: z.enum(keysOf(AGREEMENT_STATUSES)),
  documentRef: opt(300),
});

export const inquiryStatusSchema = z.object({ id, status: z.enum(keysOf(INQUIRY_STATUSES)) });

export function formToObject(fd: FormData, arrays: string[] = []): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of new Set(fd.keys())) {
    if (key.startsWith("$ACTION")) continue;
    out[key] = arrays.includes(key) ? fd.getAll(key).map(String) : String(fd.get(key) ?? "");
  }
  for (const a of arrays) if (!(a in out)) out[a] = [];
  return out;
}
