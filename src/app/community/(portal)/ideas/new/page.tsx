import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/forms/action-form";
import { IdeaFields } from "@/components/community/idea-fields";
import { PageTitle, Panel } from "@/components/community/ui";
import { db } from "@/lib/db";
import { requireMember } from "@/lib/auth/guard";
import { discussionParticipants } from "@/server/community/board";
import { getSetting } from "@/server/settings";
import { createIdeaAction } from "../../../actions";

export const metadata = { title: "Propose a Business Idea" };

export default async function NewIdeaPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireMember();
  const threshold = await getSetting("community.endorsementThreshold");
  const from = (await searchParams).from;
  const source = from
    ? await db.boardArticle.findFirst({ where: { id: from, removedAt: null }, select: { id: true, title: true } })
    : null;
  if (from && !source) notFound();
  const takingPart = source ? (await discussionParticipants(source.id)).some((p) => p.id === user.id) : false;
  return (
    <div className="max-w-3xl">
      <p className="mb-2 text-sm">
        <Link href={source ? `/community/discuss/${source.id}` : "/community"} className="text-accent-700 hover:underline">
          {source ? "← Discussion" : "← Business Ideas"}
        </Link>
      </p>
      <PageTitle
        title="Propose a Business Idea"
        description={
          source
            ? `This idea stays linked to “${source.title}”. The people in that discussion are told. When ${threshold} other members support it, a project group is created.`
            : `You don’t need a business plan. Describe the idea in your own words; other members can ask questions and support it. When ${threshold} other members support it, a project group is created to investigate it together.`
        }
      />
      {source && !takingPart ? (
        <Panel title="Join the discussion first">
          <p className="text-sm leading-6 text-ink-700">
            Only the people who wrote that piece or commented on it can propose an idea from it.{" "}
            <Link href={`/community/discuss/${source.id}`} className="font-medium text-accent-700 hover:underline">
              Comment on the piece
            </Link>
            , then come back.
          </p>
        </Panel>
      ) : (
      <Panel>
        <ActionForm action={createIdeaAction} submitLabel="Publish idea" pendingLabel="Publishing…">
          {source && <input type="hidden" name="sourceArticleId" value={source.id} />}
          <IdeaFields />
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
            <p className="font-semibold">Before you publish</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>All approved members can read your idea (never the public). It is therefore not confidential: do not include anything you want to keep secret, or confidential information from an employer or client.</li>
              <li>
                You keep ownership of your idea. Publishing it only lets the community show it to members (see the{" "}
                <Link href="/legal/intellectual-property" target="_blank" className="font-medium underline">
                  Intellectual Property Policy
                </Link>
                ). If a project uses it, the participants agree ownership of the work in writing before starting.
              </li>
              <li>Ideas that ask members for money are not allowed.</li>
            </ul>
            <label className="mt-3 flex items-start gap-3">
              <input type="checkbox" name="visibilityAck" required className="mt-1 h-4 w-4 rounded border-amber-300" />
              <span>I understand who can see my idea and that it is not confidential.</span>
            </label>
          </div>
        </ActionForm>
      </Panel>
      )}
    </div>
  );
}
