import "server-only";
import type { ParticipantStatus, WorkCategory } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";

export async function listParticipants(filter: { status?: ParticipantStatus; category?: WorkCategory }) {
  return db.participant.findMany({
    where: {
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.category ? { preferredCategories: { has: filter.category } } : {}),
    },
    orderBy: { joinedAt: "desc" },
    include: {
      applicant: { select: { fullName: true, email: true, country: true, timeZone: true } },
      _count: { select: { assignments: { where: { status: { in: ["PROPOSED", "ACTIVE"] } } } } },
    },
  });
}

export async function getParticipant(id: string) {
  return db.participant.findUnique({
    where: { id },
    include: {
      applicant: { include: { skills: { include: { skill: true } } } },
      assignments: { include: { project: { select: { id: true, title: true, status: true } }, role: { select: { title: true } } } },
    },
  });
}

export async function updateParticipant(
  adminId: string,
  data: {
    id: string;
    status: ParticipantStatus;
    hoursPerWeek: number | null;
    availabilityNotes: string | null;
    skillsSummary: string | null;
    internalNotes: string | null;
    preferredCategories: WorkCategory[];
  },
) {
  const { id, ...rest } = data;
  await db.participant.update({ where: { id }, data: rest });
  await audit(adminId, "participant.updated", "Participant", id, { status: data.status });
}

/**
 * Permanently removes a participant record and their project assignments.
 * Refused while any assignment has a compensation agreement: those are removed
 * first, in their own audited action. The database enforces the same rule.
 */
export async function removeParticipant(adminId: string, id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const p = await db.participant.findUnique({ where: { id }, select: { _count: { select: { assignments: true } } } });
  if (!p) return { ok: false, error: "Participant not found." };
  const agreements = await db.compensationAgreement.count({ where: { assignment: { participantId: id } } });
  if (agreements > 0) {
    return { ok: false, error: `This person has ${agreements} compensation agreement${agreements === 1 ? "" : "s"}. Remove ${agreements === 1 ? "it" : "them"} first (on the project page), or set the status to Inactive instead.` };
  }
  await db.participant.delete({ where: { id } });
  await audit(adminId, "participant.removed", "Participant", id, { assignments: p._count.assignments });
  return { ok: true };
}
