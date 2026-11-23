import { notFound } from "next/navigation";
import { ActionForm } from "@/components/forms/action-form";
import { IdeaFields } from "@/components/community/idea-fields";
import { PageTitle, Panel } from "@/components/community/ui";
import { db } from "@/lib/db";
import { requireMember } from "@/lib/auth/guard";
import { updateIdeaAction } from "../../../../actions";

export const metadata = { title: "Edit idea" };

export default async function EditIdeaPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireMember();
  const { id } = await params;
  const idea = await db.businessIdea.findUnique({ where: { id }, include: { group: { select: { slug: true, name: true } }, _count: { select: { endorsements: true } } } });
  if (!idea || idea.authorId !== user.id || idea.status === "REMOVED") notFound();
  const supporters = idea._count.endorsements;
  const hasGroup = Boolean(idea.group);

  return (
    <div className="max-w-3xl">
      <PageTitle title="Edit your idea" description="Every change is kept in the idea’s history, which all members can read." />
      <Panel>
        <ActionForm action={updateIdeaAction} submitLabel="Save changes">
          <input type="hidden" name="id" value={idea.id} />
          {hasGroup && (
            <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-sky-950">
              <p className="font-semibold">This idea already has a project group.</p>
              <p className="mt-1">
                You can still make minor corrections here (wording, typos, clarity). The direction of the work now belongs to the group “{idea.group!.name}
                ”: a change of direction is made there by the coordinator, together with a note that every member sees.
              </p>
            </div>
          )}
          {!hasGroup && supporters > 0 && (
            <fieldset className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <legend className="px-1 text-sm font-semibold text-ink-950">
                {supporters} {supporters === 1 ? "person supports" : "people support"} this idea. What kind of change is this?
              </legend>
              <div className="mt-2 space-y-3 text-sm leading-6 text-ink-800">
                <label className="flex gap-3">
                  <input type="radio" name="changeKind" value="MINOR" required className="mt-1.5" />
                  <span>
                    <strong>Minor correction.</strong> Wording, typos or clarity; the idea itself stays the same. Support is kept. Supporters are told
                    and can see what changed.
                  </span>
                </label>
                <label className="flex gap-3">
                  <input type="radio" name="changeKind" value="MATERIAL" required className="mt-1.5" />
                  <span>
                    <strong>Material change.</strong> The business purpose, how it would earn money, its scope or its area changes. Support is reset:
                    supporters are told and can support the new version if they still agree.
                  </span>
                </label>
              </div>
            </fieldset>
          )}
          <IdeaFields idea={idea} />
        </ActionForm>
      </Panel>
    </div>
  );
}
