import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/forms/action-form";
import {
  Field,
  FormAlert,
  Input,
  Select,
  Textarea,
} from "@/components/forms/fields";
import { LegalText } from "@/components/legal/legal-text";
import { MembersOnly } from "@/components/community/members-only";
import { Panel, Time } from "@/components/community/ui";
import { Badge } from "@/components/ui/primitives";
import { brand } from "@/config/brand";
import { readFlash } from "@/lib/flash";
import { AccessError } from "@/server/community/access";
import {
  AGREEMENT_STATUS_LABELS,
  COMPENSATION_METHODS,
  CONTRACTING_MODELS,
  PROJECT_STATUS_LABELS,
  projectDetail,
  termsSchema,
} from "@/server/community/group-projects";
import { loadGroupPage } from "@/server/community/group-page";
import { shortFingerprint } from "@/server/legal";
import {
  acceptAgreementAction,
  activateProjectAction,
  closeProjectAction,
  declineAgreementAction,
  legalReviewAction,
  openForAcceptanceAction,
  saveDraftAction,
  updateProjectBasicsAction,
  withdrawFromProjectAction,
  withdrawVersionAction,
} from "../../../../../project-actions";

type Props = {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const TERM_FIELDS: [keyof typeof termsSchema.shape, string, string, number][] =
  [
    ["scope", "1. Project scope", "What the project will and will not do.", 3],
    ["deliverables", "2. Expected deliverables", "", 3],
    ["timeline", "Timeline", "Start, milestones, end.", 2],
    ["customer", "Customer or client", "Leave empty if not yet known.", 1],
    [
      "contractingDetails",
      "Contracting details",
      "Who exactly signs with the customer, and any separate entity or documents.",
      2,
    ],
    [
      "paymentRecipient",
      "6. Who receives customer payments",
      "A named participant, each participant directly, or the project entity.",
      2,
    ],
    [
      "approvedExpenses",
      "7. Approved project expenses",
      "Which costs may be paid from project revenue, up to what amount, approved by whom.",
      3,
    ],
    [
      "grossRevenue",
      "8a. Gross customer receipts",
      "What counts as money received from customers.",
      2,
    ],
    [
      "deductions",
      "8b. Taxes and mandatory deductions",
      "Who handles taxes and other legal deductions. (Seek accounting advice; the platform does not decide what is deductible.)",
      2,
    ],
    [
      "refundsChargebacks",
      "8c. Refunds and chargebacks",
      "Who bears refunds and chargebacks, and how they are shared.",
      2,
    ],
    [
      "netRevenue",
      "8d. Net distributable project revenue",
      "How net revenue is calculated from the items above.",
      2,
    ],
    [
      "distributionFormula",
      "9. Revenue distribution formula",
      "Written by the participants. No formula is assumed.",
      3,
    ],
    [
      "paymentSchedule",
      "10. Payment schedule",
      "When and how each participant is paid.",
      2,
    ],
    [
      "ipArrangements",
      "12. Intellectual property",
      "Who owns new code, designs, research and content; what each person may use.",
      3,
    ],
    ["confidentiality", "13. Confidentiality", "", 2],
    [
      "withdrawal",
      "14. Withdrawal and termination",
      "What happens to unfinished work and earned compensation if someone leaves or the project ends.",
      3,
    ],
    [
      "disputes",
      "15. Dispute resolution",
      "For example: discuss in the group, then an agreed mediator.",
      2,
    ],
    ["other", "Other terms", "", 2],
  ];

export default async function ProjectPage({ params, searchParams }: Props) {
  const { slug, id } = await params;
  const flash = readFlash(await searchParams);
  const { user, group, isMember, isOpen } = await loadGroupPage(slug);
  if (!isMember)
    return <MembersOnly groupId={group.id} what="Projects" canJoin={isOpen} />;
  const d = await projectDetail(id, user.id).catch((e) => {
    if (e instanceof AccessError) notFound();
    throw e;
  });
  if (d.project.groupId !== group.id) notFound();
  const name = brand().name;
  const base = `/community/groups/${slug}/projects/${id}`;
  // The editor starts from the draft, else from the newest version, else empty.
  const source = d.draft ?? d.versions[0] ?? null;
  const terms = termsSchema.parse(source?.terms ?? {});
  const sourceParts = new Map(
    (source?.participants ?? []).map((p) => [p.userId, p]),
  );
  const meInForce = d.inForce?.participants.find((p) => p.userId === user.id);
  const meOpen = d.open?.participants.find((p) => p.userId === user.id);
  const closed =
    d.project.status === "COMPLETED" || d.project.status === "CANCELLED";

  return (
    <div className="max-w-4xl space-y-6">
      <p className="text-sm">
        <Link
          href={`/community/groups/${slug}/projects`}
          className="text-accent-700 hover:underline"
        >
          ← All projects
        </Link>
      </p>
      {(flash.ok || flash.error) && (
        <FormAlert tone={flash.error ? "error" : "success"}>
          {flash.error ?? flash.ok}
        </FormAlert>
      )}
      <section className="rounded-2xl border border-ink-100 bg-white p-6">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-xl font-semibold text-ink-950">
            {d.project.name}
          </h2>
          <Badge tone={d.project.status === "ACTIVE" ? "success" : "accent"}>
            {PROJECT_STATUS_LABELS[d.project.status]}
          </Badge>
          {d.project.needsLegalReview && (
            <Badge tone="warn">Needs legal or tax review</Badge>
          )}
        </div>
        <p className="mt-2 whitespace-pre-wrap text-[15px] leading-7 text-ink-800">
          {d.project.objective}
        </p>
        <p className="mt-2 text-sm text-ink-600">
          Project coordinator: {d.coordinatorName ?? "not set"}. Coordinating
          does not make anyone the legal representative of the others.
        </p>
        <p className="mt-3 rounded-xl bg-accent-50 p-3 text-sm leading-6 text-accent-950">
          {name} is not a party to this project and receives no share,
          commission or fee. Only the participants decide how its revenue is
          shared.
        </p>
      </section>

      {d.inForce && (
        <Panel title={`Agreement in force: version ${d.inForce.version}`}>
          <p className="text-sm text-ink-600">
            Accepted by every participant
            {d.inForce.acceptedAt ? (
              <>
                {" "}
                on <Time date={d.inForce.acceptedAt} />
              </>
            ) : null}{" "}
            · fingerprint{" "}
            <span className="font-mono">
              {shortFingerprint(d.inForce.contentHash)}
            </span>{" "}
            ·{" "}
            <a
              href={`/api/agreements/${d.inForce.id}`}
              className="font-medium text-accent-700 underline underline-offset-2"
            >
              Download a copy
            </a>
          </p>
          <ParticipantList participants={d.inForce.participants} />
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-medium text-accent-700">
              Read the agreement
            </summary>
            <div className="mt-3 rounded-xl border border-ink-100 p-4">
              <LegalText source={d.inForce.content} />
            </div>
          </details>
          {meInForce && !meInForce.withdrewAt && !closed && (
            <details className="mt-4">
              <summary className="cursor-pointer text-sm font-medium text-ink-700">
                Leave this project…
              </summary>
              <ActionForm
                action={withdrawFromProjectAction}
                submitLabel="Record my withdrawal"
                variant="danger"
                className="mt-3"
              >
                <input type="hidden" name="projectId" value={id} />
                <Field
                  id="w-note"
                  label="Note for the other participants"
                  hint="Leaving does not by itself forfeit anything you earned; the agreement in force decides."
                >
                  <Textarea
                    id="w-note"
                    name="note"
                    required
                    minLength={10}
                    maxLength={1000}
                    rows={2}
                    aria-describedby="w-note-hint"
                  />
                </Field>
              </ActionForm>
            </details>
          )}
        </Panel>
      )}

      {d.open && (
        <Panel title={`Waiting for acceptance: version ${d.open.version}`}>
          <p className="text-sm text-ink-600">
            Fingerprint{" "}
            <span className="font-mono">
              {shortFingerprint(d.open.contentHash)}
            </span>
            {d.inForce
              ? ` · until every participant accepts it, version ${d.inForce.version} stays in force.`
              : " · nothing is binding until every participant accepts it."}{" "}
            <a
              href={`/api/agreements/${d.open.id}`}
              className="font-medium text-accent-700 underline underline-offset-2"
            >
              Download
            </a>
          </p>
          {d.open.changeNote && (
            <p className="mt-2 text-sm text-ink-700">
              What changed: {d.open.changeNote}
            </p>
          )}
          <ParticipantList participants={d.open.participants} />
          <div className="mt-4 rounded-xl border border-ink-100 p-4">
            <LegalText source={d.open.content} />
          </div>
          {meOpen && !meOpen.acceptedAt && (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <ActionForm
                action={acceptAgreementAction}
                submitLabel="Accept this version"
              >
                <input type="hidden" name="versionId" value={d.open.id} />
                <input
                  type="hidden"
                  name="fingerprint"
                  value={d.open.contentHash}
                />
                <label className="flex items-start gap-3 text-sm leading-6 text-ink-700">
                  <input
                    type="checkbox"
                    name="confirm"
                    required
                    className="mt-1 h-4 w-4 rounded border-ink-300"
                  />
                  <span>
                    I have read version {d.open.version} (fingerprint{" "}
                    <span className="font-mono">
                      {shortFingerprint(d.open.contentHash)}
                    </span>
                    ) and accept it.
                  </span>
                </label>
              </ActionForm>
              <ActionForm
                action={declineAgreementAction}
                submitLabel="Decline"
                variant="secondary"
              >
                <input type="hidden" name="versionId" value={d.open.id} />
                <Field id="decline-note" label="What should change?" optional>
                  <Textarea
                    id="decline-note"
                    name="note"
                    maxLength={1000}
                    rows={2}
                  />
                </Field>
              </ActionForm>
            </div>
          )}
          {d.canEdit && (
            <ActionForm
              action={withdrawVersionAction}
              submitLabel="Stop asking for acceptance of this version"
              variant="ghost"
              className="mt-4"
            >
              <input type="hidden" name="versionId" value={d.open.id} />
            </ActionForm>
          )}
        </Panel>
      )}

      {d.canEdit && !closed && (
        <Panel
          title={
            d.draft
              ? `Draft agreement (version ${d.draft.version})`
              : "Prepare a new agreement version"
          }
        >
          <p className="mb-4 text-sm leading-6 text-ink-600">
            Fill in what the participants agreed. Saving keeps a draft; nothing
            is binding. When it is complete, ask the participants to accept it.
            Changing anyone&apos;s terms later creates a new version that
            everyone accepts again.
          </p>
          {/* Collapsed while an agreement is in force and nothing is being drafted: changing it is the exception. */}
          <details open={!d.inForce || Boolean(d.draft)}>
            <summary className="mb-4 cursor-pointer text-sm font-medium text-accent-700">
              {d.draft
                ? "Edit the draft"
                : "Change the agreement (creates a new version)"}
            </summary>
            {/* Keyed by the stored version, so every field (also the selects) starts from what is saved. */}
            <ActionForm
              key={source ? `${source.id}:${source.contentHash}` : "new"}
              action={saveDraftAction}
              submitLabel="Save draft"
            >
              <input type="hidden" name="projectId" value={id} />
              <Field id="contractingModel" label="5. Contracting arrangement">
                <Select
                  id="contractingModel"
                  name="contractingModel"
                  defaultValue={terms.contractingModel}
                >
                  {Object.entries(CONTRACTING_MODELS).map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field id="compensationMethod" label="Compensation method">
                <Select
                  id="compensationMethod"
                  name="compensationMethod"
                  defaultValue={terms.compensationMethod}
                >
                  {Object.entries(COMPENSATION_METHODS).map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </Select>
              </Field>
              {TERM_FIELDS.map(([k, label, hint, rows]) => (
                <Field
                  key={k}
                  id={`t-${k}`}
                  label={label}
                  optional
                  hint={hint || undefined}
                >
                  <Textarea
                    id={`t-${k}`}
                    name={k}
                    defaultValue={String(terms[k] ?? "")}
                    rows={rows}
                    maxLength={4000}
                    aria-describedby={hint ? `t-${k}-hint` : undefined}
                  />
                </Field>
              ))}
              <fieldset className="space-y-4 rounded-2xl border border-ink-100 p-4">
                <legend className="px-1 text-sm font-semibold text-ink-950">
                  3-4. Participants, responsibilities, expected contribution and
                  compensation
                </legend>
                {d.members.map((m) => {
                  const p = sourceParts.get(m.userId);
                  return (
                    <div key={m.userId} className="rounded-xl bg-ink-50/70 p-3">
                      <input type="hidden" name="member" value={m.userId} />
                      <label className="flex items-center gap-2 text-sm font-medium text-ink-900">
                        <input
                          type="checkbox"
                          name={`p_${m.userId}_include`}
                          defaultChecked={Boolean(p)}
                          className="h-4 w-4 rounded border-ink-300"
                        />
                        {m.name} takes part
                      </label>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <Input
                          name={`p_${m.userId}_role`}
                          defaultValue={p?.role ?? ""}
                          placeholder="Role (optional)"
                          aria-label={`Role of ${m.name}`}
                          maxLength={120}
                        />
                        <Input
                          name={`p_${m.userId}_contribution`}
                          defaultValue={p?.expectedContribution ?? ""}
                          placeholder="Expected contribution"
                          aria-label={`Expected contribution of ${m.name}`}
                          maxLength={1000}
                        />
                        <Textarea
                          name={`p_${m.userId}_responsibilities`}
                          defaultValue={p?.responsibilities ?? ""}
                          placeholder="Responsibilities"
                          aria-label={`Responsibilities of ${m.name}`}
                          rows={2}
                          maxLength={2000}
                        />
                        <Textarea
                          name={`p_${m.userId}_compensation`}
                          defaultValue={p?.compensation ?? ""}
                          placeholder="Compensation terms, in the group's own words"
                          aria-label={`Compensation of ${m.name}`}
                          rows={2}
                          maxLength={1500}
                        />
                      </div>
                    </div>
                  );
                })}
              </fieldset>
              <Field
                id="changeNote"
                label="What changed in this version?"
                optional
              >
                <Input
                  id="changeNote"
                  name="changeNote"
                  maxLength={1000}
                  defaultValue={d.draft?.changeNote ?? ""}
                />
              </Field>
            </ActionForm>
          </details>
          {d.draft && (
            <div className="mt-6 space-y-3 border-t border-ink-100 pt-4">
              <details>
                <summary className="cursor-pointer text-sm font-medium text-accent-700">
                  Preview the draft text
                </summary>
                <div className="mt-3 rounded-xl border border-ink-100 p-4">
                  <LegalText source={d.draft.content} />
                </div>
              </details>
              <ActionForm
                action={openForAcceptanceAction}
                submitLabel="Ask the participants to accept this version"
                variant="secondary"
              >
                <input type="hidden" name="versionId" value={d.draft.id} />
              </ActionForm>
            </div>
          )}
        </Panel>
      )}
      {!d.canEdit && d.draft && (
        <Panel
          title={`Draft agreement (version ${d.draft.version}, not binding)`}
        >
          <LegalText source={d.draft.content} />
        </Panel>
      )}

      {d.canEdit && !closed && (
        <Panel title="Project settings">
          <div className="grid gap-6 lg:grid-cols-2">
            <ActionForm
              action={updateProjectBasicsAction}
              submitLabel="Save details"
              variant="secondary"
            >
              <input type="hidden" name="projectId" value={id} />
              <Field id="b-name" label="Project name">
                <Input
                  id="b-name"
                  name="name"
                  defaultValue={d.project.name}
                  required
                  maxLength={120}
                />
              </Field>
              <Field id="b-objective" label="Business objective">
                <Textarea
                  id="b-objective"
                  name="objective"
                  defaultValue={d.project.objective}
                  required
                  rows={3}
                  maxLength={2000}
                />
              </Field>
              <Field id="b-coord" label="Project coordinator">
                <Select
                  id="b-coord"
                  name="coordinatorId"
                  defaultValue={d.project.coordinatorId ?? ""}
                >
                  {d.members.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </ActionForm>
            <div className="space-y-6">
              <ActionForm
                action={legalReviewAction}
                submitLabel="Save review status"
                variant="secondary"
              >
                <input type="hidden" name="projectId" value={id} />
                <Field id="lr" label="Legal or tax review">
                  <Select
                    id="lr"
                    name="needed"
                    defaultValue={d.project.needsLegalReview ? "yes" : "no"}
                  >
                    <option value="yes">
                      This arrangement needs a legal or tax review
                    </option>
                    <option value="no">Review done, or not needed</option>
                  </Select>
                </Field>
                <Field
                  id="lr-note"
                  label="Note"
                  optional
                  hint="When clearing the flag: how it was reviewed, or why it is not needed."
                >
                  <Textarea
                    id="lr-note"
                    name="note"
                    rows={2}
                    maxLength={1000}
                    defaultValue={d.project.legalReviewNote ?? ""}
                    aria-describedby="lr-note-hint"
                  />
                </Field>
              </ActionForm>
              {d.project.status !== "ACTIVE" && (
                <ActionForm
                  action={activateProjectAction}
                  submitLabel="Start commercial work"
                >
                  <input type="hidden" name="projectId" value={id} />
                  <p className="text-sm leading-6 text-ink-600">
                    Possible only when the latest agreement version is accepted
                    by every participant and the contracting arrangement and
                    payment recipient are recorded.
                  </p>
                </ActionForm>
              )}
              <ActionForm
                action={closeProjectAction}
                submitLabel="Close the project"
                variant="ghost"
              >
                <input type="hidden" name="projectId" value={id} />
                <Field id="c-to" label="Outcome">
                  <Select id="c-to" name="to" defaultValue="COMPLETED">
                    <option value="COMPLETED">Completed</option>
                    <option value="CANCELLED">Cancelled</option>
                  </Select>
                </Field>
                <Field id="c-note" label="Note for the participants">
                  <Input
                    id="c-note"
                    name="note"
                    required
                    minLength={10}
                    maxLength={500}
                  />
                </Field>
              </ActionForm>
            </div>
          </div>
        </Panel>
      )}

      <Panel title="All versions">
        {d.versions.length === 0 ? (
          <p className="text-sm text-ink-600">No agreement version yet.</p>
        ) : (
          <ul className="divide-y divide-ink-100 text-sm">
            {d.versions.map((v) => (
              <li
                key={v.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2"
              >
                <span>
                  Version {v.version} · {AGREEMENT_STATUS_LABELS[v.status]} ·{" "}
                  <span className="font-mono">
                    {shortFingerprint(v.contentHash)}
                  </span>
                  {v.changeNote && (
                    <span className="text-ink-600"> · {v.changeNote}</span>
                  )}
                </span>
                {v.status !== "DRAFT" && (
                  <a
                    href={`/api/agreements/${v.id}`}
                    className="font-medium text-accent-700 underline underline-offset-2"
                  >
                    Download
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function ParticipantList({
  participants,
}: {
  participants: {
    id: string;
    displayName: string;
    acceptedAt: Date | null;
    declinedAt: Date | null;
    withdrewAt: Date | null;
  }[];
}) {
  return (
    <ul className="mt-3 space-y-1 text-sm">
      {participants.map((p) => (
        <li key={p.id}>
          <span className="font-medium text-ink-900">{p.displayName}</span>{" "}
          <span className="text-ink-600">
            {p.withdrewAt ? (
              <>
                withdrew on <Time date={p.withdrewAt} />
              </>
            ) : p.acceptedAt ? (
              <>
                accepted on <Time date={p.acceptedAt} />
              </>
            ) : p.declinedAt ? (
              "declined; waiting for a new version"
            ) : (
              "has not answered yet"
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
