/**
 * Regression tests for the corrective implementation plan, Stage 3 (low-priority findings).
 * P3-14: actions that cannot be undone ask first; a removed member is told; the organization can lift a removal.
 * P3-15: no action fails silently.
 * P3-18: a page shows a message only if the site itself wrote it.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { FLASH_MAX_AGE_MS, flashQuery, readFlash, withFlash } from "@/lib/flash";
import {
  closeIdeaAction,
  deleteCommentAction,
  deleteDiscussionAction,
  deleteFileAction,
  deleteLinkAction,
  deleteNoteAction,
  deleteTaskAction,
  endMeetingAction,
  joinGroupAction,
  leaveGroupAction,
  removeMemberAction,
  taskStatusAction,
  transferCoordinatorAction,
} from "@/app/community/actions";
import { liftRemovalAction } from "@/app/admin/actions/community";
import { adminLiftRemoval, admitMember, joinGroup, removeMember } from "@/server/community/groups";
import { createIdea, endorseIdea } from "@/server/community/ideas";
import { addTask, saveNote } from "@/server/community/research";
import { cookieJar, createMember, createUser, resetDb, signIn } from "./helpers";

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
/** Where an action redirected to ("" when it returned normally). */
const redirectOf = async (p: Promise<unknown>) => p.then(() => "").catch((e: Error) => (e.message.startsWith("REDIRECT:") ? e.message.slice(9) : Promise.reject(e)));
/** The message the next page would display for a redirect address. */
const shownAt = (address: string) => readFlash(Object.fromEntries(new URL(address, "http://x").searchParams));

async function setup() {
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
  const g = await db.researchGroup.findUniqueOrThrow({ where: { ideaId: res.id }, include: { channels: true } });
  return { a, b, c, g, ideaId: res.id, channelId: g.channels[0]!.id };
}
const systemLines = async (channelId: string) => (await db.chatMessage.findMany({ where: { channelId, kind: "SYSTEM" }, orderBy: { createdAt: "asc" } })).map((m) => m.body);

