import { Photo } from "@/components/photos/photo";
import { CheckList, CtaBand } from "@/components/site/blocks";
import { IconArrow } from "@/components/ui/icons";
import { ButtonLink, Card, PageHeader, Section, SectionHeading } from "@/components/ui/primitives";
import { FoundationVisual } from "@/components/visuals/illustrations";
import { getSiteContent } from "@/lib/content";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata(
  "/founding-contributors",
  "Founding Contributors",
  "We are recruiting founding contributors to help establish a fully remote, collaborative working environment. No fees, flexible hours.",
);

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

      {/* Who we are looking for */}
      <Section tone="blue" labelledBy="looking-heading">
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
