import { Photo } from "@/components/photos/photo";
import { SplitSection } from "@/components/photos/layouts";
import { CtaBand } from "@/components/site/blocks";
import { Card, PageHeader, Section, SectionHeading } from "@/components/ui/primitives";
import { AbilitiesVisual, RemoteTeamVisual } from "@/components/visuals/illustrations";
import { getSiteContent } from "@/lib/content";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata(
  "/about",
  "About Us",
  "Why the organization exists, the challenges it addresses, and its commitment to fair, transparent remote collaboration.",
);

const PHILOSOPHY = [
  ["Contribution, not capital", "Participation is based on willingness and ability to work, never on how much money someone has."],
  ["Every role matters", "Specialist skills are valuable, and so is careful, reliable operational work. Both are needed to deliver for customers."],
  ["Agreements before work", "Nobody should start a project without knowing its scope, responsibilities and compensation terms."],
  ["Honesty over hype", "We describe the organization as it actually is, including what does not exist yet."],
  ["Accountability", "Fairness requires clear standards. Reliability, quality and honest communication are expected of everyone."],
  ["Respect", "People of every age, background and level of experience are treated as equal contributors."],
] as const;

const PRIORITIES = [
  "Recruit a small group of responsible, motivated founding contributors.",
  "Understand the combined skills and availability of that group.",
  "Identify and validate real, revenue-generating business opportunities.",
  "Deliver first projects well, under clear written agreements.",
  "Grow gradually as real projects and revenue allow.",
];

export default async function AboutPage() {
  const c = await getSiteContent();
  return (
    <>
      <PageHeader
        eyebrow="About us"
        title="Why this organization exists"
        intro={c.company.mission}
        visual={
          <Photo
            id="about-header"
            priority
            sizes="(min-width: 1024px) 45vw, 100vw"
            className="shadow-soft-lg ring-1 ring-ink-100"
            fallback={<AbilitiesVisual className="w-full max-w-xs" />}
          />
        }
      />

      {/* Why we exist: editorial */}
      <Section labelledBy="why-heading">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.3fr] lg:gap-16">
          <div>
            <SectionHeading id="why-heading" eyebrow="Why we exist" title="Good skills deserve a fair way to earn." />
            <blockquote className="mt-8 border-l-4 border-accent-500 pl-5 text-xl font-medium leading-8 text-ink-900">
              People can accomplish together what is difficult for them to accomplish individually.
            </blockquote>
          </div>
          <div className="space-y-5 text-lg leading-8 text-ink-700">
            <p>
              Many people have useful skills, reliable work habits and some free time, yet earning additional income from them
              is hard. Freelancing alone means finding customers, handling every part of the work and carrying all of the
              risk. Starting a business usually requires money that many people do not have.
            </p>
            <p>
              At the same time, customers often need work that combines several abilities: a technical build, research,
              content, support and coordination. A single individual rarely covers all of that well.
            </p>
            <p>
              {c.company.name} was established to close that gap: to organize people with complementary abilities into remote
              teams that can take on real projects together, and to share the resulting revenue fairly.
            </p>
          </div>
        </div>
      </Section>

      {/* Our philosophy */}
      <Section tone="gray" labelledBy="philosophy-heading">
        <SectionHeading id="philosophy-heading" eyebrow="Our philosophy" title="What we believe" />
        <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {PHILOSOPHY.map(([t, b], i) => (
            <Card key={t}>
              <span className="text-sm font-semibold text-accent-700">{String(i + 1).padStart(2, "0")}</span>
              <h3 className="mt-2 text-lg font-semibold text-ink-950">{t}</h3>
              <p className="mt-2 leading-7 text-ink-600">{b}</p>
            </Card>
          ))}
        </div>
      </Section>

      {/* The value of cooperation */}
      <SplitSection
        id="cooperation"
        tone="blue"
        eyebrow="The value of cooperation"
        title="Different abilities, combined, create real capacity."
        mediaSide="left"
        media={
          <Photo
            id="about-cooperation"
            sizes="(min-width: 1024px) 45vw, 100vw"
            fallback={<RemoteTeamVisual className="w-full max-w-sm" />}
          />
        }
      >
        <p>
          A developer, a careful researcher, someone good with customers and someone who keeps things organized can, together,
          deliver work that none of them could deliver alone.
        </p>
        <p>
          Cooperation also lets people learn from one another. Someone starting with simple, well-defined tasks can grow into
          more responsibility by working alongside more experienced contributors.
        </p>
      </SplitSection>

      {/* Where we are today */}
      <Section labelledBy="today-heading">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.3fr] lg:gap-16">
          <div>
            <SectionHeading id="today-heading" eyebrow="Honestly, today" title="An initiative in its founding stage" />
            <p className="mt-5 text-lg leading-8 text-ink-700">
              The organization was conceived by one founder, who is responsible for establishing and managing it during this
              initial period. There is not yet an established team of participants, and there are no completed client projects
              to point to.
            </p>
          </div>
          <div>
            <p className="font-semibold text-ink-950">The immediate priorities are practical:</p>
            <ol className="mt-5 space-y-3">
              {PRIORITIES.map((p, i) => (
                <li key={p} className="flex gap-4 rounded-2xl border border-ink-100 bg-white p-4 shadow-soft">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-100 text-sm font-semibold text-accent-800">
                    {i + 1}
                  </span>
                  <span className="pt-1 leading-7 text-ink-700">{p}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </Section>

      {/* Long-term vision */}
      <Section tone="soft" labelledBy="vision-heading">
        <div className="mx-auto max-w-3xl text-center">
          <SectionHeading id="vision-heading" eyebrow="Our long-term vision" title="Start small, stay fair, grow with real results." align="center" />
          <div className="mt-6 space-y-4 text-lg leading-8 text-ink-700">
            <p>Initially, the focus is part-time collaboration that provides additional income alongside existing jobs.</p>
            <p>
              Over time, if particular projects become consistently successful, some participants may choose to dedicate more
              time to them, possibly even full-time. That could eventually grow into a shared business and a more substantial
              livelihood for those involved. This is a possible future direction, not a promise, and it will only happen if real
              results justify it.
            </p>
            <p>
              Whatever its size, the organization intends to remain fair and transparent: clear agreements, documented
              distribution rules, and respect for everyone&apos;s contribution.
            </p>
          </div>
        </div>
      </Section>

      <CtaBand />
    </>
  );
}
