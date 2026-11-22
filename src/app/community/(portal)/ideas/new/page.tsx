import Link from "next/link";
import { ActionForm } from "@/components/forms/action-form";
import { IdeaFields } from "@/components/community/idea-fields";
import { PageTitle, Panel } from "@/components/community/ui";
import { requireMember } from "@/lib/auth/guard";
import { getSetting } from "@/server/settings";
import { createIdeaAction } from "../../../actions";

export const metadata = { title: "Propose a Business Idea" };

export default async function NewIdeaPage() {
  await requireMember();
  const threshold = await getSetting("community.endorsementThreshold");
  return (
    <div className="max-w-3xl">
      <p className="mb-2 text-sm">
        <Link href="/community" className="text-accent-700 hover:underline">
          ← Business Ideas
        </Link>
      </p>
      <PageTitle
        title="Propose a Business Idea"
        description={`You don’t need a business plan. Describe the idea in your own words; other members can ask questions and support it. When ${threshold} other members support it, a research group is created to investigate it together.`}
      />
      <Panel>
        <ActionForm action={createIdeaAction} submitLabel="Publish idea" pendingLabel="Publishing…">
          <IdeaFields />
          <p className="text-sm leading-6 text-ink-500">
            Only approved members can see your idea, never the public. Please don’t share confidential information from an employer or client. Ideas that ask
            members for money are not allowed.
          </p>
        </ActionForm>
      </Panel>
    </div>
  );
}
