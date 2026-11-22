import Link from "next/link";
import { Card, PageHeader, Placeholder, Section } from "@/components/ui/primitives";
import { getSiteContent } from "@/lib/content";
import { issueFormToken } from "@/lib/security";
import { pageMetadata } from "@/lib/seo";
import { ContactForm } from "./contact-form";
import { MessageVisual } from "@/components/visuals/illustrations";
import { Photo } from "@/components/photos/photo";

export const metadata = pageMetadata(
  "/contact",
  "Contact",
  "Contact the organization about participating, business inquiries or general questions.",
);

export const dynamic = "force-dynamic";

export default async function ContactPage() {
  const c = await getSiteContent();
  return (
    <>
      <PageHeader
        visualSize="sm"
        visual={
          <Photo
            id="contact-header"
            priority
            sizes="(min-width: 1024px) 24rem, 100vw"
            className="shadow-soft ring-1 ring-ink-100"
            fallback={<MessageVisual className="w-full max-w-[16rem]" />}
          />
        }
        eyebrow="Contact"
        title="Get in touch"
        intro="Questions about participating, a potential business project, or anything else? Send us a message."
      />
      <Section tone="blue">
        <div className="grid gap-8 lg:grid-cols-[1.5fr_1fr] lg:gap-12">
          <div className="rounded-3xl border border-ink-100 bg-white p-6 shadow-soft sm:p-8">
            <h2 className="mb-6 text-xl font-semibold text-ink-950">Send us a message</h2>
            <ContactForm formToken={issueFormToken()} />
          </div>
          <aside className="space-y-6">
            <Card>
              <h2 className="text-base font-semibold">Email</h2>
              <p className="mt-2">
                {c.contact.email ? (
                  <a href={`mailto:${c.contact.email}`} className="font-medium text-accent-700 underline">
                    {c.contact.email}
                  </a>
                ) : (
                  <Placeholder>Official contact email to be confirmed</Placeholder>
                )}
              </p>
              {c.contact.responseNote && <p className="mt-3 text-sm leading-6 text-ink-600">{c.contact.responseNote}</p>}
            </Card>
            <Card>
              <h2 className="text-base font-semibold">Business inquiries</h2>
              <p className="mt-2 text-sm leading-6 text-ink-600">
                If you have a project you would like a remote team to deliver, choose &ldquo;Business inquiry&rdquo; and
                describe what you need. We will respond honestly about whether we can take it on.
              </p>
            </Card>
            <Card>
              <h2 className="text-base font-semibold">Want to participate?</h2>
              <p className="mt-2 text-sm leading-6 text-ink-600">
                The best way is to{" "}
                <Link href="/join" className="text-accent-700 underline">
                  create a free account and apply
                </Link>
                , so we
                have the information needed to review it.
              </p>
            </Card>
          </aside>
        </div>
      </Section>
    </>
  );
}