describe("P3-18: a page shows only messages this site wrote", () => {
  it("free text from an address is never displayed", () => {
    expect(readFlash({ ok: "Your account was hacked. Call 555-0100." })).toEqual({});
    expect(readFlash({ error: "Payment required", sig: "abc.def" })).toEqual({});
    expect(readFlash({ error: ["Payment required", "x"] })).toEqual({});
    expect(readFlash({})).toEqual({});
  });

  it("fixed codes are displayed as their fixed wording", () => {
    expect(readFlash({ ok: "saved" })).toEqual({ ok: "Changes saved.", error: undefined });
    expect(readFlash({ error: "confirm" }).error).toContain("Nothing was changed");
    // A code of one kind is not a code of the other kind, and object internals are not codes.
    expect(readFlash({ ok: "confirm" })).toEqual({ ok: undefined, error: undefined });
    expect(readFlash({ ok: "constructor" }).ok).toBeUndefined();
    expect(readFlash({ ok: "__proto__" }).ok).toBeUndefined();
  });

  it("a message written by the site is displayed, for a few minutes only", () => {
    const now = Date.UTC(2026, 5, 1, 12, 0, 0);
    const address = withFlash("/admin/members?show=staff", { ok: "Signed out of 3 other sessions." }, now);
    expect(address.startsWith("/admin/members?show=staff&ok=")).toBe(true);
    const sp = Object.fromEntries(new URL(address, "http://x").searchParams);
    expect(readFlash(sp, now + 2_000)).toEqual({ ok: "Signed out of 3 other sessions.", error: undefined });
    expect(readFlash(sp, now + FLASH_MAX_AGE_MS + 1_000)).toEqual({ ok: undefined, error: undefined });
    // A signature from the future is not accepted either.
    expect(readFlash(sp, now - 5 * 60_000)).toEqual({ ok: undefined, error: undefined });
  });

  it("a real signature cannot be reused for other words, or for the other kind of message", () => {
    const now = Date.now();
    const sp = Object.fromEntries(new URLSearchParams(flashQuery({ ok: "Status updated." }, now)));
    expect(readFlash(sp, now).ok).toBe("Status updated.");
    expect(readFlash({ ...sp, ok: "Send your password to this address" }, now)).toEqual({ ok: undefined, error: undefined });
    expect(readFlash({ error: sp.ok, sig: sp.sig }, now)).toEqual({ ok: undefined, error: undefined });
    expect(readFlash({ ...sp, error: "added by someone" }, now)).toEqual({ ok: undefined, error: undefined });
    expect(readFlash({ ...sp, sig: `${sp.sig}x` }, now).ok).toBeUndefined();
    expect(readFlash({ ...sp, sig: "nonsense" }, now).ok).toBeUndefined();
    expect(readFlash({ ...sp, sig: "zzzz." }, now).ok).toBeUndefined();
  });

  it("both an ok and an error can travel together", () => {
    const now = Date.now();
    const sp = Object.fromEntries(new URLSearchParams(flashQuery({ ok: "Status updated.", error: "The email was not sent." }, now)));
    expect(readFlash(sp, now)).toEqual({ ok: "Status updated.", error: "The email was not sent." });
    expect(flashQuery({})).toBe("");
    expect(withFlash("/x", {})).toBe("/x");
  });

  it("no page displays address text directly, and no action writes an unsigned message", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(name)) files.push(p);
      }
    };
    walk("src/app");
    walk("src/components");
    const offenders: string[] = [];
    for (const f of files) {
      const s = readFileSync(f, "utf8");
      // Raw display of ?ok= / ?error= …
      if (/\{sp\.(ok|error)\}|ok=\{sp\.ok\}|error=\{sp\.error\}|one\("(ok|error)"\)/.test(s)) offenders.push(`${f}: displays address text`);
      if (/const \{ (ok|error)[^}]*\} = await searchParams/.test(s)) offenders.push(`${f}: displays address text`);
      // … and free text written into an address without a signature.
      if (/[?&](ok|error)=\$\{/.test(s)) offenders.push(`${f}: writes an unsigned message`);
      if (/[?&](ok|error)=[A-Za-z]+(\+|%20)/.test(s)) offenders.push(`${f}: writes an unsigned message`);
    }
    expect(offenders).toEqual([]);
  });
});

