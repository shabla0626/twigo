import type { ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { brand } from "@/config/brand";
import { ActionForm } from "@/components/forms/action-form";
import { Field, Input } from "@/components/forms/fields";
import { PasswordInput } from "@/components/forms/password-input";
import { IconDoc, IconLock, IconMail, IconShield, IconUser } from "@/components/ui/icons";
import { getSession } from "@/lib/auth/guard";
import { registrationDocuments } from "@/server/legal";
import { registerAction } from "../actions";

const listOf = (items: string[]) => (items.length < 2 ? items.join("") : `The ${items.slice(0, -1).join(", the ")} and the ${items[items.length - 1]}`);
const STEPS = ["Create account", "Confirm email", "Apply"];

function ConsentBox({ name, children }: { name: string; children: ReactNode }) {
  return (
    <label className="flex items-start gap-3 text-sm leading-6 text-ink-700">
      <span className="relative mt-0.5 h-5 w-5 shrink-0">
        <input
          type="checkbox"
          name={name}
          required
          className="peer h-5 w-5 appearance-none rounded-md border border-ink-300 bg-white checked:border-accent-700 checked:bg-accent-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600"
        />
        <svg viewBox="0 0 24 24" aria-hidden="true" className="pointer-events-none absolute inset-0 hidden h-5 w-5 text-white peer-checked:block">
          <path d="M6 12.5l4 4L18 8" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span>{children}</span>
    </label>
  );
}

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
      <p className="text-sm font-medium text-accent-800">Join the community</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink-950">Create your account</h1>
      <p className="mt-2 text-[15px] leading-6 text-ink-600">It is free. After you confirm your email, you apply to become a member of {name}.</p>
      <ol className="mt-6 grid grid-cols-3 gap-3" aria-label="Steps">
        {STEPS.map((label, i) => (
          <li key={label}>
            <span className={i === 0 ? "block h-0.5 rounded-full bg-accent-700" : "block h-0.5 rounded-full bg-ink-200"} />
            <span className="mt-2 flex items-center gap-2">
              <span
                aria-hidden="true"
                className={
                  i === 0
                    ? "flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-700 text-[11px] font-semibold text-white"
                    : "flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink-100 text-[11px] font-semibold text-ink-500"
                }
              >
                {i + 1}
              </span>
              <span className={i === 0 ? "text-xs font-medium text-ink-950" : "text-xs font-medium text-ink-500"}>{label}</span>
            </span>
          </li>
        ))}
      </ol>
      <ActionForm action={registerAction} submitLabel="Create Account" pendingLabel="Creating your account…" fullWidth withArrow className="mt-6">
        <Field id="fullName" label="Full name" icon={<IconUser className="h-4 w-4" />}>
          <Input id="fullName" name="fullName" autoComplete="name" required minLength={2} maxLength={120} />
        </Field>
        <Field id="email" label="Email address" icon={<IconMail className="h-4 w-4" />}>
          <Input id="email" name="email" type="email" autoComplete="email" required maxLength={254} />
        </Field>
        <Field id="password" label="Password" hint="At least 12 characters, with letters and numbers." icon={<IconLock className="h-4 w-4" />}>
          <PasswordInput id="password" name="password" autoComplete="new-password" required minLength={12} maxLength={128} aria-describedby="password-hint" />
        </Field>
        <Field id="confirm" label="Confirm password" icon={<IconLock className="h-4 w-4" />}>
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
        <fieldset className="space-y-3 rounded-2xl bg-ink-50 px-4 py-4">
          <legend className="px-1 text-sm font-medium text-ink-900">Before you create your account</legend>
          <ConsentBox name="acceptTerms">
            <IconDoc className="mr-1 inline h-4 w-4 align-text-bottom text-ink-400" />
            I accept the{" "}
            <Link href="/legal/terms" target="_blank" className="font-medium text-accent-800 underline">
              Terms of Use
            </Link>
            {terms ? ` (version ${terms.version})` : ""}.
          </ConsentBox>
          <ConsentBox name="acceptGuidelines">
            <IconShield className="mr-1 inline h-4 w-4 align-text-bottom text-ink-400" />
            I accept the{" "}
            <Link href="/legal/community-guidelines" target="_blank" className="font-medium text-accent-800 underline">
              Community Guidelines
            </Link>
            {guidelines ? ` (version ${guidelines.version})` : ""}.
          </ConsentBox>
          <ConsentBox name="ackPrivacy">
            <IconLock className="mr-1 inline h-4 w-4 align-text-bottom text-ink-400" />
            I have read the{" "}
            <Link href="/legal/privacy" target="_blank" className="font-medium text-accent-800 underline">
              Privacy Policy
            </Link>
            {privacy ? ` (version ${privacy.version})` : ""}. This confirms you received it; it is not a consent.
          </ConsentBox>
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
