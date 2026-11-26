"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { IconArrow } from "../ui/icons";
import { Button, cn } from "../ui/primitives";
import { FormAlert } from "./fields";

export type FormState = { error?: string; ok?: string; fieldErrors?: Record<string, string[] | undefined> } | undefined;
export type FormAction = (prev: FormState, fd: FormData) => Promise<FormState>;

/**
 * Progressive-enhancement form for server actions that return FormState.
 * Shows the result inline and announces it to screen readers.
 */
export function ActionForm({
  action,
  children,
  submitLabel,
  pendingLabel = "Saving…",
  className,
  resetOnSuccess = false,
  variant = "primary",
  fullWidth = false,
  submitClassName,
  withArrow = false,
}: {
  action: FormAction;
  children?: ReactNode;
  submitLabel: string;
  pendingLabel?: string;
  className?: string;
  resetOnSuccess?: boolean;
  variant?: "primary" | "secondary" | "danger" | "soft" | "ghost";
  fullWidth?: boolean;
  submitClassName?: string;
  withArrow?: boolean;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (resetOnSuccess && state?.ok) ref.current?.reset();
  }, [state, resetOnSuccess]);
  const firstFieldError = state?.fieldErrors ? Object.values(state.fieldErrors).flat().find(Boolean) : undefined;
  return (
    <form ref={ref} action={formAction} className={cn("space-y-4", className)} noValidate={false}>
      <div aria-live="polite">
        {(state?.error || firstFieldError) && <FormAlert tone="error">{state?.error ?? firstFieldError}</FormAlert>}
        {state?.ok && <FormAlert tone="success">{state.ok}</FormAlert>}
      </div>
      {children}
      <Button type="submit" variant={variant} disabled={pending} className={cn(fullWidth && "w-full", submitClassName)}>
        {pending ? pendingLabel : submitLabel}
        {!pending && withArrow && <IconArrow className="h-4 w-4" />}
      </Button>
    </form>
  );
}