describe("P3-15: no action fails silently", () => {
  it("each one-click action explains a refusal, and an unknown group is 'not found', not a crash", async () => {
    const { a, b, g } = await setup();
    const outsider = await createMember("Olaf");
    const saved = await saveNote(a.id, g.id, { section: "MARKET", title: "Market", body: "Notes about the market." });
    const added = await addTask(a.id, g.id, { title: "Call three shops", details: null, assigneeId: null, dueDate: null });
    if (!saved.ok || !added.ok) throw new Error("setup failed");
    const note = await db.researchNote.findFirstOrThrow({ where: { groupId: g.id } });
    const task = await db.researchTask.findFirstOrThrow({ where: { groupId: g.id } });

    // Someone who is not in the group.
    await signIn(outsider.id);
    for (const action of [deleteNoteAction, deleteTaskAction, taskStatusAction, deleteLinkAction, deleteFileAction, endMeetingAction]) {
      const res = await action(undefined, form({ groupId: g.id, id: "nothing", meetingId: "nothing", status: "DONE" }));
      expect(res?.error, action.name).toBe("Join the group to use this.");
    }
    // An ordinary member who is neither the author nor the coordinator.
    await signIn(b.id);
    expect((await deleteNoteAction(undefined, form({ groupId: g.id, id: note.id })))?.error).toBe("Only the author or the coordinator can delete a note.");
    expect((await deleteTaskAction(undefined, form({ groupId: g.id, id: task.id })))?.error).toBe("Only the creator or the coordinator can delete a task.");
    expect((await deleteLinkAction(undefined, form({ groupId: g.id, id: "missing" })))?.error).toBe("Link not found.");
    expect((await deleteFileAction(undefined, form({ groupId: g.id, id: "missing" })))?.error).toBe("File not found.");
    expect((await deleteCommentAction(undefined, form({ id: "missing", path: "/community" })))?.error).toBe("You can only delete your own comments.");
    expect((await deleteDiscussionAction(undefined, form({ id: "missing", groupId: g.id })))?.error).toBe("You can only delete your own discussions.");
    expect(await db.researchNote.count()).toBe(1);
    expect(await db.researchTask.count()).toBe(1);
    // A success returns nothing to show.
    expect(await taskStatusAction(undefined, form({ groupId: g.id, id: task.id, status: "DONE" }))).toBeUndefined();

    // A group that does not exist.
    for (const action of [deleteNoteAction, deleteTaskAction, taskStatusAction, deleteLinkAction, deleteFileAction, endMeetingAction, removeMemberAction, transferCoordinatorAction, deleteDiscussionAction]) {
      const res = await action(undefined, form({ groupId: "no-such-group", id: "x", userId: "x", meetingId: "x", status: "DONE" }));
      expect(res?.error, action.name).toBe("Group not found.");
    }
    for (const action of [joinGroupAction, leaveGroupAction]) {
      const to = await redirectOf(action(form({ groupId: "no-such-group" })));
      expect(to.startsWith("/community/groups?error=")).toBe(true);
      expect(shownAt(to).error).toBe("Group not found.");
    }
  });

  it("closing an idea reports why it is refused", async () => {
    const { a, b, ideaId } = await setup();
    await signIn(b.id);
    expect((await closeIdeaAction(undefined, form({ id: ideaId })))?.error).toBe("Only the author can close this idea.");
    await signIn(a.id);
    expect((await closeIdeaAction(undefined, form({ id: ideaId })))?.error).toContain("already has a project group");
    expect((await db.businessIdea.findUniqueOrThrow({ where: { id: ideaId } })).status).not.toBe("CLOSED");
  });

  it("the source has no swallowed errors left, and the buttons use the component that shows them", () => {
    const actions = readFileSync("src/app/community/actions.ts", "utf8");
    expect(actions).not.toContain(".catch(() => {})");
    expect(actions).not.toContain("findUniqueOrThrow");
    for (const f of [
      "src/app/community/(portal)/groups/[slug]/research/page.tsx",
      "src/app/community/(portal)/groups/[slug]/meetings/page.tsx",
      "src/app/community/(portal)/groups/[slug]/members/page.tsx",
      "src/app/community/(portal)/groups/[slug]/discussions/[id]/page.tsx",
      "src/app/community/(portal)/ideas/[id]/page.tsx",
      "src/components/community/comment-thread.tsx",
    ]) {
      const s = readFileSync(f, "utf8");
      expect(s, f).toContain("<QuickAction");
      expect(s, f).not.toMatch(/<form action=\{(delete|taskStatus|endMeeting|closeIdea|removeMember|transferCoordinator)\w*Action\}/);
    }
    expect(readFileSync("src/components/community/quick-action.tsx", "utf8")).toContain('role="alert"');
  });
});

