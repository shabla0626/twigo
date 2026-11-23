import { CheckList } from "@/components/site/blocks";
import { Card, PageHeader, Section, SectionHeading } from "@/components/ui/primitives";
import { MessageVisual } from "@/components/visuals/illustrations";
import { issueFormToken } from "@/lib/security";
import { pageMetadata } from "@/lib/seo";
import { ContactForm } from "../contact/contact-form";

export const metadata = pageMetadata(
  "/work-with-us",
  "Work with us",
  "Businesses and organizations can describe a need. We will reply honestly about whether members of the community may be able to help.",
);

export const dynamic = "force-dynamic";

export default function WorkWithUsPage() {
  return (
    <>
      <PageHeader
        visualSize="sm"
        visual={<MessageVisual className="w-full max-w-[16rem]" />}
        eyebrow="For businesses and organizations"
        title="Tell us what you need"
        intro="This is an online collaborative community in its founding stage, not an agency. We do not have a service catalog or a list of past clients, so we would rather start with an honest conversation about your need."
      />
      <Section>
        <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
          <div>
            <SectionHeading eyebrow="How it works" title="An honest first conversation" />
            <div className="mt-6">
              <CheckList
                items={[
                  "Describe the problem, the result you need and your timeline.",
                  "We read it and tell you plainly whether members with the right skills are active in the community.",
                  "If members are interested, we put you in touch, with your agreement. You and those members agree scope, price and responsibilities in writing before any work begins.",
                  "The platform is not a party to that contract and takes no commission.",
                  "If there is no fit, we tell you so.",
                ]}
              />
            </div>
            <Card className="mt-8">
              <h2 className="text-base font-semibold text-ink-950">What to expect at this stage</h2>
              <p className="mt-2 text-sm leading-6 text-ink-600">
                The community was founded recently by one person and is welcoming its first members. We cannot promise availability or turnaround
                times. Your message is read by a person and is not shared with members without your agreement.
              </p>
            </Card>
          </div>
          <div className="rounded-3xl border border-ink-100 bg-white p-6 shadow-soft sm:p-8">
            <h2 className="mb-6 text-xl font-semibold text-ink-950">Describe your need</h2>
            <ContactForm formToken={issueFormToken()} business />
          </div>
        </div>
      </Section>
    </>
  );
}
