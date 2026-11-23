/** Shared set-up for the Twigo tests: a project group with three members and complete agreement terms. */
import { db } from "@/lib/db";
import { createIdea, endorseIdea } from "@/server/community/ideas";
import type { ParticipantInput, Terms } from "@/server/community/group-projects";
import { createMember } from "./helpers";

export async function groupOfThree() {
  const [a, b, c] = [await createMember("Alice"), await createMember("Bob"), await createMember("Cara")];
  const res = await createIdea(a.id, {
    title: "Neighborhood bookkeeping service",
    summary: "Small local shops need simple, affordable monthly bookkeeping help.",
    category: "ONLINE_SERVICES",
    description: null, problem: null, proposal: null, customers: null, revenueModel: null, skillsNeeded: null, timeEstimate: null,
    links: [],
  });
  if (!res.ok) throw new Error(res.error);
  await endorseIdea(b.id, res.id);
  await endorseIdea(c.id, res.id);
  const g = await db.researchGroup.findUniqueOrThrow({ where: { ideaId: res.id } });
  return { a, b, c, g };
}

/** Every required item filled in, written by the participants (no preset figures anywhere). */
export const fullTerms = (over: Partial<Record<keyof Terms, string>> = {}) => ({
  scope: "Monthly bookkeeping for three local shops.",
  deliverables: "Monthly ledgers and a yearly summary.",
  timeline: "January to June 2027.",
  customer: "Test Shop (fictional)",
  contractingModel: "PROJECT_REPRESENTATIVE",
  contractingDetails: "Alice signs the customer contract on behalf of the participants.",
  paymentRecipient: "Alice, who passes on each share within 7 days.",
  approvedExpenses: "Bookkeeping software subscription.",
  grossRevenue: "Everything the customer pays for this project.",
  deductions: "Taxes each participant owes are their own responsibility.",
  refundsChargebacks: "Refunds are shared in the same proportion as the revenue.",
  netRevenue: "Gross receipts minus refunds and approved expenses.",
  compensationMethod: "CONTRIBUTION",
  distributionFormula: "In proportion to recorded hours.",
  paymentSchedule: "Monthly, after the customer pays.",
  ipArrangements: "Each participant keeps their own templates; deliverables belong to the customer.",
  confidentiality: "Customer data stays within the project.",
  withdrawal: "Two weeks' notice; work done until then is paid.",
  disputes: "Discuss in the group first, then a neutral mediator agreed by all.",
  other: "",
  ...over,
});

export const participant = (userId: string, compensation: string, role = "Bookkeeper"): ParticipantInput => ({
  userId,
  role,
  responsibilities: "Prepares the monthly ledgers for one shop.",
  expectedContribution: "About 5 hours a week.",
  compensation,
});
