"use client";

import { useActionState } from "react";
import type { FormAction, FormState } from "../forms/action-form";
import { FormAlert, Input } from "../forms/fields";
import { Button } from "../ui/primitives";
import { IconVideo } from "./icons";

/**
 * Three plain steps: create a Google Meet link, paste it, then start a video
 * or voice meeting. The group is notified and joins from the Meetings tab.
 */
export function StartMeetingForm({ groupId, action }: { groupId: string; action: FormAction }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, undefined);
  const error = state?.error ?? (state?.fieldErrors ? Object.values(state.fieldErrors).flat().find(Boolean) : undefined);
  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="groupId" value={groupId} />
      <div aria-live="polite">{error && <FormAlert tone="error">{error}</FormAlert>}</div>
      <ol className="space-y-5">
        <li className="flex gap-3">
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-100 text-sm font-bold text-accent-800">1</span>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-ink-950">Create a Google Meet link</p>
            <a
              href="https://meet.google.com/new"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-ink-900 ring-1 ring-inset ring-ink-200 hover:bg-accent-50"
            >
              Open Google Meet ↗
            </a>
            <p className="mt-1 text-sm text-ink-600">It opens in a new tab. Copy the meeting link from there.</p>
          </div>
        </li>
        <li className="flex gap-3">
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-100 text-sm font-bold text-accent-800">2</span>
          <div className="min-w-0 flex-1">
            <label htmlFor="joinUrl" className="font-medium text-ink-950">
              Paste the Google Meet link
            </label>
            <Input id="joinUrl" name="joinUrl" type="url" required placeholder="https://meet.google.com/abc-defg-hij" className="mt-2" />
            <details className="mt-2">
              <summary className="cursor-pointer text-sm text-ink-600">Add a topic (optional)</summary>
              <label htmlFor="title" className="sr-only">
                Topic
              </label>
              <Input id="title" name="title" maxLength={120} placeholder="Example: Plan the customer interviews" className="mt-2" />
            </details>
          </div>
        </li>
        <li className="flex gap-3">
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-100 text-sm font-bold text-accent-800">3</span>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-ink-950">Start the meeting</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button type="submit" disabled={pending}>
                <IconVideo className="h-5 w-5" /> Start Meeting
              </Button>
            </div>
            <p className="mt-2 text-sm text-ink-600">
              Everyone in the group is notified and can join from this page. The call itself happens in Google Meet; there, each person chooses whether to
              use the camera or voice only.
            </p>
          </div>
        </li>
      </ol>
    </form>
  );
}
