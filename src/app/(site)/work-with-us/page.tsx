import { CheckList } from "@/components/site/blocks";
import { Card, PageHeader, Section, SectionHeading } from "@/components/ui/primitives";
import { MessageVisual } from "@/components/visuals/illustrations";
import { issueFormToken } from "@/lib/security";
import { pageMetadata } from "@/lib/seo";
import { ContactForm } from "../contact/contact-form";

export const metadata = pageMetadata(
  "/work-with-us",
  "Work with us",
  "Businesses and organizations can describe a need. We will reply honestly about whether our founding-stage team can help.",
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
        intro="We are a founding-stage, fully remote organization. We do not yet have an established service catalog or a list of past clients, so we would rather start with an honest conversation about your need."
      />
      <Section>
        <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
          <div>
            <SectionHeading eyebrow="How it works" title="An honest first conversation" />
            <div className="mt-6">
              <CheckList
                items={[
                  "Describe the problem, the result you need and your timeline.",
                  "We review it and tell you plainly whether our members currently have the skills and capacity to help.",
                  "If there is a fit, we propose scope, price and responsibilities in writing before any work begins.",
                  "If there is not a fit, we tell you so. We do not take on work we cannot deliver well.",
                ]}
              />
            </div>
            <Card className="mt-8">
              <h2 className="text-base font-semibold text-ink-950">What to expect at this stage</h2>
              <p className="mt-2 text-sm leading-6 text-ink-600">
                The organization was founded recently by one person and is building its team of remote members. We cannot promise availability or
                turnaround times before reviewing your request. Your message is read by a person and is never shared outside the organization.
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
