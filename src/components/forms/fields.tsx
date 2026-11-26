import type { ComponentProps, ReactNode } from "react";
import { cn } from "../ui/primitives";

const control =
  "block w-full rounded-xl border-0 bg-white px-3.5 py-2.5 text-base text-ink-950 shadow-sm ring-1 ring-inset ring-ink-300 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-accent-600 aria-[invalid=true]:ring-red-600 sm:text-sm";

export function Field({
  id,
  label,
  hint,
  error,
  optional,
  icon,
  children,
  className,
}: {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-sm font-medium text-ink-900">
        {label}
        {optional && <span className="ml-1 font-normal text-ink-500">(optional)</span>}
      </label>
      {hint && (
        <p id={`${id}-hint`} className="mt-1 text-sm text-ink-500">
          {hint}
        </p>
      )}
      <div className={icon ? "relative mt-1.5 [&_input]:pl-11" : "mt-1.5"}>
        {icon && <span className="pointer-events-none absolute inset-y-0 left-0 flex w-11 items-center justify-center text-ink-400">{icon}</span>}
        {children}
      </div>
      <FieldError id={id} error={error} />
    </div>
  );
}

export function FieldError({ id, error }: { id: string; error?: string }) {
  if (!error) return null;
  return (
    <p id={`${id}-error`} className="mt-1.5 text-sm text-red-700" role="alert">
      {error}
    </p>
  );
}

export function describedBy(id: string, { hint, error }: { hint?: boolean; error?: boolean }) {
  return [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ") || undefined;
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(control, className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(control, "min-h-28", className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(control, "pr-8", className)} {...props} />;
}

export function CheckboxRow({
  id,
  label,
  description,
  ...props
}: ComponentProps<"input"> & { id: string; label: ReactNode; description?: ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="flex h-6 items-center">
        <input
          id={id}
          type="checkbox"
          className="h-4 w-4 rounded border-ink-300 text-accent-700 accent-accent-700 focus-visible:outline-2 focus-visible:outline-accent-600"
          {...props}
        />
      </div>
      <div className="text-sm leading-6">
        <label htmlFor={id} className="font-medium text-ink-900">
          {label}
        </label>
        {description && <p className="text-ink-500">{description}</p>}
      </div>
    </div>
  );
}

export function Fieldset({ legend, description, children }: { legend: string; description?: ReactNode; children: ReactNode }) {
  return (
    <div className="border-t border-ink-200 pt-8">
      <fieldset>
        <legend className="text-lg font-semibold text-ink-950">{legend}</legend>
        {description && <p className="mt-1 text-sm leading-6 text-ink-600">{description}</p>}
        <div className="mt-6 grid gap-6 sm:grid-cols-2">{children}</div>
      </fieldset>
    </div>
  );
}

export function FormAlert({ tone, children }: { tone: "error" | "success"; children: ReactNode }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "rounded-2xl border p-4 text-sm leading-6",
        tone === "error" ? "border-red-200 bg-red-50 text-red-900" : "border-emerald-200 bg-emerald-50 text-emerald-900",
      )}
    >
      {children}
    </div>
  );
}
