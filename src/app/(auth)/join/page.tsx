import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { brand } from "@/config/brand";
import { ActionForm } from "@/components/forms/action-form";
import { Field, Input } from "@/components/forms/fields";
import { PasswordInput } from "@/components/forms/password-input";
import { getSession } from "@/lib/auth/guard";
import { registrationDocuments } from "@/server/legal";
import { registerAction } from "../actions";

const listOf = (items: string[]) => (items.length < 2 ? items.join("") : `The ${items.slice(0, -1).join(", the ")} and the ${items[items.length - 1]}`);

export function generateMetadata(): Metadata {
  return { title: `Join ${brand().name}` };
}

export default async function JoinPage() {
  if (await getSession()) redirect("/continue");
  const name = brand().name;
  const docs = await registrationDocuments();
  const v = (key: string) => [...docs.accept, ...docs.ack].find((d) => d.key === key);
  const terms = v("terms");
  const guidelines = v("community-guidelines");
  const privacy = v("privacy");
  // Any of the three texts that is not published is still a draft awaiting legal review: say so, by name.
  const drafts = [terms, guidelines, privacy].filter((d): d is NonNullable<typeof d> => !!d && d.status !== "PUBLISHED").map((d) => d.title);
  return (
    <>
      <h1 className="text-2xl font-semibold text-ink-950">Join {name}</h1>
      <p className="mt-2 text-[15px] leading-6 text-ink-600">Create your free account and apply to become part of an online collaborative community.</p>
      <ol className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium text-ink-500" aria-label="Steps">
        <li className="text-accent-800">1. Create account</li>
        <li>2. Confirm email</li>
        <li>3. Apply</li>
      </ol>
      <ActionForm action={registerAction} submitLabel="Create Account" pendingLabel="Creating your account…" fullWidth className="mt-6">
        <Field id="fullName" label="Full name">
          <Input id="fullName" name="fullName" autoComplete="name" required minLength={2} maxLength={120} />
        </Field>
        <Field id="email" label="Email address">
          <Input id="email" name="email" type="email" autoComplete="email" required maxLength={254} />
        </Field>
        <Field id="password" label="Password" hint="At least 12 characters, with letters and numbers.">
          <PasswordInput id="password" name="password" autoComplete="new-password" required minLength={12} maxLength={128} aria-describedby="password-hint" />
        </Field>
        <Field id="confirm" label="Confirm password">
          <PasswordInput id="confirm" name="confirm" autoComplete="new-password" required minLength={12} maxLength={128} />
        </Field>
        {/* Hidden from people; filled only by automated spam programs. */}
        <div className="hidden" aria-hidden="true">
          <label htmlFor="website">Website</label>
          <input id="website" name="website" tabIndex={-1} autoComplete="off" />
        </div>
        {/* The exact versions shown here are recorded with your acceptance. */}
        {[...docs.accept, ...docs.ack].map((d) => (
          <input key={d.versionId} type="hidden" name="legalVersion" value={d.versionId} />
        ))}
        <fieldset className="space-y-3 rounded-xl border border-ink-100 p-4">
          <legend className="px-1 text-sm font-medium text-ink-900">Before you create your account</legend>
          <label className="flex items-start gap-3 text-sm leading-6 text-ink-700">
            <input type="checkbox" name="acceptTerms" required className="mt-1 h-4 w-4 rounded border-ink-300 text-accent-700" />
            <span>
              I accept the{" "}
              <Link href="/legal/terms" target="_blank" className="font-medium text-accent-700 underline">
                Terms of Use
              </Link>
              {terms ? ` (version ${terms.version})` : ""}.
            </span>
          </label>
          <label className="flex items-start gap-3 text-sm leading-6 text-ink-700">
            <input type="checkbox" name="acceptGuidelines" required className="mt-1 h-4 w-4 rounded border-ink-300 text-accent-700" />
            <span>
              I accept the{" "}
              <Link href="/legal/community-guidelines" target="_blank" className="font-medium text-accent-700 underline">
                Community Guidelines
              </Link>
              {guidelines ? ` (version ${guidelines.version})` : ""}.
            </span>
          </label>
          <label className="flex items-start gap-3 text-sm leading-6 text-ink-700">
            <input type="checkbox" name="ackPrivacy" required className="mt-1 h-4 w-4 rounded border-ink-300 text-accent-700" />
            <span>
              I have read the{" "}
              <Link href="/legal/privacy" target="_blank" className="font-medium text-accent-700 underline">
                Privacy Policy
              </Link>
              {privacy ? ` (version ${privacy.version})` : ""}. This confirms you received it; it is not a consent.
            </span>
          </label>
          {drafts.length > 0 && (
            <p className="text-xs leading-5 text-ink-500">
              {drafts.length === 1 ? `The ${drafts[0]} is a draft` : `${listOf(drafts)} are drafts`} awaiting legal review. If a reviewed version changes {drafts.length === 1 ? "it" : "them"}{" "}
              materially, you will be asked to accept it again.
            </p>
          )}
        </fieldset>
      </ActionForm>
      <p className="mt-3 text-center text-xs text-ink-500">Free. No fees, payments or bank details, ever.</p>
      <p className="mt-6 text-center text-sm text-ink-700">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-accent-700 underline-offset-2 hover:underline">
          Sign In
        </Link>
      </p>
    </>
  );
}
