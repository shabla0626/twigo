import Link from "next/link";
import { Photo } from "@/components/photos/photo";
import { CheckList } from "@/components/site/blocks";
import { Card, Notice, PageHeader, Section, SectionHeading } from "@/components/ui/primitives";
import { BalanceVisual } from "@/components/visuals/illustrations";
import { RevenueFlow } from "@/components/visuals/revenue-flow";
import { brand } from "@/config/brand";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata(
  "/compensation",
  "Money and Fairness",
  "No fees, no commission: the members of each project decide in writing, before commercial work begins, how its revenue is shared.",
);

const ARRANGEMENTS = [
  ["Equal distribution", "Net project revenue is divided equally between the participants."],
  ["By contribution", "Shares follow each person's agreed contribution, for example work delivered or time invested."],
  ["By role", "Each role has its own agreed pay or share, reflecting complexity and responsibility."],
  ["Fixed payments", "Some or all participants receive an agreed fixed amount for their part."],
] as const;

export default function CompensationPage() {
  const name = brand().name;
  return (
    <>
      <PageHeader
        eyebrow="Pay & fairness"
        title="Your project, your agreement"
        intro={`${name} does not employ members, contract with customers or take a share of project money. The members of each project agree in writing, before commercial work begins, how that project's revenue is shared.`}
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
          title="From a customer's payment to each participant"
          intro="Project money only comes from real customers. At every step, the participants' accepted agreement decides what happens."
        />
        <div className="mt-12">
          <RevenueFlow />
        </div>
      </Section>

      {/* Arrangements */}
      <Section tone="blue" labelledBy="factors-heading">
        <SectionHeading
          id="factors-heading"
          eyebrow="The group decides"
          title="Ways a project can share its revenue"
          intro={`${name} does not impose a formula or a percentage. These are common choices; the participants may also agree another arrangement, as long as every one of them accepts it.`}
        />
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {ARRANGEMENTS.map(([t, b], i) => (
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
              What {name} commits to
            </h2>
            <div className="mt-6">
              <CheckList
                items={[
                  "No membership fee, ever.",
                  "No mandatory investment or capital contribution.",
                  `No commission, percentage or ownership share of project revenue for ${name}.`,
                  `No automatic deductions: ${name} never collects, holds or distributes project money.`,
                  "Before commercial work begins, the participants record who contracts with the customer, who receives payment, which expenses are approved, how net revenue is calculated and how it is shared.",
                  "Every participant must accept the agreement. Changing it creates a new version that the participants accept again.",
                  "A project's revenue and expenses are disclosed to its participants.",
                  `Voluntary support for ${name} is separate and never comes out of project earnings.`,
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
                  `That ${name} will find customers for you.`,
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
              Project money exists only when a customer pays for delivered work. The participants decide who contracts with the customer and who receives
              the payment: for example one project representative, each participant directly for their own part, or a separately established project
              entity. Naming someone coordinator does not, by itself, make them everyone&apos;s legal representative.
            </p>
            <p>
              Their agreement states when each person is paid and what happens if a customer pays late, pays partially, asks for a refund, or the project is
              cancelled.
            </p>
            <p>
              We do not offer an &ldquo;income calculator&rdquo;. Any estimate made before a real project exists would be speculation.
            </p>
            <Notice tone="warn" title="Before commercial work begins">
              Each participant reviews the project agreement in {name} (scope, responsibilities, contracting party, payment recipient, expenses, revenue
              formula, payment schedule, intellectual property, confidentiality, withdrawal and disputes) and accepts it. Some arrangements need legal or tax
              advice; the project can be marked as needing that review.
            </Notice>
            <p className="text-base">
              Details:{" "}
              <Link href="/legal/participation-compensation" className="font-medium text-accent-700 underline underline-offset-2">
                Participation and Compensation Policy
              </Link>{" "}
              ·{" "}
              <Link href="/support" className="font-medium text-accent-700 underline underline-offset-2">
                Voluntary community support
              </Link>
            </p>
          </div>
        </div>
      </Section>
    </>
  );
}
