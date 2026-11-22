/**
 * Regression tests for the corrective implementation plan: projects and compensation.
 * P1-6: deleting is owner-only, and a compensation agreement never disappears as a side effect.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { can } from "@/lib/auth/permissions";
import { updateApplicationStatus } from "@/server/admin/applications";
import { addAssignment, addRole, createProject, deleteProject, removeCompensation, saveCompensation } from "@/server/admin/projects";
import { removeParticipant } from "@/server/admin/participants";
import { deleteProjectAction, removeCompensationAction } from "@/app/admin/actions/projects";
import { removeParticipantAction } from "@/app/admin/actions/participants";
import { cookieJar, createUser, resetDb, signIn, submitTestApplication } from "./helpers";

beforeEach(async () => {
  await resetDb();
  cookieJar.clear();
});
afterAll(async () => {
  await db.$disconnect();
});

const form = (data: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(data)) fd.set(k, v);
  return fd;
};
const outcome = async (p: Promise<unknown>) => decodeURIComponent(await p.then(() => "returned").catch((e: Error) => `${e.name}:${e.message}`));

/** A project with one accepted participant assigned to it, and (optionally) a compensation agreement. */
async function projectWithAssignment(opts: { agreement: boolean }) {
  const owner = await createUser({ email: "owner@example.test", totp: true });
  const admin = await createUser({ email: "admin@example.test", role: "ADMIN", totp: true });
  const { application } = await submitTestApplication();
  await updateApplicationStatus(owner.id, application.id, "UNDER_REVIEW");
  await updateApplicationStatus(owner.id, application.id, "ACCEPTED");
  const participant = await db.participant.findFirstOrThrow();
  const project = await createProject(owner.id, {
    title: "Market Research", summary: "Internal summary", description: null, category: "RESEARCH", status: "PLANNING",
    isPublished: false, publicSummary: null, startDate: null, targetDate: null,
  });
  await addRole(owner.id, { projectId: project.id, title: "Researcher", responsibilities: null, openings: 1, skills: "Online research" });
  const role = await db.projectRole.findFirstOrThrow();
  expect((await addAssignment(owner.id, { projectId: project.id, participantId: participant.id, roleId: role.id, responsibilities: null })).ok).toBe(true);
  const assignment = await db.projectAssignment.findFirstOrThrow();
  if (opts.agreement) {
    await saveCompensation(owner.id, { assignmentId: assignment.id, terms: "Fixed fee on delivery", basis: "fixed", amount: 50000, currency: "USD", status: "AGREED", documentRef: "AGR-1" });
  }
  return { owner, admin, participant, project, assignment };
}

describe("P1-6: compensation records cannot disappear as a side effect", () => {
  it("deleting projects and participant records is an owner-only permission", () => {
    for (const p of ["projects.delete", "participants.remove"] as const) {
      expect(can("OWNER", p)).toBe(true);
      expect(can("ADMIN", p)).toBe(false);
    }
    // Administrators keep the day-to-day work.
    expect(can("ADMIN", "projects.manage")).toBe(true);
    expect(can("ADMIN", "participants.manage")).toBe(true);
  });

  it("an administrator is refused by the delete actions; nothing is deleted", async () => {
    const { admin, participant, project } = await projectWithAssignment({ agreement: false });
    await signIn(admin.id, "ADMIN");
    expect(await outcome(deleteProjectAction(form({ id: project.id, confirm: "DELETE" })))).toContain("REDIRECT:/admin/no-access");
    expect(await outcome(removeParticipantAction(form({ id: participant.id, confirm: "REMOVE" })))).toContain("REDIRECT:/admin/no-access");
    expect(await outcome(removeCompensationAction(form({ projectId: project.id, assignmentId: "x", confirm: "REMOVE" })))).toContain("REDIRECT:/admin/no-access");
    expect([await db.project.count(), await db.participant.count(), await db.projectAssignment.count()]).toEqual([1, 1, 1]);
  });

  it("the owner cannot delete a project or participant record while an agreement exists", async () => {
    const { owner, participant, project } = await projectWithAssignment({ agreement: true });
    expect(await deleteProject(owner.id, project.id)).toMatchObject({ ok: false, error: expect.stringContaining("1 compensation agreement") });
    expect(await removeParticipant(owner.id, participant.id)).toMatchObject({ ok: false, error: expect.stringContaining("1 compensation agreement") });
    expect([await db.project.count(), await db.participant.count(), await db.compensationAgreement.count()]).toEqual([1, 1, 1]);

    await signIn(owner.id, "OWNER");
    expect(await outcome(deleteProjectAction(form({ id: project.id, confirm: "DELETE" })))).toContain(`/admin/projects/${project.id}?error=This project has 1 compensation agreement`);
    expect(await db.compensationAgreement.count()).toBe(1);
  });

  it("the database itself refuses, even if the application check were bypassed", async () => {
    const { project, participant } = await projectWithAssignment({ agreement: true });
    await expect(db.project.delete({ where: { id: project.id } })).rejects.toThrow();
    await expect(db.participant.delete({ where: { id: participant.id } })).rejects.toThrow();
    await expect(db.projectAssignment.deleteMany({})).rejects.toThrow();
    expect([await db.project.count(), await db.participant.count(), await db.compensationAgreement.count()]).toEqual([1, 1, 1]);
  });

  it("the owner removes the agreement in its own audited step (no amounts in the audit log), then deletion works and is recorded", async () => {
    const { owner, project, assignment } = await projectWithAssignment({ agreement: true });
    await signIn(owner.id, "OWNER");
    // Needs the typed confirmation.
    expect(await outcome(removeCompensationAction(form({ projectId: project.id, assignmentId: assignment.id, confirm: "" })))).toContain("error=Type REMOVE to confirm");
    expect(await db.compensationAgreement.count()).toBe(1);
    expect(await outcome(removeCompensationAction(form({ projectId: project.id, assignmentId: assignment.id, confirm: "REMOVE" })))).toContain("ok=compensation-removed");
    expect(await db.compensationAgreement.count()).toBe(0);
    const removed = await db.auditLog.findFirstOrThrow({ where: { action: "compensation.removed" } });
    expect(removed.actorId).toBe(owner.id);
    expect(removed.metadata).toMatchObject({ projectId: project.id, statusWhenRemoved: "AGREED" });
    expect(JSON.stringify(removed.metadata)).not.toMatch(/50000|Fixed fee|AGR-1/);
    expect((await removeCompensation(owner.id, assignment.id)).ok).toBe(false); // nothing left

    expect(await deleteProject(owner.id, project.id)).toEqual({ ok: true });
    expect(await db.project.count()).toBe(0);
    const deleted = await db.auditLog.findFirstOrThrow({ where: { action: "project.deleted" } });
    expect(deleted.metadata).toMatchObject({ title: "Market Research", assignments: 1, roles: 1, milestones: 0 });
  });

  it("without an agreement the owner can remove a participant record; the count of removed assignments is recorded", async () => {
    const { owner, participant } = await projectWithAssignment({ agreement: false });
    expect(await removeParticipant(owner.id, participant.id)).toEqual({ ok: true });
    expect([await db.participant.count(), await db.projectAssignment.count(), await db.project.count()]).toEqual([0, 0, 1]);
    expect((await db.auditLog.findFirstOrThrow({ where: { action: "participant.removed" } })).metadata).toMatchObject({ assignments: 1 });
    expect(await deleteProject(owner.id, "does-not-exist")).toMatchObject({ ok: false });
  });
});
