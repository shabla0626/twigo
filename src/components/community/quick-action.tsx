"use client";

import { useActionState, useId, useState } from "react";
import type { FormAction, FormState } from "../forms/action-form";
import { Button } from "../ui/primitives";

type Variant = "primary" | "secondary" | "danger" | "soft" | "ghost";

/**
 * A small one-click button (delete, mark done, end meeting, make coordinator…).
 *
 * - If the action is refused, the reason is shown right under the button. Nothing fails silently.
 * - With `confirm`, the person is asked first, because the action cannot be undone by them.
 */
export function QuickAction({
  action,
  fields,
  label,
  pendingLabel = "Working…",
  variant = "ghost",
  size = "sm",
  buttonClassName,
  ariaLabel,
  confirm,
}: {
  action: FormAction;
  /** Hidden values sent with the action (ids). */
  fields: Record<string, string>;
  label: string;
  pendingLabel?: string;
  variant?: Variant;
  size?: "sm" | "md" | "lg";
  /** Use a plain text-style button instead of the standard one. */
  buttonClassName?: string;
  /** A fuller name for screen readers when the visible label is short ("Delete"). */
  ariaLabel?: string;
  confirm?: { question: string; detail?: string; yes: string; danger?: boolean };
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, undefined);
  const [confirming, setConfirming] = useState(false);
  const id = useId();
  const hidden = Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />);
  const error = state?.error ? (
    <p role="alert" className="mt-1.5 max-w-xs text-sm leading-5 text-red-700">
      {state.error}
    </p>
  ) : null;

  if (confirm && confirming) {
    return (
      <div role="alertdialog" aria-labelledby={`${id}-q`} aria-describedby={confirm.detail ? `${id}-d` : undefined} className="w-full rounded-xl border border-ink-200 bg-white p-4 text-left text-sm sm:w-80">
        <p id={`${id}-q`} className="font-medium text-ink-950">
          {confirm.question}
        </p>
        {confirm.detail && (
          <p id={`${id}-d`} className="mt-1 leading-6 text-ink-600">
            {confirm.detail}
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <form action={formAction}>
            {hidden}
            <Button type="submit" variant={confirm.danger ? "danger" : "primary"} size="sm" disabled={pending}>
              {pending ? pendingLabel : confirm.yes}
            </Button>
          </form>
          <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)} autoFocus>
            Cancel
          </Button>
        </div>
        {error}
      </div>
    );
  }

  if (confirm) {
    return (
      <div>
        {buttonClassName ? (
          <button type="button" className={buttonClassName} aria-label={ariaLabel} onClick={() => setConfirming(true)}>
            {label}
          </button>
        ) : (
          <Button type="button" variant={variant} size={size} aria-label={ariaLabel} onClick={() => setConfirming(true)}>
            {label}
          </Button>
        )}
        {error}
      </div>
    );
  }

  return (
    <form action={formAction}>
      {hidden}
      {buttonClassName ? (
        <button type="submit" className={buttonClassName} aria-label={ariaLabel} disabled={pending}>
          {pending ? pendingLabel : label}
        </button>
      ) : (
        <Button type="submit" variant={variant} size={size} aria-label={ariaLabel} disabled={pending}>
          {pending ? pendingLabel : label}
        </Button>
      )}
      {error}
    </form>
  );
}
