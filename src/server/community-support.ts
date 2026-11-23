import "server-only";
import type { Prisma, SupportEntryKind } from "@prisma/client";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

/**
 * Voluntary community support: owner-kept records and published aggregate reports.
 *
 * - There is no payment processing. `paymentsAvailable()` is always false: no provider exists in the
 *   code, whatever the SUPPORT_PAYMENTS_ENABLED switch says.
 * - Support is never linked to projects, never deducted, and never changes anyone's rights: nothing in
 *   the application reads these records except the owner's pages and the public totals.
 * - Individual entries (and contributor names) are private to the owner. Only published report totals
 *   are public.
 */
export const ENTRY_KINDS: Record<SupportEntryKind, string> = {
  CONTRIBUTION: "Contribution received",
  OPERATING_EXPENSE: "Operating expense",
  DEVELOPMENT_EXPENSE: "Platform development expense",
  OTHER_EXPENSE: "Other approved expenditure",
};

/** Online contributions are not possible: no payment provider is integrated. */
export function paymentsAvailable(): boolean {
  return false;
}
/** What the switch is set to (shown to the owner, so the decision is visible). */
export function paymentsSwitch(): boolean {
  return env().SUPPORT_PAYMENTS_ENABLED;
}

const entrySchema = z.object({
  kind: z.enum(["CONTRIBUTION", "OPERATING_EXPENSE", "DEVELOPMENT_EXPENSE", "OTHER_EXPENSE"]),
  amount: z.string().trim().regex(/^\d{1,9}(\.\d{1,2})?$/, "Enter an amount such as 25 or 25.50."),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Use a three-letter currency code such as USD."),
  occurredOn: z.coerce.date(),
  description: z.string().trim().min(3).max(300),
  contributorName: z.string().trim().max(120).default(""),
});

export async function addEntry(ownerId: string, raw: unknown) {
  const p = entrySchema.safeParse(raw);
  if (!p.success) return { ok: false as const, error: p.error.issues[0]?.message ?? "Some values are not valid." };
  const amountMinor = Math.round(Number(p.data.amount) * 100);
  if (amountMinor <= 0 || amountMinor > 2_000_000_000) return { ok: false as const, error: "Enter an amount between 0.01 and 20,000,000.00." };
  const e = await db.supportLedgerEntry.create({
    data: { kind: p.data.kind, amountMinor, currency: p.data.currency, occurredOn: p.data.occurredOn, description: p.data.description, contributorName: p.data.contributorName || null, createdById: ownerId },
  });
  // No amount or name in the audit log.
  await audit(ownerId, "support.entry_added", "SupportLedgerEntry", e.id, { kind: e.kind });
  return { ok: true as const };
}

export type Totals = { contributions: number; operating: number; development: number; other: number; balance: number };

export async function totalsFor(currency: string, from: Date, to: Date, client: Prisma.TransactionClient = db): Promise<Totals> {
  const rows = await client.supportLedgerEntry.groupBy({ by: ["kind"], where: { currency, occurredOn: { gte: from, lte: to } }, _sum: { amountMinor: true } });
  const sum = (k: SupportEntryKind) => rows.find((r) => r.kind === k)?._sum.amountMinor ?? 0;
  const t = { contributions: sum("CONTRIBUTION"), operating: sum("OPERATING_EXPENSE"), development: sum("DEVELOPMENT_EXPENSE"), other: sum("OTHER_EXPENSE") };
  return { ...t, balance: t.contributions - t.operating - t.development - t.other };
}

const reportSchema = z.object({
  title: z.string().trim().min(3).max(120),
  periodStart: z.coerce.date(),
  periodEnd: z.coerce.date(),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
  note: z.string().trim().max(2000).default(""),
});

export async function createReport(ownerId: string, raw: unknown) {
  const p = reportSchema.safeParse(raw);
  if (!p.success) return { ok: false as const, error: p.error.issues[0]?.message ?? "Some values are not valid." };
  if (p.data.periodEnd < p.data.periodStart) return { ok: false as const, error: "The period ends before it starts." };
  const r = await db.supportReport.create({ data: { ...p.data, note: p.data.note || null, createdById: ownerId } });
  await audit(ownerId, "support.report_created", "SupportReport", r.id);
  return { ok: true as const };
}

/** Publishing freezes the totals: later changes to entries do not alter a published report. */
export async function publishReport(ownerId: string, reportId: string) {
  return db.$transaction(async (tx) => {
    const r = await tx.supportReport.findUnique({ where: { id: reportId } });
    if (!r) return { ok: false as const, error: "Report not found." };
    if (r.published) return { ok: false as const, error: "This report is already published." };
    const totals = await totalsFor(r.currency, r.periodStart, r.periodEnd, tx);
    await tx.supportReport.update({ where: { id: r.id }, data: { published: true, publishedAt: new Date(), totals } });
    await tx.auditLog.create({ data: { actorId: ownerId, action: "support.report_published", entityType: "SupportReport", entityId: r.id } });
    return { ok: true as const };
  });
}

export async function publishedReports() {
  return db.supportReport.findMany({ where: { published: true }, orderBy: { periodEnd: "desc" }, select: { id: true, title: true, periodStart: true, periodEnd: true, currency: true, note: true, totals: true, publishedAt: true } });
}

export async function ownerOverview() {
  const [entries, reports] = await Promise.all([
    db.supportLedgerEntry.findMany({ orderBy: { occurredOn: "desc" }, take: 200 }),
    db.supportReport.findMany({ orderBy: { createdAt: "desc" } }),
  ]);
  return { entries, reports };
}

export const money = (minor: number, currency: string) => `${currency} ${(minor / 100).toFixed(2)}`;
