import { Notice, PageHeader, Placeholder, Section } from "@/components/ui/primitives";
import { getSiteContent } from "@/lib/content";
import { env } from "@/lib/env";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata("/terms", "Terms and Conditions", "Terms governing use of this website and the application process.");

export default async function TermsPage() {
  const c = await getSiteContent();
  const e = env();
  const entity = e.ORG_LEGAL_NAME || <Placeholder>Legal entity name</Placeholder>;
  const jurisdiction = e.ORG_JURISDICTION || <Placeholder>Governing law and jurisdiction</Placeholder>;

  return (
    <>
      <PageHeader eyebrow="Legal" title="Terms and Conditions" intro="Draft for review" />
      <Section tone="gray">
        <div className="mx-auto max-w-3xl rounded-3xl border border-ink-100 bg-white p-6 shadow-soft sm:p-10">
          <Notice tone="warn" title="Draft: requires legal review">
            These terms are an initial draft. They have not been reviewed by a lawyer and are not claimed to be legally
            sufficient in any particular jurisdiction. Bracketed items must be completed before launch.
          </Notice>
          <div className="prose-body">
            <h2>1. About these terms</h2>
            <p>
              These terms govern your use of this website operated by {c.company.name} ({entity}). By using the website
              or submitting an application, you agree to them.
            </p>

            <h2>2. Nature of the organization</h2>
            <p>
              The organization coordinates remote, collaborative work on revenue-generating customer projects. It is not
              an investment scheme, membership program or employment agency. No fee, deposit, capital contribution or
              investment is required to apply or participate.
            </p>

            <h2>3. Applications</h2>
            <ul>
              <li>Submitting an application does not create an employment, contractor, partnership or other legal relationship.</li>
              <li>Submitting an application does not guarantee acceptance, project assignment or any compensation.</li>
              <li>You must provide accurate information and must not submit applications on behalf of others.</li>
            </ul>

            <h2>4. Project participation</h2>
            <p>
              Participation in any project is subject to a separate written agreement covering scope, responsibilities,
              deadlines, compensation, confidentiality, intellectual property and applicable conditions. No project work
              should begin before that agreement is in place. If there is a conflict, the project agreement prevails over
              these website terms.
            </p>
            <p>
              <Placeholder>Participant classification (e.g. independent contractor, partner, member), to be determined with legal and tax advice per jurisdiction.</Placeholder>
            </p>

            <h2>5. No guarantee of income</h2>
            <p>
              Nothing on this website is a promise of income, earnings, a minimum amount of work or specific results.
              Compensation depends on secured business opportunities, completed work, customer payment and the
              applicable written agreements.
            </p>

            <h2>6. Acceptable use</h2>
            <p>
              You must not misuse the website, including attempting to gain unauthorized access, submitting spam or
              automated submissions, or uploading malicious content.
            </p>

            <h2>7. Intellectual property and confidentiality</h2>
            <p>
              <Placeholder>Ownership of project work product and confidentiality obligations are defined in each project agreement, subject to legal review.</Placeholder>
            </p>

            <h2>8. Limitation of liability</h2>
            <p>
              <Placeholder>Limitation of liability clause to be drafted by legal counsel.</Placeholder>
            </p>

            <h2>9. Governing law</h2>
            <p>These terms are governed by the laws of {jurisdiction}.</p>

            <h2>10. Changes</h2>
            <p>We may update these terms. The current version is always available on this page.</p>
          </div>
        </div>
      </Section>
    </>
  );
}
