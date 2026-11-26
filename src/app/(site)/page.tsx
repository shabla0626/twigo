import Link from "next/link";
import { Photo } from "@/components/photos/photo";
import { CtaBand } from "@/components/site/blocks";
import { JourneySteps } from "@/components/site/community-model";
import { IconArrow, IconCheck, IconDoc } from "@/components/ui/icons";
import { ButtonLink, Container, Section, SectionHeading } from "@/components/ui/primitives";
import { GlyphIcon, type GlyphName } from "@/components/visuals/glyphs";
import { HeroNetwork } from "@/components/visuals/hero-network";
import { Reveal } from "@/components/visuals/reveal";
import { STARTER_IDEAS, homeDifferences } from "@/content/opening";
import type { PhotoId } from "@/content/photos";
import { brand } from "@/config/brand";
import { getSiteContent } from "@/lib/content";
import { IDEA_CATEGORIES } from "@/lib/validation/community";

const WHO: { photo: PhotoId; glyph: GlyphName; title: string; body: string }[] = [
  {
    photo: "home-who-professional",
    glyph: "code",
    title: "Professionals",
    body: "Developers, data and AI specialists, designers, marketers, analysts, researchers, writers and project managers who want additional income opportunities.",
  },
  {
    photo: "home-who-general",
    glyph: "clipboard",
    title: "General contributors",
    body: "People without advanced qualifications who do careful operational work: research, data entry and organization, document processing, support and quality checking.",
  },
  {
    photo: "home-who-learning",
    glyph: "search",
    title: "Developing contributors",
    body: "People who want to build new capabilities, starting with simpler tasks in a group and taking on more as they gain experience.",
  },
];

