import { addCommentAction, deleteCommentAction, editCommentAction } from "@/app/community/actions";
import type { CommentNode } from "@/server/community/comments";
import { ActionForm } from "../forms/action-form";
import { cn } from "../ui/primitives";
import { QuickAction } from "./quick-action";
import { ReportButton } from "./report-button";
import { MemberAvatar, TextBody, Time } from "./ui";

type Target = { ideaId?: string; discussionId?: string; path: string };

function Hidden({ target }: { target: Target }) {
  return (
    <>
      {target.ideaId && <input type="hidden" name="ideaId" value={target.ideaId} />}
      {target.discussionId && <input type="hidden" name="discussionId" value={target.discussionId} />}
      <input type="hidden" name="path" value={target.path} />
    </>
  );
}

const box = "block w-full rounded-xl border-0 px-3 py-2 text-sm ring-1 ring-inset ring-ink-300 focus:ring-2 focus:ring-accent-600";

export function CommentComposer({ target, parentId, placeholder = "Ask a question, suggest an improvement or share a concern", canPost = true }: { target: Target; parentId?: string; placeholder?: string; canPost?: boolean }) {
  if (!canPost) return null;
  const id = `body-${parentId ?? "root"}`;
  return (
    <ActionForm action={addCommentAction} submitLabel={parentId ? "Reply" : "Post comment"} pendingLabel="Posting…" resetOnSuccess className="space-y-2">
      <Hidden target={target} />
      {parentId && <input type="hidden" name="parentId" value={parentId} />}
      <label htmlFor={id} className="sr-only">
        {parentId ? "Your reply" : "Your comment"}
      </label>
      <textarea id={id} name="body" required maxLength={5000} rows={parentId ? 2 : 3} placeholder={placeholder} className={box} />
    </ActionForm>
  );
}

function Comment({ c, viewerId, target, canPost }: { c: CommentNode; viewerId: string; target: Target; canPost: boolean }) {
  const mine = c.author?.id === viewerId;
  return (
    <li id={`comment-${c.id}`} className={cn("scroll-mt-24", c.depth > 0 && "border-l-2 border-ink-100 pl-4")}>
      <div className="flex gap-3">
        {c.author ? <MemberAvatar name={c.author.displayName} size={32} /> : <span className="h-8 w-8 shrink-0 rounded-full bg-ink-100" />}
        <div className="min-w-0 flex-1">
          <p className="text-sm">
            <span className="font-semibold text-ink-950">{c.author?.displayName ?? (c.state === "visible" ? "Former member" : "")}</span>{" "}
            <span className="text-ink-500">
              <Time date={c.createdAt} />
              {c.editedAt && " · edited"}
            </span>
          </p>
          {c.state === "visible" ? (
            <TextBody text={c.body} className="mt-1 text-sm leading-6" />
          ) : (
            <p className="mt-1 text-sm italic text-ink-500">{c.state === "deleted" ? "This comment was deleted by its author." : "This comment was removed by a moderator."}</p>
          )}
          {c.state === "visible" && (
            <div className="mt-1 flex flex-wrap items-center gap-1 text-sm">
              {canPost && (
                <details className="w-full sm:w-auto">
                  <summary className="cursor-pointer list-none rounded-full px-2 py-1 text-ink-600 hover:bg-ink-50">Reply</summary>
                  <div className="mt-2 sm:w-[32rem]">
                    <CommentComposer target={target} parentId={c.id} placeholder={`Reply to ${c.author?.displayName ?? "this comment"}`} />
                  </div>
                </details>
              )}
              {mine && (
                <>
                  <details className="w-full sm:w-auto">
                    <summary className="cursor-pointer list-none rounded-full px-2 py-1 text-ink-600 hover:bg-ink-50">Edit</summary>
                    <div className="mt-2 sm:w-[32rem]">
                      <ActionForm action={editCommentAction} submitLabel="Save" className="space-y-2">
                        <input type="hidden" name="id" value={c.id} />
                        <input type="hidden" name="path" value={target.path} />
                        <label htmlFor={`edit-${c.id}`} className="sr-only">
                          Edit comment
                        </label>
                        <textarea id={`edit-${c.id}`} name="body" defaultValue={c.body} required maxLength={5000} rows={3} className={box} />
                      </ActionForm>
                    </div>
                  </details>
                  <QuickAction action={deleteCommentAction} fields={{ id: c.id, path: target.path }} label="Delete" buttonClassName="rounded-full px-2 py-1 text-ink-600 hover:bg-ink-50" />
                </>
              )}
              {!mine && <ReportButton targetType="COMMENT" targetId={c.id} />}
            </div>
          )}
          {c.replies.length > 0 && (
            <ul className="mt-3 space-y-4">
              {c.replies.map((r) => (
                <Comment key={r.id} c={r} viewerId={viewerId} target={target} canPost={canPost} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </li>
  );
}

export function CommentThread({ comments, viewerId, target, canPost = true }: { comments: CommentNode[]; viewerId: string; target: Target; canPost?: boolean }) {
  return (
    <div className="space-y-6">
      <CommentComposer target={target} canPost={canPost} />
      {comments.length ? (
        <ul className="space-y-5">
          {comments.map((c) => (
            <Comment key={c.id} c={c} viewerId={viewerId} target={target} canPost={canPost} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-600">No comments yet. Questions and constructive disagreement are welcome.</p>
      )}
    </div>
  );
}
