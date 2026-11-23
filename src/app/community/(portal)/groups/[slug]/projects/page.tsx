import Link from "next/link";
import { ActionForm } from "@/components/forms/action-form";
import { Field, Input, Textarea } from "@/components/forms/fields";
import { MembersOnly } from "@/components/community/members-only";
import { EmptyState, Panel, Time } from "@/components/community/ui";
import { Badge } from "@/components/ui/primitives";
import { brand } from "@/config/brand";
import { AGREEMENT_STATUS_LABELS, PROJECT_STATUS_LABELS, listGroupProjects } from "@/server/community/group-projects";
import { loadGroupPage } from "@/server/community/group-page";
import { createProjectAction } from "../../../../project-actions";

type Props = { params: Promise<{ slug: string }> };

/** The group's own projects. The group decides; the platform takes no part in project money. */
export default async function GroupProjectsPage({ params }: Props) {
  const { slug } = await params;
  const { user, group, isMember, isOpen } = await loadGroupPage(slug);
  if (!isMember) return <MembersOnly groupId={group.id} what="Projects" canJoin={isOpen} />;
  const projects = await listGroupProjects(group.id, user.id);
  const name = brand().name;
  return (
    <div className="max-w-4xl space-y-6">
      <p className="rounded-xl bg-ink-50 px-4 py-3 text-sm leading-6 text-ink-700">
        <strong>How projects work:</strong> when the group finds a real opportunity, it creates a project and writes its agreement: scope, who does what,
        who contracts with the customer, who receives payment, expenses and how revenue is shared. Commercial work starts only after every participant
        accepted it. {name} is not a party to project agreements and takes no share. Details:{" "}
        <Link href="/legal/participation-compensation" className="font-medium text-accent-700 underline underline-offset-2">
          Participation and Compensation Policy
        </Link>
        .
      </p>
      <Panel title={`Projects (${projects.length})`}>
        {projects.length === 0 ? (
          <EmptyState title="No projects yet" body="Create one when the group has a concrete opportunity to work on." />
        ) : (
          <ul className="divide-y divide-ink-100">
            {projects.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <Link href={`/community/groups/${slug}/projects/${p.id}`} className="font-medium text-ink-950 underline-offset-2 hover:underline">
                    {p.name}
                  </Link>
                  <p className="text-xs text-ink-500">
                    Coordinator: {p.coordinator?.profile?.displayName ?? "not set"} · created <Time date={p.createdAt} />
                    {p.versions[0] && ` · agreement version ${p.versions[0].version}: ${AGREEMENT_STATUS_LABELS[p.versions[0].status]}`}
                  </p>
                </div>
                <Badge tone={p.status === "ACTIVE" ? "success" : p.status === "CANCELLED" ? "neutral" : "accent"}>{PROJECT_STATUS_LABELS[p.status]}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      {isOpen && (
        <Panel title="Create a project">
          <ActionForm action={createProjectAction} submitLabel="Create project">
            <input type="hidden" name="groupId" value={group.id} />
            <Field id="name" label="Project name">
              <Input id="name" name="name" required minLength={3} maxLength={120} />
            </Field>
            <Field id="objective" label="Business objective" hint="What the project would deliver, and for whom.">
              <Textarea id="objective" name="objective" required minLength={10} maxLength={2000} rows={3} aria-describedby="objective-hint" />
            </Field>
            <p className="text-sm text-ink-600">You become the project coordinator; you can hand this role to another group member later.</p>
          </ActionForm>
        </Panel>
      )}
    </div>
  );
}
