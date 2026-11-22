import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ApplicationStatus } from "@prisma/client";
import { brand } from "@/config/brand";
import { FormAlert } from "@/components/forms/fields";
import { Badge, Button, buttonClass } from "@/components/ui/primitives";
import { getSession } from "@/lib/auth/guard";
import { applicationView } from "@/lib/application-view";
import { getMyApplication } from "@/server/membership-application";
import { withdrawApplicationAction } from "../actions";

export const metadata: Metadata = { title: "Your application" };

type Props = { searchParams: Promise<Record<string, string | undefined>> };

const fmt = (d: Date | null | undefined) => (d ? d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "—");

const TONE: Record<ApplicationStatus, "neutral" | "accent" | "warn" | "success" | "danger"> = {
  DRAFT: "neutral",
  SUBMITTED: "accent",
  UNDER_REVIEW: "accent",
  INTERVIEW_REQUESTED: "warn",
  WAITLISTED: "neutral",
  ACCEPTED: "success",
  DECLINED: "neutral",
  WITHDRAWN: "neutral",
};

export default async function ApplicationStatusPage({ searchParams }: Props) {
  const sp = await searchParams;
  const s = await getSession();
  if (!s || s.user.status !== "ACTIVE") redirect("/login?next=/application");
  const user = s.user;
  if (!user.emailVerified) redirect("/verify-email");
  const app = await getMyApplication(user.id);
  const contact = brand().contactEmail;
  const status = app?.status;
  const canWithdraw = status && ["SUBMITTED", "UNDER_REVIEW", "INTERVIEW_REQUESTED", "WAITLISTED"].includes(status);
  const view = applicationView({ membership: user.membership, communityAccess: user.communityAccess, status: status ?? null, contact });

  return (
    <>
      <h1 className="text-2xl font-semibold text-ink-950 sm:text-3xl">Your application</h1>
      <p className="mt-1 text-[15px] text-ink-600">
        Signed in as {user.name} ({user.email})
      </p>

      <div className="mt-5 space-y-3 empty:hidden" aria-live="polite">
        {sp.submitted && <FormAlert tone="success">Thank you. Your application was received and saved.</FormAlert>}
        {sp.withdrawn && <FormAlert tone="success">Your application was withdrawn.</FormAlert>}
        {sp.error && <FormAlert tone="error">{sp.error}</FormAlert>}
      </div>

      <section className="mt-6 rounded-2xl border border-ink-100 bg-white p-5 sm:p-8" aria-labelledby="status-h">
        <h2 id="status-h" className="text-sm font-semibold uppercase tracking-wide text-ink-500">
          Status
        </h2>
        <p className="mt-2 flex flex-wrap items-center gap-3">
          <span className="text-2xl font-semibold text-ink-950">{view.label}</span>
          {view.badge && status && <Badge tone={TONE[status]}>{view.badge}</Badge>}
        </p>

        <p className={view.notice ? "mt-4 rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-950 ring-1 ring-amber-200" : "mt-4 text-[15px] leading-7 text-ink-800"}>{view.text}</p>

        {status === "INTERVIEW_REQUESTED" && (
          <div className="mt-4 rounded-xl bg-accent-50 p-4">
            <h3 className="text-sm font-semibold text-accent-950">Interview details</h3>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-accent-950">
              {app?.interviewDetails || "We will send the details by email. If you have not received them, please contact us."}
            </p>
          </div>
        )}

        {app && status !== "DRAFT" && (
          <dl className="mt-5 grid gap-4 border-t border-ink-100 pt-5 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-ink-500">Submitted</dt>
              <dd className="font-medium text-ink-900">{fmt(app.submittedAt)}</dd>
            </div>
            <div>
              <dt className="text-ink-500">Last update</dt>
              <dd className="font-medium text-ink-900">{fmt(app.statusChangedAt ?? app.submittedAt)}</dd>
            </div>
          </dl>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          {user.communityAccess && (
            <Link href="/community" className={buttonClass("primary", "lg")}>
              Enter the Community
            </Link>
          )}
          {view.mayStart && (
            <Link href="/apply" className={buttonClass("primary", "lg")}>
              {app ? "Continue my application" : "Start my application"}
            </Link>
          )}
          {(status === "DECLINED" || status === "WITHDRAWN") && !user.communityAccess && (
            <Link href="/apply" className={buttonClass("secondary")}>
              Start a new application
            </Link>
          )}
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-ink-100 bg-white p-5 text-sm leading-6 text-ink-700 sm:p-6">
        <h2 className="font-semibold text-ink-950">Good to know</h2>
        <ul className="mt-2 space-y-1.5">
          <li>• You can sign in at any time to check this page. You do not have to wait for an email.</li>
          <li>• We never ask for fees, payments, bank details or identity documents.</li>
          <li>• {contact ? `Questions? Write to ${contact}.` : "Questions? Reply to any email you received from us."}</li>
        </ul>
        {canWithdraw && (
          <details className="mt-4 border-t border-ink-100 pt-4">
            <summary className="cursor-pointer text-ink-600">Withdraw my application</summary>
            <form action={withdrawApplicationAction} className="mt-3 space-y-3">
              <label className="flex items-start gap-2">
                <input type="checkbox" name="confirm" className="mt-1 h-4 w-4 rounded border-ink-300" />
                <span>I want to withdraw my application. I can apply again later.</span>
              </label>
              <Button type="submit" variant="secondary" size="sm">
                Withdraw application
              </Button>
            </form>
          </details>
        )}
      </section>
    </>
  );
}
