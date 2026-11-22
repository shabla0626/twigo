"use client";

import { useActionState } from "react";
import { describedBy, Field, FormAlert, Input, Select, Textarea } from "@/components/forms/fields";
import { Button } from "@/components/ui/primitives";
import { INQUIRY_CATEGORIES } from "@/lib/labels";
import { submitInquiryAction, type ContactFormState } from "./actions";

/**
 * Contact form. Validation runs on the server (one set of rules), so the
 * browser does not download a validation library; errors appear per field.
 */
export function ContactForm({ formToken, business = false }: { formToken: string; business?: boolean }) {
  const [state, action, pending] = useActionState<ContactFormState | undefined, FormData>(submitInquiryAction, undefined);
  if (state?.ok) return <FormAlert tone="success">{state.ok}</FormAlert>;
  const errors = state?.fieldErrors ?? {};
  const values = state?.values ?? {};
  const err = (k: string) => errors[k]?.[0];
  const a = (k: string) => ({
    id: k,
    name: k,
    defaultValue: values[k],
    "aria-invalid": Boolean(err(k)) || undefined,
    "aria-describedby": describedBy(k, { error: Boolean(err(k)) }),
  });

  return (
    <form action={action} className="relative space-y-6" aria-busy={pending}>
      <div aria-live="polite">{state?.error && <FormAlert tone="error">{state.error}</FormAlert>}</div>
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="website">Leave this field empty</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
      </div>
      <input type="hidden" name="formToken" value={values.formToken || formToken} />
      <div className="grid gap-6 sm:grid-cols-2">
        <Field id="name" label="Name" error={err("name")}>
          <Input autoComplete="name" required maxLength={120} {...a("name")} />
        </Field>
        <Field id="email" label="Email" error={err("email")}>
          <Input type="email" autoComplete="email" required maxLength={200} {...a("email")} />
        </Field>
      </div>
      {business ? (
        <>
          <input type="hidden" name="category" value="BUSINESS" />
          <div className="grid gap-6 sm:grid-cols-2">
            <Field id="organization" label="Organization" optional error={err("organization")}>
              <Input autoComplete="organization" maxLength={160} {...a("organization")} />
            </Field>
            <Field id="timeline" label="Timeline" optional error={err("timeline")}>
              <Input placeholder="e.g. within 2 months" maxLength={160} {...a("timeline")} />
            </Field>
          </div>
        </>
      ) : (
        <Field id="category" label="Inquiry type" error={err("category")}>
          <Select {...a("category")} defaultValue={values.category || "PARTICIPANT"}>
            {Object.entries(INQUIRY_CATEGORIES).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Field id="subject" label={business ? "What do you need help with?" : "Subject"} error={err("subject")}>
        <Input required maxLength={160} {...a("subject")} />
      </Field>
      <Field id="message" label={business ? "Describe the need, the expected result and any constraints" : "Message"} error={err("message")}>
        <Textarea rows={6} required minLength={10} maxLength={4000} {...a("message")} />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send message"}
      </Button>
    </form>
  );
}
