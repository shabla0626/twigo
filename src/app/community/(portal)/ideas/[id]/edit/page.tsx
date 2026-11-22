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
  const idea = await db.businessIdea.findUnique({ where: { id } });
  if (!idea || idea.authorId !== user.id || idea.status === "REMOVED") notFound();
  return (
    <div className="max-w-3xl">
      <PageTitle title="Edit your idea" description="Changes are marked as edited. Supporters and comments stay." />
      <Panel>
        <ActionForm action={updateIdeaAction} submitLabel="Save changes">
          <input type="hidden" name="id" value={idea.id} />
          <IdeaFields idea={idea} />
        </ActionForm>
      </Panel>
    </div>
  );
}
