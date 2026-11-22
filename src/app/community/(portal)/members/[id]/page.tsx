import Link from "next/link";
import { notFound } from "next/navigation";
import { ReportButton } from "@/components/community/report-button";
import { MemberAvatar, Panel, TextBody } from "@/components/community/ui";
import { Badge } from "@/components/ui/primitives";
import { db } from "@/lib/db";
import { requireMember } from "@/lib/auth/guard";
import { GROUP_STATUS_LABELS } from "@/server/community/group-labels";

export default async function MemberPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireMember();
  const { id } = await params;
  // Only member-facing profile fields are selected. Never email, phone,
  // application data or administrator notes.
  const member = await db.user.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      createdAt: true,
      profile: true,
      memberships: { where: { status: "ACTIVE", group: { suspendedAt: null } }, select: { role: true, group: { select: { slug: true, name: true, status: true } } } },
      ideas: { where: { status: { in: ["OPEN", "GROUP_FORMED"] } }, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, title: true } },
    },
  });
  if (!member?.profile || member.status !== "ACTIVE") notFound();
  const p = member.profile;
  return (
    <div className="max-w-4xl space-y-6">
      <section className="flex flex-wrap items-start gap-5 rounded-3xl border border-ink-100 bg-white p-6 shadow-soft">
        <MemberAvatar name={p.displayName} photoId={p.photoFileId} size={80} />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold text-ink-950">{p.displayName}</h1>
          {p.headline && <p className="text-ink-700">{p.headline}</p>}
          <p className="mt-1 text-sm text-ink-500">
            {[p.showLocation && p.location, p.showTimeZone && p.timeZone, `member since ${member.createdAt.toLocaleDateString("en-US", { month: "long", year: "numeric" })}`].filter(Boolean).join(" · ")}
          </p>
          {p.showHours && (p.hoursPerWeek != null || p.availability) && (
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
      <div className="grid gap-6 md:grid-cols-2">
        {p.intro && (
          <Panel title="About">
            <TextBody text={p.intro} className="text-sm leading-6" />
          </Panel>
        )}
        {(p.skills.length > 0 || p.experience || p.interests) && (
          <Panel title="Skills & experience">
            {p.skills.length > 0 && (
              <ul className="flex flex-wrap gap-1.5">
                {p.skills.map((s) => (
                  <li key={s}>
                    <Badge tone="accent">{s}</Badge>
                  </li>
                ))}
              </ul>
            )}
            {p.experience && <TextBody text={p.experience} className="mt-3 text-sm leading-6" />}
            {p.interests && <p className="mt-3 text-sm text-ink-700">Interested in: {p.interests}</p>}
          </Panel>
        )}
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
