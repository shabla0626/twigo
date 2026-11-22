"use server";

import { redirect } from "next/navigation";
import type { FormState } from "@/components/forms/action-form";
import { requireVerifiedUser } from "@/lib/auth/guard";
import { rateLimit } from "@/lib/rate-limit";
import { saveApplicationStep, submitMyApplication, withdrawMyApplication } from "@/server/membership-application";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");

/** Saves one step of the draft and moves to the next. Name and email come from the account. */
export async function saveStepAction(_p: FormState, fd: FormData): Promise<FormState> {
  const user = await requireVerifiedUser("/apply");
  if (!rateLimit(`apply-save:${user.id}`, 120, 60 * 60_000).ok) return { error: "Too many changes in a short time. Please wait a few minutes." };
  const step = Number(str(fd, "step"));
  const raw: Record<string, unknown> =
    step === 1
      ? Object.fromEntries(["country", "region", "occupation", "education", "profileUrl", "experienceLevel", "relevantExperience"].map((k) => [k, str(fd, k)]))
      : step === 2
        ? {
            mainSkills: str(fd, "mainSkills"),
            secondarySkills: str(fd, "secondarySkills"),
            workCategories: fd.getAll("workCategories").map(String),
            desiredWork: str(fd, "desiredWork"),
            hoursPerWeek: str(fd, "hoursPerWeek"),
            schedule: str(fd, "schedule"),
            willingToLearn: fd.get("willingToLearn") === "on",
          }
        : { motivation: str(fd, "motivation"), contribution: str(fd, "contribution"), additionalComments: str(fd, "additionalComments") };
  const res = await saveApplicationStep(user.id, step, raw);
  if (!res.ok) {
    if (res.redirectTo) redirect(res.redirectTo);
    return { error: res.error, fieldErrors: res.fieldErrors };
  }
  redirect(`/apply?step=${step + 1}`);
}

export async function submitApplicationAction(_p: FormState, fd: FormData): Promise<FormState> {
  const user = await requireVerifiedUser("/apply");
  const res = await submitMyApplication(user.id, { confirm: fd.get("confirm") === "on" });
  if (!res.ok) return { error: res.error };
  redirect(res.alreadySubmitted ? "/application" : "/application?submitted=1");
}

export async function withdrawApplicationAction(fd: FormData) {
  const user = await requireVerifiedUser("/application");
  if (fd.get("confirm") !== "on") redirect("/application?error=Tick+the+box+to+confirm+that+you+want+to+withdraw+your+application.");
  const res = await withdrawMyApplication(user.id);
  redirect(res.ok ? "/application?withdrawn=1" : `/application?error=${encodeURIComponent(res.error ?? "Could not withdraw.")}`);
}
