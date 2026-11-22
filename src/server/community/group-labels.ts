// Pure labels (safe for any component).
import type { GroupStatus } from "@prisma/client";

export const GROUP_STATUS_LABELS: Record<GroupStatus, string> = {
  FORMING: "Forming",
  RESEARCHING: "Researching",
  VALIDATING: "Validating",
  PLANNING: "Planning",
  READY_FOR_REVIEW: "Ready for review",
  APPROVED_FOR_PROJECT: "Approved for project",
  ARCHIVED: "Archived",
};

/** Statuses a coordinator may set. Approval and archiving by admins are separate. */
export const COORDINATOR_STATUSES: GroupStatus[] = ["FORMING", "RESEARCHING", "VALIDATING", "PLANNING", "READY_FOR_REVIEW"];

export const GROUP_STATUS_HELP: Record<GroupStatus, string> = {
  FORMING: "Members are getting to know the idea and each other.",
  RESEARCHING: "Gathering facts about the market, customers and costs.",
  VALIDATING: "Testing whether real customers would pay.",
  PLANNING: "Writing a preliminary business plan.",
  READY_FOR_REVIEW: "The group asked the organization to review its proposal; administrators can then read the research notes (not the chat). No commercial work is authorized yet.",
  APPROVED_FOR_PROJECT: "Approved for project planning. Agreements and compensation terms come before any paid work.",
  ARCHIVED: "Read-only. No new activity.",
};
