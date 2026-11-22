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

/** Removes a participant record (and their assignments/compensation records). */
export async function removeParticipant(adminId: string, id: string) {
  await db.participant.delete({ where: { id } });
  await audit(adminId, "participant.removed", "Participant", id);
}
