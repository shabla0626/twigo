import Link from "next/link";
import { createCulturalWorkAction, removeCulturalWorkAction } from "@/app/community/actions";
import { QuickAction } from "@/components/community/quick-action";
import { ReportButton } from "@/components/community/report-button";
import { EmptyState, TextBody, Time } from "@/components/community/ui";
import { ActionForm } from "@/components/forms/action-form";
import { Field, FormAlert, Input, Select, Textarea } from "@/components/forms/fields";
import { Badge } from "@/components/ui/primitives";
import { requireMember } from "@/lib/auth/guard";
import { readFlash } from "@/lib/flash";
import { memberLabel, teammateIds } from "@/server/community/identity";
import { listCulturalWorks } from "@/server/community/culture";

export const metadata = { title: "Works" };

const KINDS = {
  SOCIAL: "Social media",
  LITERATURE: "Literature",
  CREATIVE: "Creative work",
} as const;

export default async function CulturePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireMember();
  const sp = await searchParams;
  const flash = readFlash(sp);
  const [works, teammates] = await Promise.all([listCulturalWorks(), teammateIds(user.id)]);
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header>
        <h1 className="text-2xl font-semibold text-ink-950 sm:text-3xl">Works</h1>
        <p className="mt-2 text-[15px] leading-7 text-ink-700">
          A place the operators keep for members’ own work: a social-media piece, a literary installment, or another creative work. It can be one part of a series. Approved members can read it. It is separate from the discussion of technology and society, and it does not open a project group.
        </p>
        <p className="mt-2 text-sm leading-6 text-ink-600">It is not confidential. It is not a job offer, and it does not ask anyone for fees or investment.</p>
      </header>
      {sp.published && <FormAlert tone="success">Your installment is published. Any approved member can read it.</FormAlert>}
      {flash.error && <FormAlert tone="error">{flash.error}</FormAlert>}
      <section className="rounded-2xl border border-ink-100 bg-white p-5 sm:p-6">
        <h2 className="text-lg font-semibold text-ink-950">Publish an installment</h2>
        <ActionForm action={createCulturalWorkAction} submitLabel="Publish installment" pendingLabel="Publishing…" className="mt-4 space-y-4">
          <Field id="work-kind" label="Kind">
            <Select id="work-kind" name="kind" required defaultValue="LITERATURE">
              {Object.entries(KINDS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="work-series" label="Series title" optional>
            <Input id="work-series" name="seriesTitle" maxLength={120} placeholder="Leave blank for a single piece" />
          </Field>
          <Field id="work-title" label="Title of this installment">
            <Input id="work-title" name="title" required minLength={5} maxLength={140} />
          </Field>
          <Field id="work-body" label="The installment">
            <Textarea id="work-body" name="body" required minLength={40} maxLength={30000} rows={8} />
          </Field>
        </ActionForm>
      </section>
      {works.length === 0 ? (
        <EmptyState title="No installments yet" body="The first installment gives the next member something to read. The operators do not invent works to fill this page." />
      ) : (
        <ul className="space-y-4">
          {works.map((work) => {
            const name = memberLabel(work.author?.id, work.author?.profile?.displayName, teammates);
            return (
              <li key={work.id} className="rounded-2xl border border-ink-100 bg-white p-5 sm:p-6">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="accent">{KINDS[work.kind]}</Badge>
                  {work.seriesTitle && <Badge>{work.seriesTitle}</Badge>}
                </div>
                <h2 className="mt-3 text-lg font-semibold text-ink-950">{work.title}</h2>
                <p className="mt-1 text-sm text-ink-500">
                  {work.author ? (
                    <Link href={`/community/members/${work.author.id}`} className="font-medium text-ink-700 hover:underline">
                      {name}
                    </Link>
                  ) : (
                    "Former member"
                  )}
                  {" · "}
                  <Time date={work.createdAt} />
                </p>
                <TextBody text={work.body} className="mt-3" />
                <div className="mt-4 flex flex-wrap gap-2">
                  {work.author?.id === user.id ? (
                    <QuickAction
                      action={removeCulturalWorkAction}
                      fields={{ id: work.id }}
                      label="Remove installment"
                      confirm={{ question: "Remove this installment?", detail: "Members will no longer see it.", yes: "Yes, remove it", danger: true }}
                    />
                  ) : (
                    <ReportButton targetType="CULTURAL_WORK" targetId={work.id} label="Report installment" />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
