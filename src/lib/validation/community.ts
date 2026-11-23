import { z } from "zod";

const text = (min: number, max: number, label: string) =>
  z.string().trim().min(min, `${label} must be at least ${min} characters.`).max(max, `${label} must be at most ${max} characters.`);
const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Must be at most ${max} characters.`)
    .optional()
    .transform((v) => (v ? v : null));

export const IDEA_CATEGORIES = {
  SOFTWARE_TECH: "Software & technology",
  AI_DATA: "AI & data",
  ONLINE_SERVICES: "Online services",
  CONTENT_MEDIA: "Content & media",
  ECOMMERCE: "E-commerce & products",
  LOCAL_SERVICES: "Local & in-person services",
  CONSULTING_RESEARCH: "Consulting & research",
  EDUCATION_TRAINING: "Education & training",
  MARKETING_SALES: "Marketing & sales",
  OTHER: "Other",
} as const;
export type IdeaCategoryKey = keyof typeof IDEA_CATEGORIES;
const categoryKeys = Object.keys(IDEA_CATEGORIES) as [IdeaCategoryKey, ...IdeaCategoryKey[]];

export const httpsUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => {
    try {
      const u = new URL(v);
      return u.protocol === "https:" || u.protocol === "http:";
    } catch {
      return false;
    }
  }, "Enter a full web address starting with https://");

/** Only the title, summary and category are required: early ideas are welcome. */
export const ideaSchema = z.object({
  title: text(5, 120, "Title"),
  summary: text(20, 500, "The description of your idea"),
  category: z.enum(categoryKeys, { message: "Choose the area that fits best (or “Other”)." }),
  description: optText(10_000),
  problem: optText(3_000),
  proposal: optText(3_000),
  customers: optText(2_000),
  revenueModel: optText(2_000),
  skillsNeeded: optText(1_000),
  timeEstimate: optText(300),
  links: z
    .string()
    .optional()
    .transform((v) => (v ?? "").split(/\s+/).map((s) => s.trim()).filter(Boolean))
    .pipe(z.array(httpsUrl).max(10, "At most 10 links.")),
});
export type IdeaInput = z.infer<typeof ideaSchema>;

export const commentSchema = z.object({
  body: text(1, 5_000, "Comment"),
  parentId: z.string().max(40).optional().transform((v) => v || null),
});

export const discussionSchema = z.object({
  title: text(3, 150, "Title"),
  body: text(1, 10_000, "Message"),
});

export const announcementSchema = z.object({
  title: text(3, 150, "Title"),
  body: text(1, 5_000, "Announcement"),
});

export const groupInfoSchema = z.object({
  name: text(3, 120, "Name"),
  purpose: optText(500),
  description: optText(10_000),
});

export const chatMessageSchema = z.object({
  channelId: z.string().min(1).max(40),
  body: z.string().max(4_000, "Messages can be at most 4,000 characters.").transform((s) => s.replace(/\r\n/g, "\n").trim()),
  clientId: z.string().min(8).max(64).regex(/^[A-Za-z0-9_-]+$/),
  replyToId: z.string().max(40).nullish(),
  attachmentIds: z.array(z.string().max(40)).max(5).default([]),
});

export const meetingSchema = z.object({
  // Older forms sent "VOICE" or "VIDEO"; both are the same thing (one Google Meet link).
  kind: z.enum(["VOICE", "VIDEO"]).optional(),
  title: optText(120),
  joinUrl: z
    .string()
    .trim()
    .max(200)
    .refine((v) => /^https:\/\/meet\.google\.com\/[a-z]{3,4}-[a-z]{3,4}-[a-z]{3,4}(\?[\w=&.-]*)?$/i.test(v), "Paste a Google Meet link such as https://meet.google.com/abc-defg-hij"),
});

export const RESEARCH_SECTIONS = {
  CONCEPT: { label: "Business concept", hint: "What exactly would we offer, and why would it work?" },
  MARKET: { label: "Market research", hint: "Who else does this? How big is the need? Sources." },
  CUSTOMERS: { label: "Potential customers", hint: "Who would pay, and how would we reach them?" },
  REVENUE: { label: "Revenue model", hint: "How money would come in; realistic prices; costs." },
  SKILLS: { label: "Required skills", hint: "Which abilities are needed, and who in the group has them?" },
  RISKS: { label: "Risks & challenges", hint: "Legal, financial, practical or time risks." },
  SOLUTIONS: { label: "Proposed solutions", hint: "How we would handle the risks and challenges." },
  PLAN: { label: "Preliminary business plan", hint: "Steps, timeline and what would be needed for a review." },
  GENERAL: { label: "Shared notes", hint: "Anything else the group wants to keep." },
} as const;
export type ResearchSectionKey = keyof typeof RESEARCH_SECTIONS;

export const noteSchema = z.object({
  section: z.enum(Object.keys(RESEARCH_SECTIONS) as [ResearchSectionKey, ...ResearchSectionKey[]]),
  title: text(2, 150, "Title"),
  body: text(1, 20_000, "Note"),
});

export const taskSchema = z.object({
  title: text(2, 200, "Task"),
  details: optText(2_000),
  assigneeId: z.string().max(40).optional().transform((v) => v || null),
  dueDate: z
    .string()
    .optional()
    .transform((v) => (v ? new Date(`${v}T12:00:00Z`) : null))
    .refine((d) => d === null || !Number.isNaN(d.getTime()), "Invalid date"),
});

export const decisionSchema = z.object({
  title: text(2, 200, "Title"),
  decision: text(2, 5_000, "Decision"),
  rationale: optText(5_000),
});

export const linkSchema = z.object({ url: httpsUrl, title: text(2, 150, "Title") });

export const REPORT_REASONS = {
  FRAUD: "Fraudulent or misleading proposal",
  HARASSMENT: "Harassment or abuse",
  SPAM: "Spam",
  FEE_OR_INVESTMENT_REQUEST: "Asks for fees, payments or investment",
  UNAUTHORIZED_SOLICITATION: "Unauthorized solicitation or advertising",
  ILLEGAL_ACTIVITY: "Illegal business activity",
  PRIVACY_VIOLATION: "Privacy or confidentiality violation",
  INTELLECTUAL_PROPERTY: "Uses someone else's work without permission",
  DISPUTE: "A dispute between members (for example about a project or its agreement)",
  OTHER: "Something else",
} as const;

export const reportSchema = z.object({
  targetType: z.enum(["IDEA", "COMMENT", "DISCUSSION", "MESSAGE", "GROUP", "USER"]),
  targetId: z.string().min(1).max(40),
  reason: z.enum(Object.keys(REPORT_REASONS) as [keyof typeof REPORT_REASONS, ...(keyof typeof REPORT_REASONS)[]]),
  details: optText(2_000),
});

export const profileSchema = z.object({
  displayName: text(2, 60, "Display name"),
  headline: optText(120),
  intro: optText(2_000),
  location: optText(80),
  timeZone: optText(60),
  skills: z
    .string()
    .optional()
    .transform((v) =>
      [...new Set((v ?? "").split(",").map((s) => s.trim()).filter(Boolean))].slice(0, 25).map((s) => s.slice(0, 50)),
    ),
  experience: optText(2_000),
  interests: optText(1_000),
  hoursPerWeek: z
    .string()
    .optional()
    .transform((v) => (v ? Number(v) : null))
    .refine((n) => n === null || (Number.isInteger(n) && n >= 0 && n <= 80), "Hours must be between 0 and 80."),
  availability: optText(200),
  showLocation: z.string().optional().transform((v) => v === "on"),
  showTimeZone: z.string().optional().transform((v) => v === "on"),
  showHours: z.string().optional().transform((v) => v === "on"),
});
