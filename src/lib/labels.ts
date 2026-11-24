// Human-readable labels for database enums. Safe for client and server use.
// Keys must stay in sync with prisma/schema.prisma (enforced by a unit test).

export const WORK_CATEGORIES = {
  TECHNOLOGY: "Technology & Software Development",
  AI_DATA: "AI & Data Operations",
  RESEARCH: "Research & Analysis",
  MARKETING_BUSINESS: "Marketing & Business Development",
  CUSTOMER_SUPPORT: "Customer Support",
  ADMIN_OPERATIONS: "Administration & Operations",
  GENERAL_REMOTE: "General Remote Work",
} as const;

export const EXPERIENCE_LEVELS = {
  NONE: "No formal professional experience yet",
  ENTRY: "Entry level (under 2 years)",
  INTERMEDIATE: "Intermediate (2–5 years)",
  EXPERIENCED: "Experienced (5–10 years)",
  EXPERT: "Expert (10+ years)",
} as const;

export const REMOTE_EXPERIENCE = {
  NONE: "I have not worked remotely before",
  SOME: "Some remote collaboration experience",
  EXTENSIVE: "Extensive remote collaboration experience",
} as const;

export const CONTACT_METHODS = {
  EMAIL: "Email",
  PHONE: "Phone",
  VIDEO_CALL: "Video call",
  MESSAGING_APP: "Messaging app",
} as const;

/** Application status, as shown to administrators. */
export const APPLICATION_STATUSES = {
  DRAFT: "Draft (not submitted)",
  SUBMITTED: "Received",
  UNDER_REVIEW: "Under Review",
  INTERVIEW_REQUESTED: "Interview Requested",
  ACCEPTED: "Accepted",
  WAITLISTED: "Waitlisted",
  DECLINED: "Declined",
  WITHDRAWN: "Withdrawn",
} as const;

/** Application status, as shown to the applicant. Never show internal codes. */
export const APPLICANT_STATUS_LABELS = {
  DRAFT: "Application In Progress",
  SUBMITTED: "Application Received",
  UNDER_REVIEW: "Under Review",
  INTERVIEW_REQUESTED: "Interview Requested",
  ACCEPTED: "Accepted",
  WAITLISTED: "Waitlisted",
  DECLINED: "Declined",
  WITHDRAWN: "Withdrawn",
} as const;

/** Community membership, as shown to administrators. */
export const MEMBERSHIP_LABELS = {
  NONE: "Not a member",
  ACTIVE: "Active member",
  SUSPENDED: "Access paused",
  REVOKED: "Access removed",
} as const;

export const PARTICIPANT_STATUSES = { ACTIVE: "Active", PAUSED: "Paused", INACTIVE: "Inactive" } as const;

export const PROJECT_STATUSES = {
  PLANNING: "Planning",
  SEEKING_PARTICIPANTS: "Seeking Participants",
  READY: "Ready",
  ACTIVE: "Active",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
} as const;

export const ASSIGNMENT_STATUSES = {
  PROPOSED: "Proposed",
  ACTIVE: "Active",
  COMPLETED: "Completed",
  WITHDRAWN: "Withdrawn",
} as const;

export const MILESTONE_STATUSES = { PENDING: "Pending", IN_PROGRESS: "In progress", DONE: "Done" } as const;

export const AGREEMENT_STATUSES = {
  DRAFT: "Draft",
  AGREED: "Agreed in writing",
  SETTLED: "Settled",
  VOID: "Void",
} as const;

export const INQUIRY_CATEGORIES = {
  PARTICIPANT: "Participant inquiry",
  BUSINESS: "Business inquiry",
  GENERAL: "General question",
} as const;

export const INQUIRY_STATUSES = { OPEN: "Open", RESPONDED: "Responded", CLOSED: "Closed" } as const;

export const PRIVACY_REQUEST_KINDS = {
  ACCESS: "Access my information",
  CORRECTION: "Correct my information",
  DELETION: "Delete my information",
  WITHDRAW_CONSENT: "Withdraw a consent",
  OBJECTION: "Object to a use of my information",
  OTHER: "Something else",
} as const;

export const PRIVACY_REQUEST_STATUSES = {
  OPEN: "Submitted",
  VERIFICATION_REQUIRED: "Verification required",
  IN_PROGRESS: "Under review",
  INFO_REQUIRED: "Additional information required",
  APPROVED_FOR_DELETION: "Approved for deletion",
  PROCESSING: "Processing",
  COMPLETED: "Completed",
  REJECTED: "Rejected (with reason)",
} as const;

export const HOURS_OPTIONS = [2, 5, 10, 15, 20, 30, 40] as const;

export function keysOf<T extends Record<string, string>>(o: T): [keyof T & string, ...(keyof T & string)[]] {
  return Object.keys(o) as [keyof T & string, ...(keyof T & string)[]];
}
