import { Photo } from "@/components/photos/photo";
import { CheckList } from "@/components/site/blocks";
import { Card, Notice, PageHeader, Section, SectionHeading } from "@/components/ui/primitives";
import { BalanceVisual } from "@/components/visuals/illustrations";
import { RevenueFlow } from "@/components/visuals/revenue-flow";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata(
  "/compensation",
  "Compensation and Transparency",
  "How compensation is determined: transparently, from actual project revenue, according to terms agreed in writing before work begins.",
);

export default function CompensationPage() {
  return (
    <>
      <PageHeader
        eyebrow="Pay & fairness"
        title="Fair results from real work"
        intro="Participants contribute their abilities and effort to actual business projects. Compensation is determined transparently according to agreed responsibilities, work performed, and project contribution."
        visual={
          <Photo
            id="compensation-header"
            priority
            sizes="(min-width: 1024px) 45vw, 100vw"
            className="shadow-soft-lg ring-1 ring-ink-100"
            fallback={<BalanceVisual className="w-full max-w-xs" />}
          />
        }
      />

      {/* Flow diagram */}
      <Section labelledBy="flow-heading">
        <SectionHeading
          id="flow-heading"
          eyebrow="Follow the money"
          title="From customer revenue to fair distribution"
          intro="Compensation comes only from real customer work. This is the order in which it happens on every project."
        />
        <div className="mt-12">
          <RevenueFlow />
        </div>
      </Section>

      {/* Factors */}
      <Section tone="blue" labelledBy="factors-heading">
        <SectionHeading
          id="factors-heading"
          eyebrow="Individual contributions"
          title="How compensation is determined"
          intro="Every project is different, so terms are set per project. The written agreement for a project considers:"
        />
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Work performed", "The actual tasks and deliverables each person completes."],
            ["Time invested", "The time required for the assigned responsibilities."],
            ["Complexity & responsibility", "The difficulty of the work and the level of responsibility carried."],
            ["Quality & contribution", "Quality of deliverables and individual contribution to project completion."],
          ].map(([t, b], i) => (
            <Card key={t}>
              <span className="text-sm font-semibold text-accent-700">{String(i + 1).padStart(2, "0")}</span>
              <h3 className="mt-2 font-semibold text-ink-950">{t}</h3>
              <p className="mt-2 leading-7 text-ink-600">{b}</p>
            </Card>
          ))}
        </div>
      </Section>

      {/* Commitments */}
      <Section labelledBy="commit-heading">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-3xl border border-accent-100 bg-accent-50 p-6 sm:p-8">
            <h2 id="commit-heading" className="text-2xl font-semibold text-ink-950">
              What we commit to
            </h2>
            <div className="mt-6">
              <CheckList
                items={[
                  "No membership fee is required, ever.",
                  "No initial financial contribution or investment is required.",
                  "The revenue a customer pays for a project is disclosed to the people who work on that project.",
                  "Project expenses, any organizational fee, and each person's compensation are agreed in writing before commercial work begins.",
                  "There is no fixed organizational percentage.",
                  "What is distributed follows actual contributions and those agreements.",
                  "There are no undisclosed deductions.",
                  "Compensation is paid from actual customer revenue for the project.",
                  "Each participant's compensation terms are private between them and the organization.",
                ]}
              />
            </div>
          </div>
          <div className="rounded-3xl border border-ink-100 bg-ink-50 p-6 sm:p-8">
            <h2 className="text-2xl font-semibold text-ink-950">What we do not promise</h2>
            <div className="mt-6">
              <CheckList
                negative
                items={[
                  "Guaranteed income or earnings.",
                  "Guaranteed projects or a minimum amount of work.",
                  "Fixed percentages or rates published in advance for all projects.",
                  "Payment for recruiting other people. No one is rewarded for recruitment.",
                ]}
              />
            </div>
          </div>
        </div>
      </Section>

      {/* Where the money comes from */}
      <Section tone="gray" labelledBy="source-heading">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.3fr] lg:gap-16">
          <SectionHeading id="source-heading" eyebrow="Timing" title="Paid after the customer pays" />
          <div className="space-y-4 text-lg leading-8 text-ink-700">
            <p>
              The organization earns revenue only by delivering products or services that customers pay for. The money available
              for compensation on a project depends on that project&apos;s economics: what the customer pays, and the direct costs
              of delivering the work.
            </p>
            <p>
              Because of this, compensation can only be settled after the customer has paid. The agreement for each project
              states how and when this happens, and what applies if a customer pays late, pays partially, or a project is
              cancelled.
            </p>
            <p>
              We intentionally do not offer an &ldquo;income calculator&rdquo;. Any estimate made before a real project exists
              would be speculation.
            </p>
            <Notice tone="warn" title="Before any project begins">
              Each participant receives the scope of work, responsibilities, deadlines, compensation terms and applicable
              conditions, and agrees to them in writing. If something is unclear, ask before you start.
            </Notice>
          </div>
        </div>
      </Section>
    </>
  );
}
