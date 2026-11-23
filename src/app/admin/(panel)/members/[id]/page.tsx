import { APPLICATION_STATUSES } from "@/lib/labels";
import { accountTypeLabel } from "@/server/admin/members";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminHeader, Dl, Flash, Panel, fmtDate, membershipTone, smallInput, smallLabel } from "@/components/admin/ui";
import { readFlash } from "@/lib/flash";
import { ActionForm } from "@/components/forms/action-form";
import { Badge, buttonClass } from "@/components/ui/primitives";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/guard";
import { can } from "@/lib/auth/permissions";
import { GROUP_STATUS_LABELS } from "@/server/community/group-labels";
import { MEMBERSHIP_LABELS } from "@/lib/labels";
import { memberStatusAction, membershipAction, messageMemberAction } from "../../../actions/community";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> };

const STATUS = { INVITED: "Invited", ACTIVE: "Active", SUSPENDED: "Suspended", DEACTIVATED: "Deactivated" } as const;

export default async function MemberAdminDetail({ params, searchParams }: Props) {
  const admin = await requireAdmin("members.view");
  const { id } = await params;
  const sp = await searchParams;
  // Administrators see account and membership metadata. Private group chat is
  // NOT accessible here (only reported content, in Reports).
  const u = await db.user.findUnique({
    where: { id },
    include: {
      profile: true,
      participant: { select: { id: true, applicationId: true } },
      applicant: { select: { applications: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true, status: true } } } },
      memberships: { include: { group: { select: { id: true, name: true, status: true } } }, orderBy: { joinedAt: "desc" } },
      _count: { select: { ideas: true, comments: true, reports: true } },
      tokens: { where: { kind: "INVITE" }, orderBy: { createdAt: "desc" }, take: 3, select: { createdAt: true, expiresAt: true, usedAt: true } },
    },
  });
  if (!u) notFound();
  const reportsAgainst = await db.contentReport.count({ where: { targetType: "USER", targetId: u.id } });
  const acceptances = can(admin.role, "legal.manage")
    ? await db.legalAcceptance.findMany({ where: { userId: u.id }, orderBy: { acceptedAt: "desc" }, take: 20, select: { id: true, documentKey: true, version: true, kind: true, method: true, acceptedAt: true } })
    : null;
  const latestApplication = u.applicant?.applications[0] ?? null;
  // One plain sentence: can this person use the member community right now, and if not, why not.
  const inShort =
    u.status !== "ACTIVE"
      ? "This account cannot sign in."
      : !u.emailVerifiedAt
        ? "This person can sign in, but must confirm their email address before anything else."
        : u.role !== "MEMBER"
          ? "Staff account: it can use the admin area and the member community."
          : u.membershipStatus === "ACTIVE"
            ? "This person can use the member community."
            : u.membershipStatus === "NONE"
              ? "This person can sign in and see their application, but cannot enter the member community (not approved yet)."
              : `This person can sign in, but their community access is ${u.membershipStatus === "SUSPENDED" ? "paused" : "removed"}.`;
  const canSuspend = can(admin.role, "members.suspend") && u.id !== admin.id && (u.role === "MEMBER" || admin.role === "OWNER");
  return (
    <>
      <p className="mb-4 text-sm">
        <Link href="/admin/members" className="text-accent-700 hover:underline">
          ← All members
        </Link>
      </p>
      <AdminHeader title={u.profile?.displayName ?? u.name} description={accountTypeLabel(u.role)} />
      <Flash {...readFlash(sp)} />
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <Panel title="Where this person stands">
            {/* The four facts that decide what a person can do, each named for what it is. */}
            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-ink-500">1. Account</dt>
                <dd className="mt-1 text-sm">
                  <Badge tone={u.status === "ACTIVE" ? "success" : u.status === "SUSPENDED" ? "danger" : "neutral"}>{STATUS[u.status]}</Badge>
                  <span className="ml-2 text-ink-600">{u.status === "ACTIVE" ? "can sign in" : "cannot sign in"}</span>
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-ink-500">2. Email address</dt>
                <dd className="mt-1 text-sm">
                  <Badge tone={u.emailVerifiedAt ? "success" : "warn"}>{u.emailVerifiedAt ? "Confirmed" : "Not confirmed"}</Badge>
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-ink-500">3. Application</dt>
                <dd className="mt-1 text-sm">
                  {latestApplication && latestApplication.status !== "DRAFT" ? (
                    <Link href={`/admin/applications/${latestApplication.id}`} className="text-accent-700 hover:underline">
                      {APPLICATION_STATUSES[latestApplication.status]} · open
                    </Link>
                  ) : u.role !== "MEMBER" ? (
                    <span className="text-ink-600">Not needed (staff)</span>
                  ) : (
                    <span className="text-ink-600">{latestApplication ? "Started, not submitted" : "None"}</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-ink-500">4. Community access</dt>
                <dd className="mt-1 text-sm">
                  {u.role !== "MEMBER" ? <Badge>Staff</Badge> : <Badge tone={membershipTone[u.membershipStatus]}>{MEMBERSHIP_LABELS[u.membershipStatus]}</Badge>}
                </dd>
              </div>
            </dl>
            <p className="mt-4 border-t border-ink-100 pt-3 text-sm text-ink-700">
              <strong>In short:</strong> {inShort}
            </p>
            {u.participant && (
              <p className="mt-2 text-sm">
                <Link href={`/admin/participants/${u.participant.id}`} className="text-accent-700 hover:underline">
                  Project record (availability, assignments)
                </Link>
              </p>
            )}
          </Panel>
          <Panel title="Account details">
            <Dl
              items={[
                ["Name", u.name],
                ["Email", u.email],
                ["Email confirmed", u.emailVerifiedAt ? fmtDate(u.emailVerifiedAt, true) : "Not yet"],
                ["Created", fmtDate(u.createdAt, true)],
                ["Last sign-in", fmtDate(u.lastLoginAt, true)],
                ["Two-step verification", u.totpEnabledAt ? "On" : "Off"],
                ["Suspended", u.suspendedAt ? `${fmtDate(u.suspendedAt, true)}${u.suspendedReason ? ` — ${u.suspendedReason}` : ""}` : null],
                [
                  "Application",
                  (u.applicant?.applications[0]?.id ?? u.participant?.applicationId) && u.applicant?.applications[0]?.status !== "DRAFT" ? (
                    <Link key="a" href={`/admin/applications/${u.applicant?.applications[0]?.id ?? u.participant?.applicationId}`} className="text-accent-700 hover:underline">
                      View application
                    </Link>
                  ) : null,
                ],
                ["Ideas / comments", `${u._count.ideas} / ${u._count.comments}`],
                ["Reports filed / against", `${u._count.reports} / ${reportsAgainst}`],
              ]}
            />
          </Panel>
          <Panel title="Group memberships">
            {u.memberships.length ? (
              <ul className="divide-y divide-ink-100 text-sm">
                {u.memberships.map((m) => (
                  <li key={m.id} className="flex justify-between gap-3 py-2">
                    <Link href={`/admin/groups/${m.group.id}`} className="text-accent-700 hover:underline">
                      {m.group.name}
                    </Link>
                    <span className="text-ink-600">
                      {m.role === "COORDINATOR" ? "Coordinator" : "Member"} · {m.status.toLowerCase()} · {GROUP_STATUS_LABELS[m.group.status]}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-600">No group memberships.</p>
            )}
          </Panel>
          {acceptances && (
            <Panel title="Policies accepted">
              {acceptances.length ? (
                <ul className="divide-y divide-ink-100 text-sm">
                  {acceptances.map((a) => (
                    <li key={a.id} className="flex justify-between gap-3 py-2">
                      <span>
                        {a.documentKey} v{a.version} · {a.kind === "ACCEPTED" ? "accepted" : "acknowledged"}
                      </span>
                      <span className="text-ink-600">
                        {fmtDate(a.acceptedAt)} · {a.method}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-ink-600">No acceptance recorded (accounts created before the policies existed).</p>
              )}
              <p className="mt-2 text-xs">
                <Link href="/admin/legal/acceptances" className="text-accent-700 hover:underline">
                  All acceptance records
                </Link>
              </p>
            </Panel>
          )}
          {u.status === "INVITED" && (
            <Panel title="Invitations">
              <ul className="text-sm text-ink-700">
                {u.tokens.map((t, i) => (
                  <li key={i}>
                    Sent {fmtDate(t.createdAt, true)} · {t.usedAt ? "used/replaced" : t.expiresAt < new Date() ? "expired" : `valid until ${fmtDate(t.expiresAt, true)}`}
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
        <div className="space-y-6">
          {canSuspend && u.role === "MEMBER" && (
            <Panel title="Community access">
              <p className="text-sm leading-6 text-ink-700">
                {u.membershipStatus === "NONE"
                  ? "Not a member. Access is given by approving this person’s application."
                  : "This controls access to the member community only. The person can still sign in and see their status."}
              </p>
              {u.membershipStatus !== "NONE" && (
                <form action={membershipAction} className="mt-3 space-y-2">
                  <input type="hidden" name="id" value={u.id} />
                  <label className="flex items-start gap-2 text-sm text-ink-800">
                    <input type="checkbox" name="notify" className="mt-0.5 h-4 w-4 rounded border-ink-300" />
                    <span>Also email this person about the change</span>
                  </label>
                  {u.membershipStatus === "ACTIVE" && (
                    <button type="submit" name="to" value="SUSPENDED" className={buttonClass("secondary", "sm", "w-full")}>
                      Pause community access
                    </button>
                  )}
                  {u.membershipStatus !== "ACTIVE" && (
                    <button type="submit" name="to" value="ACTIVE" className={buttonClass("primary", "sm", "w-full")}>
                      Restore community access
                    </button>
                  )}
                  {u.membershipStatus !== "REVOKED" && (
                    <button type="submit" name="to" value="REVOKED" className={buttonClass("danger", "sm", "w-full")}>
                      Remove community access
                    </button>
                  )}
                </form>
              )}
            </Panel>
          )}
          {canSuspend && (
            <Panel title="Account status">
              {u.status === "ACTIVE" && (
                <form action={memberStatusAction} className="space-y-2">
                  <input type="hidden" name="id" value={u.id} />
                  <input type="hidden" name="action" value="suspend" />
                  <label htmlFor="reason" className={smallLabel}>
                    Reason (internal)
                  </label>
                  <input id="reason" name="reason" maxLength={500} className={smallInput} />
                  <button className={buttonClass("danger", "sm")}>Suspend account</button>
                  <p className="text-xs text-ink-500">Signs the person out everywhere and blocks sign-in until reactivated.</p>
                </form>
              )}
              {(u.status === "SUSPENDED" || u.status === "DEACTIVATED") && (
                <form action={memberStatusAction}>
                  <input type="hidden" name="id" value={u.id} />
                  <input type="hidden" name="action" value="reactivate" />
                  <button className={buttonClass("primary", "sm")}>Reactivate account</button>
                </form>
              )}
              {u.status !== "DEACTIVATED" && (
                <form action={memberStatusAction} className="mt-4 border-t border-ink-100 pt-4">
                  <input type="hidden" name="id" value={u.id} />
                  <input type="hidden" name="action" value="deactivate" />
                  <button className={buttonClass("secondary", "sm")}>Deactivate account</button>
                  <p className="mt-1 text-xs text-ink-500">Ends all group memberships. Content stays under the display name.</p>
                </form>
              )}
            </Panel>
          )}
          {u.status === "ACTIVE" && (
            <Panel title="Send a notification">
              <ActionForm action={messageMemberAction} submitLabel="Send notification" resetOnSuccess>
                <input type="hidden" name="id" value={u.id} />
                <label htmlFor="m-title" className={smallLabel}>
                  Title
                </label>
                <input id="m-title" name="title" required maxLength={150} className={smallInput} />
                <label htmlFor="m-body" className={smallLabel}>
                  Message
                </label>
                <textarea id="m-body" name="body" rows={3} maxLength={2000} className={smallInput} />
              </ActionForm>
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
