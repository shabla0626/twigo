import { joinGroupAction } from "@/app/community/actions";
import { Button } from "../ui/primitives";
import { GroupAgreementNote } from "./group-agreement-note";

/** Shown instead of private group content to non-members. Reveals nothing about the content. */
export function MembersOnly({ groupId, what, canJoin }: { groupId: string; what: string; canJoin: boolean }) {
  return (
    <div className="rounded-2xl border border-dashed border-ink-200 bg-white px-6 py-12 text-center" data-testid="members-only">
      <p className="text-lg font-semibold text-ink-950">For group members only</p>
      <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-ink-600">
        Join this group to use the {what.toLowerCase()}. You can leave again at any time, and leaving does not affect your account.
      </p>
      {canJoin && (
        <form action={joinGroupAction} className="mx-auto mt-5 max-w-sm space-y-2">
          <input type="hidden" name="groupId" value={groupId} />
          <Button type="submit">Join group</Button>
          <GroupAgreementNote action="joining" />
        </form>
      )}
    </div>
  );
}
