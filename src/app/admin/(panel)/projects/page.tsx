import Link from "next/link";
import { AdminHeader, Empty, Flash, Panel, Table, fmtDate } from "@/components/admin/ui";
import { ProjectFields } from "@/components/admin/project-fields";
import { Badge, buttonClass } from "@/components/ui/primitives";
import { requireAdmin } from "@/lib/auth/guard";
import { PROJECT_STATUSES, WORK_CATEGORIES } from "@/lib/labels";
import { listProjects, progressOf } from "@/server/admin/projects";
import { createProjectAction } from "../../actions/projects";

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdmin("projects.manage");
  const sp = await searchParams;
  const projects = await listProjects();
  return (
    <>
      <AdminHeader title="Projects" description="Create projects, define roles, assign participants and track milestones." />
      <Flash ok={sp.ok} error={sp.error} />
      <div className="mt-6">
        <Table
          head={["Project", "Status", "Category", "Roles", "Assigned", "Progress", "Updated"]}
          empty={projects.length === 0 ? <Empty>No projects yet.</Empty> : undefined}
        >
          {projects.map((p) => {
            const progress = progressOf(p.milestones);
            return (
              <tr key={p.id} className="hover:bg-ink-50">
                <td className="px-4 py-3">
                  <Link href={`/admin/projects/${p.id}`} className="font-medium text-ink-950 hover:underline">
                    {p.title}
                  </Link>
                  {p.isPublished && (
                    <span className="ml-2">
                      <Badge tone="accent">Published</Badge>
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <Badge>{PROJECT_STATUSES[p.status]}</Badge>
                </td>
                <td className="px-4 py-3 text-ink-700">{p.category ? WORK_CATEGORIES[p.category] : "—"}</td>
                <td className="px-4 py-3 tabular-nums">{p._count.roles}</td>
                <td className="px-4 py-3 tabular-nums">{p._count.assignments}</td>
                <td className="px-4 py-3 tabular-nums">{progress === null ? "—" : `${progress}%`}</td>
                <td className="whitespace-nowrap px-4 py-3 text-ink-600">{fmtDate(p.updatedAt)}</td>
              </tr>
            );
          })}
        </Table>
      </div>
      <Panel title="New project" className="mt-8">
        <form action={createProjectAction} className="space-y-4">
          <ProjectFields />
          <button type="submit" className={buttonClass("primary", "sm")}>
            Create project
          </button>
        </form>
      </Panel>
    </>
  );
}
