import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminHeader, Dl, Flash, Panel, fmtDate, membershipTone, smallInput, smallLabel, statusTone } from "@/components/admin/ui";
import { readFlash } from "@/lib/flash";
import { Badge, buttonClass } from "@/components/ui/primitives";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/guard";
import { can } from "@/lib/auth/permissions";
import { localInboxUrl } from "@/lib/email";
import { EMAIL_STATUS_INFO } from "@/lib/email/status";
import { TEMPLATES } from "@/lib/email/templates";
import { APPLICATION_STATUSES, EXPERIENCE_LEVELS, MEMBERSHIP_LABELS, WORK_CATEGORIES } from "@/lib/labels";
import { ADMIN_TRANSITIONS, STATUS_EMAIL, getApplication, hasOtherOpenApplication } from "@/server/admin/applications";
import { addNoteAction, changeStatusAction, deleteApplicantAction, requestAccountAction } from "../../../actions/applications";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> };

const checkbox = "mt-0.5 h-4 w-4 rounded border-ink-300";

export default async function ApplicationDetail({ params, searchParams }: Props) {
  const admin = await requireAdmin("applications.view");
  const { id } = await params;
  const sp = await searchParams;
  const app = await getApplication(id);
  // Unfinished drafts are the applicant's private work.
  if (!app || app.status === "DRAFT") notFound();
  const a = app.applicant;
  const account = a.user;
  const emails = await db.emailDelivery.findMany({ where: { applicationId: id }, orderBy: { createdAt: "desc" }, take: 10 });
  const primary = a.skills.filter((s) => s.kind === "PRIMARY").map((s) => s.skill.label);
  const secondary = a.skills.filter((s) => s.kind === "SECONDARY").map((s) => s.skill.label);
  // A declined application cannot be re-opened once the person has started a new one.
  const superseded = app.status === "DECLINED" && (await hasOtherOpenApplication(app.applicantId, app.id));
  const next = superseded ? [] : ADMIN_TRANSITIONS[app.status];
  const others = next.filter((s) => s !== "ACCEPTED");
  const canReview = can(admin.role, "applications.review");
  const inbox = localInboxUrl();
  const membership = account?.membershipStatus ?? "NONE";

  return (
    <>
      <p className="mb-4 text-sm">
        <Link href="/admin/applications" className="text-accent-700 hover:underline">
          ← All applications
        </Link>
      </p>
      <AdminHeader
        title={a.fullName}
        description={`Submitted ${fmtDate(app.submittedAt ?? app.createdAt, true)}`}
        actions={
          a.participant ? (
            <Link href={`/admin/participants/${a.participant.id}`} className={buttonClass("secondary", "sm")}>
              View participant record
            </Link>
          ) : null
        }
      />
      <Flash {...readFlash(sp)} />

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <Panel title="Where things stand">
            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className={smallLabel}>1. Application</dt>
                <dd className="mt-1">
                  <Badge tone={statusTone[app.status]}>{APPLICATION_STATUSES[app.status]}</Badge>
                  {app.statusChangedAt && <span className="ml-2 text-xs text-ink-500">since {fmtDate(app.statusChangedAt)}</span>}
                </dd>
              </div>
              <div>
                <dt className={smallLabel}>2. Account</dt>
                <dd className="mt-1 text-sm">
                  {!account ? (
                    <Badge tone="warn">No account yet</Badge>
                  ) : account.status !== "ACTIVE" ? (
                    <Badge tone="danger">Account {account.status.toLowerCase()}</Badge>
                  ) : account.emailVerifiedAt ? (
                    <Badge tone="success">Email confirmed</Badge>
                  ) : (
                    <Badge tone="warn">Email not confirmed</Badge>
                  )}
                  {account?.lastLoginAt && <span className="ml-2 text-xs text-ink-500">last sign-in {fmtDate(account.lastLoginAt)}</span>}
                </dd>
              </div>
              <div>
                <dt className={smallLabel}>3. Community access</dt>
                <dd className="mt-1">
                  <Badge tone={membershipTone[membership]}>{MEMBERSHIP_LABELS[membership]}</Badge>
                  {account && membership !== "NONE" && (
                    <Link href={`/admin/members/${account.id}`} className="ml-2 text-xs text-accent-700 hover:underline">
                      Manage
                    </Link>
                  )}
                </dd>
              </div>
              <div>
                <dt className={smallLabel}>4. Last email</dt>
                <dd className="mt-1 text-sm">
                  {emails[0] ? <Badge tone={EMAIL_STATUS_INFO[emails[0].status].tone}>{EMAIL_STATUS_INFO[emails[0].status].label}</Badge> : <span className="text-ink-600">None sent</span>}
                </dd>
              </div>
            </dl>
            <p className="mt-4 text-xs leading-5 text-ink-500">
              These four are separate. An email problem never changes the application, and a status change alone never emails anyone unless you tick “email
              the applicant”.
            </p>
          </Panel>

          <Panel title="About the applicant">
            <Dl
              items={[
                ["Email", <a key="e" href={`mailto:${a.email}`} className="text-accent-700 hover:underline">{a.email}</a>],
                ["Location", [a.region, a.country].filter(Boolean).join(", ")],
                ["Occupation or background", a.occupation],
                ["Education", a.education],
                ["Experience", app.experienceLevel ? EXPERIENCE_LEVELS[app.experienceLevel] : null],
                [
                  "Portfolio / LinkedIn",
                  a.profileUrl ? (
                    <a key="p" href={a.profileUrl} target="_blank" rel="noopener noreferrer nofollow" className="text-accent-700 hover:underline">
                      {a.profileUrl}
                    </a>
                  ) : null,
                ],
              ]}
            />
            {app.relevantExperience && (
              <div className="mt-4">
                <Dl items={[["Relevant experience", app.relevantExperience]]} />
              </div>
            )}
          </Panel>
          <Panel title="Skills and time">
            <Dl
              items={[
                ["Skills", primary.join(", ")],
                ["Other skills", secondary.join(", ")],
                ["Preferred work", app.workPreferences.map((w) => WORK_CATEGORIES[w.category]).join("\n")],
                ["Work they would like to do", app.desiredWork],
                ["Hours per week", app.availability?.hoursPerWeek ? `About ${app.availability.hoursPerWeek}` : null],
                ["When", app.availability?.schedule],
                ["Willing to learn new skills", app.willingToLearn ? "Yes" : "Not indicated"],
              ]}
            />
          </Panel>
          <Panel title="Motivation">
            <Dl
              items={[
                ["Why they want to participate", app.motivation],
                ["What they can contribute", app.contribution],
                ["Additional comments", app.additionalComments],
              ]}
            />
          </Panel>

          <Panel title="Communication history">
            {emails.length ? (
              <ul className="divide-y divide-ink-100 text-sm">
                {emails.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <span className="min-w-0">
                      <span className="block text-ink-900">{e.subject}</span>
                      <span className="block text-xs text-ink-500">
                        {fmtDate(e.createdAt, true)} · {e.templateKey ? (TEMPLATES[e.templateKey as keyof typeof TEMPLATES]?.label ?? e.templateKey) : "Custom"}
                      </span>
                    </span>
                    <Badge tone={EMAIL_STATUS_INFO[e.status].tone}>{EMAIL_STATUS_INFO[e.status].label}</Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-600">No emails have been sent about this application.</p>
            )}
            {inbox && (
              <p className="mt-3 rounded-md bg-sky-50 p-3 text-xs text-sky-950">
                Development mode: emails are captured locally and are not delivered.{" "}
                <a href={inbox} target="_blank" rel="noopener noreferrer" className="font-semibold underline">
                  Open the local test inbox
                </a>
              </p>
            )}
            <Link href="/admin/email" className="mt-3 inline-block text-sm text-accent-700 hover:underline">
              Full email log and retries
            </Link>
          </Panel>

          <Panel title="Consent record">
            <Dl
              items={[
                ["Confirmed at", fmtDate(app.acknowledgedAt, true)],
                ["Privacy Policy version shown at submission", app.privacyNoticeVersion],
              ]}
            />
          </Panel>
        </div>

        <div className="space-y-6">
          {canReview && next.includes("ACCEPTED") && (
            <Panel title="Approve">
              <form action={changeStatusAction} className="space-y-3">
                <input type="hidden" name="id" value={app.id} />
                <input type="hidden" name="status" value="ACCEPTED" />
                <p className="text-sm leading-6 text-ink-700">
                  {account?.emailVerifiedAt
                    ? "Approving gives this person access to the member community right away, with the email and password they already have."
                    : "This applicant has no confirmed account yet. If you approve, community access starts automatically once they create an account and confirm this email address."}
                </p>
                <label className="flex items-start gap-2 text-sm text-ink-800">
                  <input type="checkbox" name="confirm" className={checkbox} />
                  <span>I confirm: approve {a.fullName} as a member.</span>
                </label>
                <button type="submit" name="notify" value="on" className={buttonClass("primary", "sm", "w-full")}>
                  Approve and Notify
                </button>
                <button type="submit" className={buttonClass("secondary", "sm", "w-full")}>
                  Approve without email
                </button>
                <p className="text-xs text-ink-500">If the email fails, the approval still stands and you are told so.</p>
              </form>
            </Panel>
          )}

          {canReview && others.length > 0 && (
            <Panel title={next.includes("ACCEPTED") ? "Other decisions" : "Change status"}>
              <form action={changeStatusAction} className="space-y-3">
                <input type="hidden" name="id" value={app.id} />
                <label htmlFor="status" className={smallLabel}>
                  New status
                </label>
                <select id="status" name="status" defaultValue={others[0]} className={smallInput}>
                  {others.map((v) => (
                    <option key={v} value={v}>
                      {APPLICATION_STATUSES[v]}
                    </option>
                  ))}
                </select>
                <label htmlFor="interviewDetails" className={smallLabel}>
                  Message for the applicant (optional)
                </label>
                <textarea
                  id="interviewDetails"
                  name="interviewDetails"
                  rows={3}
                  maxLength={2000}
                  defaultValue={app.interviewDetails ?? ""}
                  className={smallInput}
                  placeholder="For an interview: proposed times and how to reply. Shown on their status page."
                />
                <label className="flex items-start gap-2 text-sm text-ink-800">
                  <input type="checkbox" name="notify" className={checkbox} />
                  <span>Also email the applicant ({others.filter((s) => STATUS_EMAIL[s]).map((s) => APPLICATION_STATUSES[s].toLowerCase()).join(", ")} have a standard email)</span>
                </label>
                <button type="submit" className={buttonClass("secondary", "sm", "w-full")}>
                  Update status
                </button>
              </form>
            </Panel>
          )}

          {!canReview || next.length === 0 ? (
            <Panel title="Status">
              <p className="text-sm leading-6 text-ink-700">
                {app.status === "ACCEPTED"
                  ? "This application is accepted. Community access is managed on the member’s page (pause, restore or remove)."
                  : app.status === "WITHDRAWN"
                    ? "The applicant withdrew this application. They can start a new one."
                    : "You do not have permission to change this application."}
              </p>
            </Panel>
          ) : null}

          {!account && (
            <Panel title="No account yet">
              <p className="text-sm leading-6 text-ink-700">
                This application was sent before personal accounts existed. When the person creates an account with <strong>{a.email}</strong> and confirms that
                address, this application is connected to it automatically.
              </p>
              <form action={requestAccountAction} className="mt-3">
                <input type="hidden" name="id" value={app.id} />
                <button type="submit" className={buttonClass("secondary", "sm", "w-full")}>
                  Email them a request to create an account
                </button>
              </form>
            </Panel>
          )}

          <Panel title="Contact the applicant">
            <Link href={`/admin/applications/${app.id}/email?template=${STATUS_EMAIL[app.status] ?? "interview_invitation"}`} className={buttonClass("secondary", "sm", "w-full")}>
              Write an email…
            </Link>
            <p className="mt-2 text-xs text-ink-500">You review every message before it is sent. Sending an email never changes the application status.</p>
          </Panel>

          <Panel title="Private notes">
            <form action={addNoteAction} className="space-y-2">
              <input type="hidden" name="id" value={app.id} />
              <label htmlFor="body" className="sr-only">
                New note
              </label>
              <textarea id="body" name="body" rows={3} required maxLength={4000} className={smallInput} placeholder="Add a private note (never shown to the applicant)…" />
              <button type="submit" className={buttonClass("secondary", "sm", "w-full")}>
                Add note
              </button>
            </form>
            <ul className="mt-4 space-y-3">
              {app.notes.map((n) => (
                <li key={n.id} className="rounded-md bg-ink-50 p-3 text-sm">
                  <p className="whitespace-pre-wrap text-ink-900">{n.body}</p>
                  <p className="mt-1 text-xs text-ink-500">
                    {n.author?.name ?? "Deleted admin"} · {fmtDate(n.createdAt, true)}
                  </p>
                </li>
              ))}
            </ul>
          </Panel>

          {can(admin.role, "data.export") && (
            <Panel title="Data access request">
              <a href={`/admin/applications/${app.id}/export`} className={buttonClass("secondary", "sm", "w-full")} download>
                Export this person’s data (JSON)
              </a>
              <p className="mt-2 text-xs text-ink-500">For access requests. The export is recorded in the audit log.</p>
            </Panel>
          )}

          <Panel title="Delete applicant data">
            <form action={deleteApplicantAction} className="space-y-2">
              <input type="hidden" name="id" value={app.id} />
              <p className="text-xs text-ink-600">Permanently deletes this applicant and all application data (for an erasure request). This cannot be undone.</p>
              <label htmlFor="confirm" className={smallLabel}>
                Type DELETE to confirm
              </label>
              <input id="confirm" name="confirm" autoComplete="off" className={smallInput} />
              <button type="submit" className={buttonClass("danger", "sm", "w-full")}>
                Delete permanently
              </button>
            </form>
          </Panel>
        </div>
      </div>
    </>
  );
}
