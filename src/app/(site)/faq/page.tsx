import { FaqList } from "@/components/site/blocks";
import { PageHeader, Section } from "@/components/ui/primitives";
import { getSiteContent } from "@/lib/content";
import { pageMetadata } from "@/lib/seo";
import { ConversationVisual } from "@/components/visuals/illustrations";
import { Photo } from "@/components/photos/photo";

export const metadata = pageMetadata(
  "/faq",
  "Frequently Asked Questions",
  "Honest answers about fees, experience requirements, remote work, project assignment and how compensation is determined.",
);

export default async function FaqPage() {
  const c = await getSiteContent();
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: c.faq.items.map((i) => ({ "@type": "Question", name: i.q, acceptedAnswer: { "@type": "Answer", text: i.a } })),
  };
  return (
    <>
      <PageHeader
        visualSize="sm"
        visual={
          <Photo
            id="faq-header"
            priority
            sizes="(min-width: 1024px) 24rem, 100vw"
            className="shadow-soft ring-1 ring-ink-100"
            fallback={<ConversationVisual className="w-full max-w-[16rem]" />}
          />
        }
        eyebrow="FAQ"
        title="Frequently asked questions"
        intro="If your question isn't answered here, please get in touch through the contact page."
      />
      <Section tone="gray">
        <div className="mx-auto max-w-4xl">
          <FaqList items={c.faq.items} />
        </div>
      </Section>
      <script
        type="application/ld+json"
        // JSON.stringify output with "<" escaped cannot break out of the script tag.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
    </>
  );
}
