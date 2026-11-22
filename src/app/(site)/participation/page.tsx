import { Photo } from "@/components/photos/photo";
import { CheckList } from "@/components/site/blocks";
import { Badge, Card, cn, Notice, PageHeader, Section, SectionHeading } from "@/components/ui/primitives";
import { CATEGORY_GLYPHS, GlyphIcon } from "@/components/visuals/glyphs";
import { OrbitVisual } from "@/components/visuals/illustrations";
import { Reveal } from "@/components/visuals/reveal";
import { CATEGORY_PHOTO_IDS } from "@/content/photos";
import { getSiteContent } from "@/lib/content";
import { WORK_CATEGORIES } from "@/lib/labels";
import { pageMetadata } from "@/lib/seo";
import { getPublishedOpportunities } from "@/server/public";

export const metadata = pageMetadata(
  "/participation",
  "Participation Opportunities",
  "Areas where remote contributors may collaborate: technology, AI and data, research, marketing, support, operations and general remote work.",
);

const FEATURED_INDEX = 6; // "General Remote Work" in the default category order

export default async function ParticipationPage() {
  const [c, opportunities] = await Promise.all([getSiteContent(), getPublishedOpportunities()]);
  return (
    <>
      <PageHeader
        eyebrow="Participation"
        title="Ways to contribute"
        intro="These are the areas where we expect collaborative projects to need people. They describe potential work, not confirmed vacancies."
        visual={
          <Photo
            id="participation-header"
            priority
            sizes="(min-width: 1024px) 45vw, 100vw"
            className="shadow-soft-lg ring-1 ring-ink-100"
            fallback={<OrbitVisual className="w-full max-w-xs" />}
          />
        }
      />

      {/* Collaboration areas */}
      <Section tone="blue" labelledBy="areas-heading">
        <SectionHeading
          id="areas-heading"
          eyebrow="Collaboration areas"
          title="Specialist skills and everyday abilities are both needed."
          intro="You can indicate one or several areas in your application."
        />
        <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {c.categories.items.map((cat, i) => {
            const photoId = CATEGORY_PHOTO_IDS[i];
            const glyph = CATEGORY_GLYPHS[i % CATEGORY_GLYPHS.length]!;
            const featured = i === FEATURED_INDEX;
            const media = photoId ? (
              <Photo
                id={photoId}
                sizes={featured ? "(min-width: 1024px) 40vw, 100vw" : "(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"}
                rounded="rounded-none"
                className={featured ? "md:h-full" : undefined}
                fallback={<GlyphIcon name={glyph} className="h-12 w-12 text-accent-600" />}
              />
            ) : (
              <div className="flex aspect-[4/3] items-center justify-center bg-gradient-to-br from-sky-50 to-accent-50">
                <GlyphIcon name={glyph} className="h-12 w-12 text-accent-600" />
              </div>
            );
            return (
              <Reveal key={cat.title} delay={(i % 3) * 100} className={cn("h-full", featured && "md:col-span-2 lg:col-span-3")}>
                <article
                  className={cn(
                    "group flex h-full flex-col overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-soft transition duration-300 hover:-translate-y-1 hover:border-accent-200 hover:shadow-soft-lg",
                    featured && "md:grid md:grid-cols-[1fr_1.2fr]",
                  )}
                >
                  {media}
                  <div className={cn("flex-1 p-6", featured && "md:flex md:flex-col md:justify-center md:p-10")}>
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-100 text-accent-800">
                      <GlyphIcon name={glyph} className="h-5 w-5" />
                    </span>
                    {featured && <Badge tone="accent">No specialist background needed</Badge>}
                    <h3 className={cn("mt-4 font-semibold text-ink-950", featured ? "text-2xl" : "text-lg")}>{cat.title}</h3>
                    <p className="mt-2 leading-7 text-ink-600">{cat.description}</p>
                    {cat.examples && <p className="mt-3 text-sm leading-6 text-ink-600">Examples: {cat.examples}</p>}
                  </div>
                </article>
              </Reveal>
            );
          })}
        </div>
      </Section>

      {/* General capabilities are valued */}
      <Section labelledBy="welcome-heading">
        <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
          <div>
            <SectionHeading
              id="welcome-heading"
              eyebrow="Everyone can contribute"
              title="Willingness to learn counts."
              intro="You do not need specialized professional qualifications for every role. Reliable people who are willing to learn can start with suitable entry-level tasks and take on more responsibility over time."
            />
          </div>
          <div className="space-y-6">
            <div className="rounded-2xl border border-ink-100 bg-ink-50 p-6">
              <h3 className="font-semibold text-ink-950">What matters most</h3>
              <div className="mt-4">
                <CheckList items={["Reliability and honest communication", "Care and quality in assigned tasks", "Consistent participation within your availability", "Willingness to learn and improve"]} />
              </div>
            </div>
            <Notice title="About training">
              We do not currently offer formal or paid training programs. Guidance is provided within projects where practical.
              If structured training becomes available, it will be announced on this website.
            </Notice>
          </div>
        </div>
      </Section>

      {/* Current opportunities */}
      <Section tone="gray" labelledBy="current-heading">
        <SectionHeading id="current-heading" eyebrow="Confirmed work only" title="Current opportunities" />
        <div className="mt-8">
          {opportunities.length === 0 ? (
            <Notice>
              There are no confirmed project opportunities published at the moment. The organization is recruiting its founding
              contributors first. You are welcome to apply; we will contact suitable applicants when real opportunities become
              available.
            </Notice>
          ) : (
            <ul className="grid gap-6 md:grid-cols-2">
              {opportunities.map((o) => (
                <li key={o.id}>
                  <Card className="h-full">
                    <div className="flex flex-wrap items-center gap-2">
                      {o.category && <Badge tone="accent">{WORK_CATEGORIES[o.category]}</Badge>}
                      <Badge>{o.statusLabel}</Badge>
                    </div>
                    <h3 className="mt-3 text-lg font-semibold text-ink-950">{o.title}</h3>
                    {o.publicSummary && <p className="mt-2 leading-7 text-ink-600">{o.publicSummary}</p>}
                    {o.roles.length > 0 && (
                      <div className="mt-4">
                        <p className="text-sm font-semibold text-ink-900">Roles needed</p>
                        <ul className="mt-2 space-y-1 text-sm text-ink-600">
                          {o.roles.map((r) => (
                            <li key={r.title}>
                              {r.title}
                              {r.skills.length > 0 && <span className="text-ink-500"> · {r.skills.join(", ")}</span>}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Section>
    </>
  );
}