describe("P3-14: actions that cannot be undone", () => {
  it("Close idea, Make coordinator and Remove member ask first", () => {
    const idea = readFileSync("src/app/community/(portal)/ideas/[id]/page.tsx", "utf8");
    expect(idea).toMatch(/action=\{closeIdeaAction\}[\s\S]{0,200}confirm=\{\{/);
    const members = readFileSync("src/app/community/(portal)/groups/[slug]/members/page.tsx", "utf8");
    expect(members).toMatch(/action=\{transferCoordinatorAction\}[\s\S]{0,300}confirm=\{\{/);
    expect(members).toMatch(/action=\{removeMemberAction\}[\s\S]{0,500}confirm=\{\{/);
    expect(members).toContain("they cannot rejoin by themselves");
  });

  it("a removed member is told, and the coordinator sees the result on the members page", async () => {
    const { a, b, g } = await setup();
    await signIn(a.id);
    const to = await redirectOf(removeMemberAction(undefined, form({ groupId: g.id, userId: b.id })));
    expect(to.startsWith(`/community/groups/${g.slug}/members?ok=`)).toBe(true);
    expect(shownAt(to).ok).toContain("was removed and has been told");
    const n = await db.notification.findMany({ where: { userId: b.id, title: `You were removed from “${g.name}” by its coordinator` } });
    expect(n).toHaveLength(1);
    expect(n[0]!.body).toContain("contact the administrators");
    // A second attempt is refused with a message next to the button.
    expect((await removeMemberAction(undefined, form({ groupId: g.id, userId: b.id })))?.error).toBe("That person is not an active member.");
    // A member who is not the coordinator cannot remove anyone.
    const c = await db.user.findFirstOrThrow({ where: { email: "cara@example.test" } });
    await signIn(c.id);
    expect((await removeMemberAction(undefined, form({ groupId: g.id, userId: a.id })))?.error).toBe("Only the group coordinator can do this.");
    expect((await transferCoordinatorAction(undefined, form({ groupId: g.id, userId: c.id })))?.error).toBe("Only the group coordinator can do this.");
  });

  it("handing over the coordinator role reports the result", async () => {
    const { a, b, g } = await setup();
    await signIn(a.id);
    expect((await transferCoordinatorAction(undefined, form({ groupId: g.id, userId: "nobody" })))?.error).toBe("Choose an active member of the group.");
    const to = await redirectOf(transferCoordinatorAction(undefined, form({ groupId: g.id, userId: b.id })));
    expect(shownAt(to).ok).toContain("handed over");
    const roles = await db.groupMembership.findMany({ where: { groupId: g.id, role: "COORDINATOR" } });
    expect(roles.map((r) => r.userId)).toEqual([b.id]);
  });

  it("the organization can lift a removal: the person may rejoin, is not put back, and the group can see it", async () => {
    const { a, b, g, channelId } = await setup();
    const owner = await createUser({ email: "owner@example.test", role: "OWNER", totp: true });
    expect((await removeMember(a.id, g.id, b.id)).ok).toBe(true);
    expect((await joinGroup(b.id, g.id)).ok).toBe(false);
    expect((await admitMember(b.id, g.id)).ok).toBe(false);

    // Nothing to lift for an active member or a stranger.
    expect((await adminLiftRemoval(owner.id, g.id, a.id)).ok).toBe(false);
    expect((await adminLiftRemoval(owner.id, g.id, "nobody")).ok).toBe(false);

    expect((await adminLiftRemoval(owner.id, g.id, b.id)).ok).toBe(true);
    // Not a member again by this act alone.
    expect((await db.groupMembership.findUniqueOrThrow({ where: { groupId_userId: { groupId: g.id, userId: b.id } } })).status).toBe("LEFT");
    expect(await systemLines(channelId)).toContain("An administrator allowed Bob to join the group again");
    expect(await db.auditLog.count({ where: { action: "group.removal_lifted", actorId: owner.id, entityId: g.id } })).toBe(1);
    const titles = (await db.notification.findMany({ where: { userId: b.id }, orderBy: { createdAt: "asc" } })).map((n) => n.title);
    expect(titles).toContain(`You can join “${g.name}” again`);
    // Lifting twice changes nothing.
    expect((await adminLiftRemoval(owner.id, g.id, b.id)).ok).toBe(false);

    expect((await joinGroup(b.id, g.id)).ok).toBe(true);
    expect((await db.groupMembership.findUniqueOrThrow({ where: { groupId_userId: { groupId: g.id, userId: b.id } } })).status).toBe("ACTIVE");
  });

  it("only someone who may manage groups can lift a removal", async () => {
    const { a, b, g } = await setup();
    await removeMember(a.id, g.id, b.id);
    await signIn(b.id);
    const to = await redirectOf(liftRemovalAction(form({ id: g.id, userId: b.id })));
    expect(to).not.toContain("/admin/groups/");
    expect((await db.groupMembership.findUniqueOrThrow({ where: { groupId_userId: { groupId: g.id, userId: b.id } } })).status).toBe("REMOVED");

    const owner = await createUser({ email: "owner@example.test", role: "OWNER", totp: true });
    await signIn(owner.id, "OWNER");
    const done = await redirectOf(liftRemovalAction(form({ id: g.id, userId: b.id })));
    expect(done.startsWith(`/admin/groups/${g.id}?ok=`)).toBe(true);
    expect(shownAt(done).ok).toContain("Removal lifted");
  });
});
