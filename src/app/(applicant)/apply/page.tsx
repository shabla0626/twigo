import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { brand } from "@/config/brand";
import { ActionForm } from "@/components/forms/action-form";
import { CheckboxRow, Field, FormAlert, Input, Select, Textarea } from "@/components/forms/fields";
import { buttonClass } from "@/components/ui/primitives";
import { getSession } from "@/lib/auth/guard";
import { EXPERIENCE_LEVELS, HOURS_OPTIONS, WORK_CATEGORIES } from "@/lib/labels";
import { displayedVersion } from "@/server/legal";
import { getMyApplication, missingAnswers } from "@/server/membership-application";
import { saveStepAction, submitApplicationAction } from "../actions";

export const metadata: Metadata = { title: "Membership application" };

type Props = { searchParams: Promise<Record<string, string | undefined>> };

const STEPS = ["About you", "Skills and time", "Why you want to join", "Review and send"];

export default async function ApplyPage({ searchParams }: Props) {
  const sp = await searchParams;
  const s = await getSession();
  if (!s || s.user.status !== "ACTIVE") redirect("/join");
  const user = s.user;
  if (!user.emailVerified) redirect("/verify-email");
  // Approved members (also when access is paused or removed) have nothing to apply for.
  if (user.membership !== "NONE") redirect("/application");

  const latest = await getMyApplication(user.id);
  // Submitted, decided or approved: the status page explains what happens next.
  if (latest && !["DRAFT", "DECLINED", "WITHDRAWN"].includes(latest.status)) redirect("/application");
  const draft = latest?.status === "DRAFT" ? latest : null;
  // After a decline or withdrawal, earlier answers are offered again as a starting point.
  const prior = draft ?? latest;
  const complete = draft ? missingAnswers(draft).length === 0 : false;
  const maxStep = draft ? (complete ? 4 : draft.draftStep) : 1;
  const requested = Number(sp.step) || maxStep;
  const step = Math.min(Math.max(1, requested), maxStep);
  const privacy = step === 4 ? await displayedVersion("privacy") : null;

  const a = prior?.applicant;
  const primary = a?.skills.filter((x) => x.kind === "PRIMARY").map((x) => x.skill.label).join(", ") ?? "";
  const secondary = a?.skills.filter((x) => x.kind === "SECONDARY").map((x) => x.skill.label).join(", ") ?? "";
  const cats = new Set(prior?.workPreferences.map((w) => w.category));

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-ink-950 sm:text-3xl">Membership application</h1>
        <p className="mt-1 text-[15px] leading-6 text-ink-600">
          Tell us a little about yourself. It takes about 5 minutes. You don’t need a resume or special qualifications, and applying is free.
        </p>
      </div>
      {sp.verified && step === 1 && (
        <div className="mb-5">
          <FormAlert tone="success">Your email address is confirmed. One more step: your application.</FormAlert>
        </div>
      )}

      <ol className="mb-6 grid grid-cols-4 gap-2" aria-label="Application steps">
        {STEPS.map((title, i) => {
          const n = i + 1;
          const state = n === step ? "current" : n <= maxStep ? "done" : "todo";
          const inner = (
            <>
              <span className={`block h-1.5 rounded-full ${state === "todo" ? "bg-ink-200" : "bg-accent-600"}`} />
              <span className={`mt-2 block text-xs font-medium sm:text-sm ${state === "current" ? "text-accent-900" : "text-ink-600"}`}>
                <span className="sm:hidden">{n}</span>
                <span className="hidden sm:inline">
                  {n}. {title}
                </span>
              </span>
            </>
          );
          return (
            <li key={title} aria-current={state === "current" ? "step" : undefined}>
              {state === "done" ? (
                <Link href={`/apply?step=${n}`} className="block rounded-md hover:opacity-80" aria-label={`Go back to step ${n}: ${title}`}>
                  {inner}
                </Link>
              ) : (
                inner
              )}
            </li>
          );
        })}
      </ol>

      <section className="rounded-2xl border border-ink-100 bg-white p-5 sm:p-8" aria-labelledby="step-h">
        <h2 id="step-h" className="text-lg font-semibold text-ink-950">
          Step {step} of 4: {STEPS[step - 1]}
        </h2>

        {step === 1 && (
          <ActionForm action={saveStepAction} submitLabel="Save and continue" pendingLabel="Saving…" className="mt-5 space-y-5">
            <input type="hidden" name="step" value="1" />
            <p className="rounded-xl bg-ink-50 p-3 text-sm text-ink-700">
              Applying as <strong>{user.name}</strong> ({user.email}). Your name and email come from your account.
            </p>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field id="country" label="Country">
                <Input id="country" name="country" autoComplete="country-name" required maxLength={80} defaultValue={a?.country ?? ""} />
              </Field>
              <Field id="region" label="State or region" optional>
                <Input id="region" name="region" autoComplete="address-level1" maxLength={80} defaultValue={a?.region ?? ""} />
              </Field>
            </div>
            <Field id="occupation" label="What do you do now?" hint="Your current occupation or background. For example: store employee, student, retired teacher, stay-at-home parent.">
              <Input id="occupation" name="occupation" required maxLength={160} defaultValue={a?.occupation ?? ""} aria-describedby="occupation-hint" />
            </Field>
            <details className="rounded-xl border border-ink-100 p-4" open={Boolean(prior?.experienceLevel || prior?.relevantExperience || a?.education || a?.profileUrl)}>
              <summary className="cursor-pointer text-sm font-semibold text-ink-900">Add more about your background (optional)</summary>
              <div className="mt-4 space-y-5">
                <Field id="experienceLevel" label="Work experience" optional>
                  <Select id="experienceLevel" name="experienceLevel" defaultValue={prior?.experienceLevel ?? ""}>
                    <option value="">Prefer not to say</option>
                    {Object.entries(EXPERIENCE_LEVELS).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field id="relevantExperience" label="Experience you would like to mention" optional>
                  <Textarea id="relevantExperience" name="relevantExperience" maxLength={2000} rows={3} defaultValue={prior?.relevantExperience ?? ""} />
                </Field>
                <Field id="education" label="Education" optional>
                  <Input id="education" name="education" maxLength={160} defaultValue={a?.education ?? ""} />
                </Field>
                <Field id="profileUrl" label="LinkedIn, portfolio or online resume link" optional hint="A full link starting with https://">
                  <Input id="profileUrl" name="profileUrl" type="url" maxLength={300} placeholder="https://" defaultValue={a?.profileUrl ?? ""} aria-describedby="profileUrl-hint" />
                </Field>
              </div>
            </details>
          </ActionForm>
        )}

        {step === 2 && (
          <ActionForm action={saveStepAction} submitLabel="Save and continue" pendingLabel="Saving…" className="mt-5 space-y-5">
            <input type="hidden" name="step" value="2" />
            <Field id="mainSkills" label="Your skills and abilities" hint="Separate them with commas. Everyday skills count: organizing, writing, customer service, spreadsheets, speaking Spanish…">
              <Textarea id="mainSkills" name="mainSkills" required maxLength={500} rows={2} defaultValue={primary} aria-describedby="mainSkills-hint" />
            </Field>
            <fieldset>
              <legend className="text-sm font-medium text-ink-900">What kinds of work interest you?</legend>
              <p className="mt-1 text-sm text-ink-500">Choose one or more.</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {Object.entries(WORK_CATEGORIES).map(([v, l]) => (
                  <CheckboxRow key={v} id={`wc-${v}`} name="workCategories" value={v} label={l} defaultChecked={cats.has(v as keyof typeof WORK_CATEGORIES)} />
                ))}
              </div>
            </fieldset>
            <Field id="hoursPerWeek" label="About how many hours a week could you give?" hint="A rough estimate is fine. You can change it later.">
              <Select id="hoursPerWeek" name="hoursPerWeek" required defaultValue={prior?.availability?.hoursPerWeek ?? ""} aria-describedby="hoursPerWeek-hint">
                <option value="" disabled>
                  Choose
                </option>
                {HOURS_OPTIONS.map((h) => (
                  <option key={h} value={h}>
                    About {h} hours
                  </option>
                ))}
              </Select>
            </Field>
            <CheckboxRow id="willingToLearn" name="willingToLearn" label="I am willing to learn new skills" defaultChecked={prior?.willingToLearn ?? true} />
            <details className="rounded-xl border border-ink-100 p-4" open={Boolean(prior?.availability?.schedule || prior?.desiredWork || secondary)}>
              <summary className="cursor-pointer text-sm font-semibold text-ink-900">Add more details (optional)</summary>
              <div className="mt-4 space-y-5">
                <Field id="schedule" label="When are you usually available?" optional>
                  <Input id="schedule" name="schedule" maxLength={200} placeholder="For example: weekday evenings, weekends" defaultValue={prior?.availability?.schedule ?? ""} />
                </Field>
                <Field id="desiredWork" label="Work you would especially like to do" optional>
                  <Textarea id="desiredWork" name="desiredWork" maxLength={1000} rows={2} defaultValue={prior?.desiredWork ?? ""} />
                </Field>
                <Field id="secondarySkills" label="Other skills" optional>
                  <Input id="secondarySkills" name="secondarySkills" maxLength={500} defaultValue={secondary} />
                </Field>
              </div>
            </details>
          </ActionForm>
        )}

        {step === 3 && (
          <ActionForm action={saveStepAction} submitLabel="Save and review" pendingLabel="Saving…" className="mt-5 space-y-5">
            <input type="hidden" name="step" value="3" />
            <Field id="motivation" label={`Why do you want to take part in ${brand().name}?`} hint="A few sentences in your own words.">
              <Textarea id="motivation" name="motivation" required minLength={20} maxLength={2000} rows={4} defaultValue={prior?.motivation ?? ""} aria-describedby="motivation-hint" />
            </Field>
            <Field id="contribution" label="What do you think you can contribute?" hint="Skills, time, ideas, reliability: anything you would bring to a team.">
              <Textarea id="contribution" name="contribution" required minLength={20} maxLength={2000} rows={4} defaultValue={prior?.contribution ?? ""} aria-describedby="contribution-hint" />
            </Field>
            <Field id="additionalComments" label="Anything else you would like us to know?" optional>
              <Textarea id="additionalComments" name="additionalComments" maxLength={2000} rows={3} defaultValue={prior?.additionalComments ?? ""} />
            </Field>
          </ActionForm>
        )}

        {step === 4 && draft && (
          <div className="mt-5 space-y-5">
            <dl className="divide-y divide-ink-100 rounded-xl border border-ink-100 text-sm">
              {[
                ["Name and email", `${user.name} · ${user.email}`, 0],
                ["Location", [draft.applicant.region, draft.applicant.country].filter(Boolean).join(", "), 1],
                ["What you do now", draft.applicant.occupation, 1],
                ["Skills", primary, 2],
                ["Work that interests you", draft.workPreferences.map((w) => WORK_CATEGORIES[w.category]).join(", "), 2],
                ["Time", draft.availability ? `About ${draft.availability.hoursPerWeek} hours a week` : "", 2],
                ["Why you want to take part", draft.motivation, 3],
                ["What you can contribute", draft.contribution, 3],
              ].map(([label, value, editStep]) => (
                <div key={label as string} className="grid gap-1 px-4 py-3 sm:grid-cols-[11rem_1fr_auto] sm:gap-4">
                  <dt className="font-medium text-ink-600">{label}</dt>
                  <dd className="whitespace-pre-wrap break-words text-ink-900">{value || "—"}</dd>
                  <dd>
                    {editStep ? (
                      <Link href={`/apply?step=${editStep}`} className="text-accent-700 hover:underline">
                        Edit
                      </Link>
                    ) : null}
                  </dd>
                </div>
              ))}
            </dl>
            <ActionForm action={submitApplicationAction} submitLabel="Submit application" pendingLabel="Sending…" className="space-y-4">
              <label className="flex items-start gap-3 text-sm leading-6 text-ink-800">
                <input type="checkbox" name="confirm" required className="mt-1 h-4 w-4 rounded border-ink-300" />
                <span>
                  This information is accurate. I understand that applying is free, that it does not guarantee acceptance, project work or income, and that I
                  will never be asked to pay.
                </span>
              </label>
              {privacy && (
                <p className="text-xs leading-5 text-ink-500">
                  Your application is handled as described in the{" "}
                  <Link href="/legal/privacy" target="_blank" className="font-medium text-accent-700 underline">
                    Privacy Policy
                  </Link>{" "}
                  (version {privacy.version.version}
                  {privacy.version.status === "PUBLISHED" ? "" : ", a draft awaiting legal review"}). The version is recorded with your application.
                </p>
              )}
            </ActionForm>
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 pt-4 text-sm text-ink-600">
          {step > 1 ? (
            <Link href={`/apply?step=${step - 1}`} className={buttonClass("ghost", "sm")}>
              ← Back
            </Link>
          ) : (
            <span />
          )}
          <span>Your answers are saved each time you continue. You can sign out and finish later.</span>
        </div>
      </section>
    </>
  );
}