export default async function HomePage() {
  const c = await getSiteContent();
  const name = brand().name;
  const founding = c.announcement.enabled
    ? c.announcement
    : {
        title: "We are welcoming our first members",
        body: `${brand().name} is at its very beginning. We are looking for responsible, motivated people who want to help build a collaborative community.`,
      };

  return (
    <>
      {/* Hero: bright, with a large photograph */}
      <section className="relative overflow-hidden bg-gradient-to-b from-white via-white to-sky-50" aria-labelledby="hero-heading">
        <div aria-hidden="true" className="pointer-events-none absolute -right-32 -top-32 h-[28rem] w-[28rem] rounded-full bg-accent-100/70 blur-3xl" />
        <Container className="relative grid items-center gap-12 py-14 sm:py-20 lg:grid-cols-[1fr_1.05fr] lg:gap-14 lg:py-24">
          <div>
            {c.hero.eyebrow && (
              <p className="inline-flex items-center gap-2.5 rounded-full border border-accent-200 bg-white px-3 py-1 text-sm font-medium text-accent-800 shadow-sm">
                <span className="relative flex h-2 w-2" aria-hidden="true">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-accent-500 opacity-75 motion-safe:animate-ping" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-accent-500" />
                </span>
                {c.hero.eyebrow}
              </p>
            )}
            <h1 id="hero-heading" className="mt-6 text-4xl font-semibold leading-[1.08] text-ink-950 sm:text-5xl xl:text-6xl">
              {c.hero.headline}
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-ink-700">{c.hero.subheadline}</p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <ButtonLink href="/join" size="lg">
                Join {brand().name} <IconArrow className="h-5 w-5" />
              </ButtonLink>
              <ButtonLink href="/how-it-works" variant="secondary" size="lg">
                See how it works
              </ButtonLink>
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium text-ink-700">
              {["No membership fees", "No commission on your projects", "Fully remote"].map((t) => (
                <li key={t} className="flex items-center gap-2">
                  <IconCheck className="h-4 w-4 text-accent-700" />
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="relative">
            <Photo
              id="home-hero"
              priority
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="shadow-soft-lg ring-1 ring-ink-100"
              rounded="rounded-3xl"
              fallback={<HeroNetwork className="h-full w-full max-w-md" />}
            />
          </div>
        </Container>
      </section>

      <Section tone="blue" labelledBy="different-heading">
        <SectionHeading
          id="different-heading"
          eyebrow="What is different"
          title="The group forms by support, and the money is written down first."
        />
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {homeDifferences(name).map((item, i) => (
            <Reveal key={item.title} delay={i * 80} className="h-full">
              <article className="h-full rounded-2xl border border-ink-100 bg-white p-6">
                <h3 className="text-lg font-semibold text-ink-950">{item.title}</h3>
                <p className="mt-2 leading-7 text-ink-600">{item.body}</p>
              </article>
            </Reveal>
          ))}
        </div>
        <p className="mt-8 max-w-3xl text-sm leading-6 text-ink-600">
          This is not an employer, a recruitment agency, an investment or crowdfunding platform, or a job board. Income can only come from real products
          and services that customers pay for, and nobody earns anything from recruiting other people.
        </p>
      </Section>

      <JourneySteps tone="white" />

      <Section tone="gray" labelledBy="starters-heading">
        <SectionHeading
          id="starters-heading"
          eyebrow="Starting points"
          title="Ideas you can join on the first day."
          intro="These are starting points from the founder. They are not finished businesses. Members narrow them."
        />
        <div className="mt-12 grid gap-6 md:grid-cols-2">
          {STARTER_IDEAS.map((idea, i) => (
            <Reveal key={idea.key} delay={i * 80} className="h-full">
              <article className="flex h-full flex-col rounded-2xl border border-ink-100 bg-white p-6">
                <p className="text-sm font-semibold uppercase tracking-wider text-accent-700">{IDEA_CATEGORIES[idea.category]}</p>
                <h3 className="mt-3 text-lg font-semibold text-ink-950">{idea.title}</h3>
                <p className="mt-2 flex-1 leading-7 text-ink-600">{idea.summary}</p>
                <Link href="/join" className="mt-6 inline-flex items-center gap-1.5 font-semibold text-accent-700 hover:text-accent-800">
                  Join to support this or narrow it <IconArrow className="h-4 w-4" />
                </Link>
              </article>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* 3. Who can participate */}
      <Section labelledBy="who-heading">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <SectionHeading
            id="who-heading"
            eyebrow="Who can participate"
            title="Different backgrounds, one shared standard: reliability."
            intro="Professional qualifications are welcome but not required for every role."
          />
          <Link href="/participation" className="inline-flex shrink-0 items-center gap-1.5 font-semibold text-accent-700 hover:text-accent-800">
            Explore participation areas <IconArrow className="h-4 w-4" />
          </Link>
        </div>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {WHO.map((g, i) => (
            <Reveal key={g.title} delay={i * 120} className="h-full">
              <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-soft">
                <Photo
                  id={g.photo}
                  sizes="(min-width: 768px) 33vw, 100vw"
                  rounded="rounded-none"
                  fallback={<GlyphIcon name={g.glyph} className="h-12 w-12 text-accent-600" />}
                />
                <div className="flex-1 p-6">
                  <h3 className="text-lg font-semibold text-ink-950">{g.title}</h3>
                  <p className="mt-2 leading-7 text-ink-600">{g.body}</p>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </Section>

      <Section tone="gray" labelledBy="principles-heading">
        <SectionHeading id="principles-heading" eyebrow="Pay & fairness" title="You contribute work, never money." />
        <div className="mt-12 rounded-3xl border border-ink-100 bg-white p-6 sm:p-8">
          <h3 className="text-xl font-semibold text-ink-950">Your group decides. {name} takes nothing.</h3>
          <p className="mt-3 leading-7 text-ink-700">
            Participants never pay membership fees, registration fees, capital contributions, mandatory investments, deposits, or starter kits. Income
            comes only from real customers. Before commercial work begins, the members of each project agree in writing how its money is shared, and each
            of them accepts that agreement. {name} takes no commission, no percentage and no ownership share of project revenue.
          </p>
          <Link href="/compensation" className="mt-6 inline-flex items-center gap-1.5 font-semibold text-accent-700 hover:text-accent-800">
            How money works <IconArrow className="h-4 w-4" />
          </Link>
        </div>
      </Section>

      <section className="border-t border-ink-100 bg-white">
        <Container className="flex flex-col items-start gap-4 py-10 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-3xl leading-7 text-ink-700">
            <span className="font-semibold text-ink-950">{founding.title}. </span>
            {founding.body}
          </p>
          <ButtonLink href="/founding-contributors" variant="secondary">
            About founding contributors <IconArrow className="h-4 w-4" />
          </ButtonLink>
        </Container>
      </section>

      {/* 7. Final recruitment call to action */}
      <CtaBand />

      <section className="border-t border-ink-100 bg-white">
        <Container className="flex items-start gap-3 py-8 text-sm leading-6 text-ink-600">
          <IconDoc className="mt-0.5 h-5 w-5 shrink-0 text-ink-500" />
          <p>
            Transparency note: {brand().name} is a newly established online community in its founding stage. There is currently one founder, no
            established membership, no completed projects and no project revenue. {brand().name} is a brand and a community; its legal operator has not
            yet been formally established. We will not publish testimonials, results or opportunities that do not exist.
          </p>
        </Container>
      </section>
    </>
  );
}
