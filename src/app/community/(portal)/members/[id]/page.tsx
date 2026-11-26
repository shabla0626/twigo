import Link from "next/link";
import { notFound } from "next/navigation";
import { inviteToGroupAction } from "@/app/community/actions";
import { ReportButton } from "@/components/community/report-button";
import { MemberAvatar, Panel, TextBody } from "@/components/community/ui";
import { FormAlert } from "@/components/forms/fields";
import { Badge, Button } from "@/components/ui/primitives";
import { db } from "@/lib/db";
import { readFlash } from "@/lib/flash";
import { requireMember } from "@/lib/auth/guard";
import { GROUP_STATUS_LABELS } from "@/server/community/group-labels";
import { memberLabel, teammateIds } from "@/server/community/identity";
import { groupsICanInvite } from "@/server/community/invitations";

export default async function MemberPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const viewer = await requireMember();
  const { id } = await params;
  const flash = readFlash(await searchParams);
  const [member, teammates, inviteGroups, articles] = await Promise.all([
    db.user.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        createdAt: true,
        profile: true,
        memberships: { where: { status: "ACTIVE", group: { suspendedAt: null } }, select: { role: true, group: { select: { slug: true, name: true, status: true } } } },
        ideas: { where: { status: { in: ["OPEN", "GROUP_FORMED"] } }, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, title: true } },
      },
    }),
    teammateIds(viewer.id),
    groupsICanInvite(viewer.id),
    db.boardArticle.findMany({ where: { authorId: id, removedAt: null }, orderBy: { createdAt: "desc" }, take: 8, select: { id: true, title: true } }),
  ]);
  if (!member?.profile || member.status !== "ACTIVE") notFound();
  const p = member.profile;
  const open = teammates.has(member.id);
  const label = memberLabel(member.id, p.displayName, teammates);
  return (
    <div className="max-w-4xl space-y-6">
      {flash.ok && <FormAlert tone="success">{flash.ok}</FormAlert>}
      {flash.error && <FormAlert tone="error">{flash.error}</FormAlert>}
      <section className="flex flex-wrap items-start gap-5 rounded-3xl border border-ink-100 bg-white p-6 shadow-soft">
        <MemberAvatar name={label} photoId={open ? p.photoFileId : null} size={80} />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold text-ink-950">{label}</h1>
          {open && p.headline && <p className="text-ink-700">{p.headline}</p>}
          {!open && <p className="mt-1 text-sm leading-6 text-ink-600">Anonymous account. Pieces, interests, and skills stay visible. A profile opens inside a project you both belong to.</p>}
          {open && (
            <p className="mt-1 text-sm text-ink-500">
              {[p.showLocation && p.location, p.showTimeZone && p.timeZone, `member since ${member.createdAt.toLocaleDateString("en-US", { month: "long", year: "numeric" })}`].filter(Boolean).join(" · ")}
            </p>
          )}
          {open && p.showHours && (p.hoursPerWeek != null || p.availability) && (
            <p className="mt-1 text-sm text-ink-600">
              Available {p.hoursPerWeek != null ? `about ${p.hoursPerWeek} h/week` : ""}
              {p.availability ? `${p.hoursPerWeek != null ? ", " : ""}${p.availability}` : ""}
            </p>
          )}
        </div>
        {viewer.id === member.id ? (
          <Link href="/community/profile" className="text-sm font-medium text-accent-700 hover:underline">
            Edit profile
          </Link>
        ) : (
          <ReportButton targetType="USER" targetId={member.id} label="Report profile" />
        )}
      </section>
      {viewer.id !== member.id && inviteGroups.length > 0 && (
        <form action={inviteToGroupAction} className="space-y-3 rounded-2xl border border-ink-100 bg-white p-5">
          <h2 className="text-base font-semibold text-ink-950">Invite into a project</h2>
          <p className="text-sm leading-6 text-ink-600">Any member of a project can invite an approved community member. They join the project when they accept. An invitation does not replace community membership approval.</p>
          <input type="hidden" name="inviteeId" value={member.id} />
          <label htmlFor="invite-group" className="block text-sm font-medium text-ink-800">
            Project
          </label>
          <select id="invite-group" name="groupId" required className="block w-full rounded-xl border-0 px-3 py-2 text-sm ring-1 ring-inset ring-ink-300">
            {inviteGroups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <Button type="submit">Send invitation</Button>
        </form>
      )}
      <div className="grid gap-6 md:grid-cols-2">
        {open && p.intro && (
          <Panel title="About">
            <TextBody text={p.intro} className="text-sm leading-6" />
          </Panel>
        )}
        {(p.skills.length > 0 || (open && p.experience) || p.interests) && (
          <Panel title={open ? "Skills & experience" : "Skills and interests"}>
            {p.skills.length > 0 && (
              <ul className="flex flex-wrap gap-1.5">
                {p.skills.map((s) => (
                  <li key={s}>
                    <Badge tone="accent">{s}</Badge>
                  </li>
                ))}
              </ul>
            )}
            {open && p.experience && <TextBody text={p.experience} className="mt-3 text-sm leading-6" />}
            {p.interests && <p className="mt-3 text-sm text-ink-700">Interested in: {p.interests}</p>}
          </Panel>
        )}
        <Panel title="Discussion pieces">
          {articles.length ? (
            <ul className="space-y-1 text-sm">
              {articles.map((a) => (
                <li key={a.id}>
                  <Link href={`/community/discuss/${a.id}`} className="text-accent-700 hover:underline">
                    {a.title}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-600">No discussion pieces yet.</p>
          )}
        </Panel>
        {open && (
          <Panel title="Groups">
            {member.memberships.length ? (
              <ul className="space-y-1 text-sm">
                {member.memberships.map((m) => (
                  <li key={m.group.slug}>
                    <Link href={`/community/groups/${m.group.slug}`} className="text-accent-700 hover:underline">
                      {m.group.name}
                    </Link>{" "}
                    <span className="text-ink-500">
                      · {GROUP_STATUS_LABELS[m.group.status]}
                      {m.role === "COORDINATOR" && " · coordinator"}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-600">Not in any group yet.</p>
            )}
          </Panel>
        )}
        <Panel title="Ideas">
          {member.ideas.length ? (
            <ul className="space-y-1 text-sm">
              {member.ideas.map((i) => (
                <li key={i.id}>
                  <Link href={`/community/ideas/${i.id}`} className="text-accent-700 hover:underline">
                    {i.title}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-600">No ideas yet.</p>
          )}
        </Panel>
      </div>
    </div>
  );
}
