import { Photo, photoAvailable } from "@/components/photos/photo";
import { CheckList, CtaBand } from "@/components/site/blocks";
import { IconArrow, IconCheck } from "@/components/ui/icons";
import { ButtonLink, Card, PageHeader, Section, SectionHeading } from "@/components/ui/primitives";
import { Avatar } from "@/components/visuals/glyphs";
import { FoundationVisual } from "@/components/visuals/illustrations";
import { Reveal } from "@/components/visuals/reveal";
import type { PhotoId } from "@/content/photos";
import { getSiteContent } from "@/lib/content";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata(
  "/founding-contributors",
  "Founding Contributors",
  "We are recruiting founding contributors to help establish a fully remote, collaborative working environment. No fees, flexible hours.",
);

const PORTRAITS: { id: PhotoId; skin: string; shirt: string; bg: string }[] = [
  { id: "founding-person-1", skin: "#e0ac83", shirt: "#5fb7c2", bg: "#e0f2fe" },
  { id: "founding-person-2", skin: "#5a3a28", shirt: "#f3d08a", bg: "#fef3c7" },
  { id: "founding-person-3", skin: "#f6d8bd", shirt: "#c3b4ee", bg: "#ede9fe" },
];

const EMPHASIS = [
  ["Remote participation", "Work from wherever you are. No office required."],
  ["Flexible availability", "Fit your contribution around your current job."],
  ["Different backgrounds", "Professionals and general contributors are both welcome."],
  ["Responsibility & commitment", "Reliable, honest participation matters most."],
  ["Shared business development", "Help shape processes, standards and first projects."],
  ["No fees, ever", "No membership fees or initial capital contributions."],
] as const;

export default async function FoundingContributorsPage() {
  const c = await getSiteContent();
  return (
    <>
      <PageHeader
        eyebrow="Founding contributors"
        title="Help build the organization from the ground up"
        intro={c.announcement.body}
        actions={
          <>
            <ButtonLink href="/join" size="lg">
              Join as a founding contributor <IconArrow className="h-5 w-5" />
            </ButtonLink>
            <ButtonLink href="/how-it-works" variant="secondary" size="lg">
              How it works
            </ButtonLink>
          </>
        }
        visual={
          <Photo
            id="founding-header"
            priority
            sizes="(min-width: 1024px) 45vw, 100vw"
            className="shadow-soft-lg ring-1 ring-ink-100"
            fallback={<FoundationVisual className="w-full max-w-xs" />}
          />
        }
      />

      {/* Honest invitation */}
      <Section labelledBy="invitation-heading">
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
          <div>
            <SectionHeading id="invitation-heading" eyebrow="An honest invitation" title="Joining now means joining at the very beginning." />
            <div className="mt-5 space-y-4 text-lg leading-8 text-ink-700">
              <p>
                There is no established team to slot into and no list of paid projects waiting. Founding contributors help
                shape how the organization works: its processes, standards and first projects.
              </p>
              <p>
                That also means patience. It will take time to secure and deliver the first real projects, and we cannot say
                exactly when paid work will be available for each person.
              </p>
            </div>
          </div>
          <div className="rounded-3xl border border-ink-100 bg-ink-50 p-6 sm:p-8">
            <h3 className="text-lg font-semibold text-ink-950">What founding contributors can expect</h3>
            <div className="mt-5">
              <CheckList
                items={[
                  "Fully remote participation from wherever you are",
                  "Flexible availability that fits around your current job",
                  "A place for different levels of professional experience",
                  "A real say in how the organization develops",
                  "Shared responsibility and honest communication",
                  "Fair, written compensation terms before any project work",
                  "No joining fees, capital contributions or investments, ever",
                ]}
              />
            </div>
          </div>
        </div>
      </Section>

      {/* People we welcome */}
      <Section tone="blue" labelledBy="welcome-heading">
        <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
          <div>
            <div className="grid grid-cols-3 gap-3 sm:gap-4">
              {PORTRAITS.map((p, i) => (
                <Reveal key={p.id} delay={i * 120} className={i === 1 ? "translate-y-6" : undefined}>
                  <Photo
                    id={p.id}
                    sizes="(min-width: 1024px) 18vw, 33vw"
                    className="shadow-soft"
                    fallback={
                      <svg viewBox="-40 -40 80 80" className="w-3/4" aria-hidden="true">
                        <Avatar skin={p.skin} shirt={p.shirt} bg={p.bg} r={36} />
                      </svg>
                    }
                  />
                </Reveal>
              ))}
            </div>
            {PORTRAITS.some((p) => photoAvailable(p.id)) && (
              <p className="mt-10 text-sm text-ink-600">
                Illustrative photographs showing the kinds of people we welcome. They are not members of the organization.
              </p>
            )}
          </div>
          <div>
            <SectionHeading
              id="welcome-heading"
              eyebrow="People we welcome"
              title="Ordinary people with different abilities."
              intro="Whatever your age, background or level of experience, there may be a useful role for you."
            />
            <ul className="mt-8 grid gap-4 sm:grid-cols-2">
              {EMPHASIS.map(([t, b]) => (
                <li key={t} className="flex gap-3">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-100 text-accent-800">
                    <IconCheck className="h-4 w-4" />
                  </span>
                  <span>
                    <span className="block font-semibold text-ink-950">{t}</span>
                    <span className="block text-sm leading-6 text-ink-600">{b}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      {/* Who we are looking for */}
      <Section labelledBy="looking-heading">
        <SectionHeading
          id="looking-heading"
          eyebrow="Who we are looking for"
          title="Suitability matters more than numbers."
          intro="We care more about the suitability of a few people than the number of applications."
        />
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ["Reliable", "You do what you say you will do, and you say early when you can't."],
            ["Responsible", "You take ownership of your tasks and their quality."],
            ["Motivated", "You are interested in building something collaborative, not just finding a gig."],
            ["Capable of real work", "Professional or general skills you can apply to actual assigned tasks."],
            ["Cooperative", "You communicate honestly and work well with people from different backgrounds."],
            ["Available remotely", "You have some regular time each week and can collaborate online."],
          ].map(([t, b]) => (
            <Card key={t}>
              <h3 className="font-semibold text-ink-950">{t}</h3>
              <p className="mt-2 leading-7 text-ink-600">{b}</p>
            </Card>
          ))}
        </div>
      </Section>

      <CtaBand
        title="Ready to help build it?"
        body="Applying takes about 10 minutes and costs nothing. Every application is reviewed by a person; submitting one does not guarantee acceptance, project assignment or income."
      />
    </>
  );
}
