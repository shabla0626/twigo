import Link from "next/link";
import { Photo } from "@/components/photos/photo";
import { SplitSection } from "@/components/photos/layouts";
import { CheckList, CtaBand, FaqList } from "@/components/site/blocks";
import { JourneySteps } from "@/components/site/community-model";
import { IconArrow, IconCheck, IconDoc } from "@/components/ui/icons";
import { ButtonLink, Container, Section, SectionHeading } from "@/components/ui/primitives";
import { GlyphIcon, type GlyphName } from "@/components/visuals/glyphs";
import { HeroNetwork } from "@/components/visuals/hero-network";
import { AbilitiesVisual, FoundationVisual } from "@/components/visuals/illustrations";
import { Reveal } from "@/components/visuals/reveal";
import type { PhotoId } from "@/content/photos";
import { brand } from "@/config/brand";
import { getSiteContent } from "@/lib/content";

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
    body: "People who want to build new capabilities, starting with suitable entry-level assignments and taking on more as they gain experience.",
  },
];

export default async function HomePage() {
  const c = await getSiteContent();
  const founding = c.announcement.enabled
    ? c.announcement
    : {
        title: "We are recruiting our founding contributors",
        body: "The organization is at its very beginning. We are looking for responsible, motivated people who want to help build a collaborative working environment.",
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
              {["No membership fees", "Fully remote", "Terms agreed in writing"].map((t) => (
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

      {/* 1. Our mission */}
      <SplitSection
        id="mission"
        tone="blue"
        eyebrow="Our mission"
        title="Accomplish together what is hard to accomplish alone."
        mediaSide="left"
        media={
          <Photo
            id="home-mission"
            sizes="(min-width: 1024px) 40vw, 100vw"
            className="mx-auto max-w-md lg:max-w-none"
            fallback={<AbilitiesVisual className="w-full max-w-xs" />}
          />
        }
      >
        <p>{c.company.mission}</p>
        <p>
          Many capable people want to earn additional income but find it hard to build a business alone. Working as a team, members can take on work that
          no single person could deliver.
        </p>
        <p className="text-base text-ink-600">
          This is not an investment club, a recruitment scheme or a job board. Income comes only from real products and services for real customers, and
          nobody earns anything from recruiting other people.
        </p>
      </SplitSection>

      {/* 2. How it works: one journey */}
      <JourneySteps tone="white" />

      {/* 3. Who can participate */}
      <Section tone="gray" labelledBy="who-heading">
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

      {/* 5. Fair contribution-based compensation */}
      <Section labelledBy="principles-heading">
        <SectionHeading id="principles-heading" eyebrow="Pay & fairness" title="You contribute work, never money." />
        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          <div className="rounded-3xl border border-ink-100 bg-ink-50 p-6 sm:p-8">
            <h3 className="text-xl font-semibold text-ink-950">No financial entry requirements</h3>
            <p className="mt-3 leading-7 text-ink-700">Participants are never required to pay:</p>
            <ul className="mt-4 grid gap-2 text-ink-800 sm:grid-cols-2">
              {["Membership fees", "Registration or joining fees", "Capital contributions", "Mandatory investments", "Deposits for project access", "Paid “starter kits” of any kind"].map((x) => (
                <li key={x} className="flex gap-2">
                  <span aria-hidden="true" className="font-semibold text-accent-700">
                    ✕
                  </span>
                  {x}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-3xl border border-accent-100 bg-accent-50 p-6 sm:p-8">
            <h3 className="text-xl font-semibold text-ink-950">Compensation from real work</h3>
            <p className="mt-3 leading-7 text-ink-700">
              Compensation comes from actual customer revenue and follows terms agreed in writing before each project begins,
              considering the work performed, time invested, complexity, responsibility and quality.
            </p>
            <p className="mt-4 font-medium leading-7 text-ink-800">We do not promise guaranteed income, guaranteed projects or guaranteed earnings.</p>
            <Link href="/compensation" className="mt-6 inline-flex items-center gap-1.5 font-semibold text-accent-700 hover:text-accent-800">
              How pay works <IconArrow className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </Section>

      {/* 6. Founding contributor opportunities */}
      <SplitSection
        id="founding"
        tone="gray"
        eyebrow="Founding contributor opportunities"
        title={founding.title}
        media={
          <Photo
            id="home-founding"
            sizes="(min-width: 1024px) 45vw, 100vw"
            fallback={<FoundationVisual className="w-full max-w-xs" />}
          />
        }
      >
        <p>{founding.body}</p>
        <div className="text-base">
          <CheckList items={["An honest picture of where things stand today", "A say in how the organization works", "Remote, flexible participation"]} />
        </div>
        <div className="pt-2">
          <ButtonLink href="/founding-contributors">
            About founding contributors <IconArrow className="h-4 w-4" />
          </ButtonLink>
        </div>
      </SplitSection>

      {/* FAQ preview */}
      <Section labelledBy="faq-heading">
        <div className="grid gap-10 lg:grid-cols-[1fr_2fr]">
          <div>
            <SectionHeading id="faq-heading" eyebrow="FAQ" title="Common questions" />
            <Link href="/faq" className="mt-6 inline-flex items-center gap-1.5 font-semibold text-accent-700 hover:text-accent-800">
              All questions <IconArrow className="h-4 w-4" />
            </Link>
          </div>
          <FaqList items={c.faq.items.slice(0, 3)} />
        </div>
      </Section>

      {/* 7. Final recruitment call to action */}
      <CtaBand />

      <section className="border-t border-ink-100 bg-white">
        <Container className="flex items-start gap-3 py-8 text-sm leading-6 text-ink-600">
          <IconDoc className="mt-0.5 h-5 w-5 shrink-0 text-ink-500" />
          <p>
            Transparency note: the organization is in its founding stage. There is currently one founder, no established team
            and no completed client projects. We will not publish testimonials, results or opportunities that do not exist.
          </p>
        </Container>
      </section>
    </>
  );
}
