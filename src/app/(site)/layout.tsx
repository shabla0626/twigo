import { SiteFooter } from "@/components/site/footer";
import { SiteHeader } from "@/components/site/header";
import { env } from "@/lib/env";
import { getSiteContent } from "@/lib/content";
import { anyPhotoAvailable } from "@/components/photos/photo";

// Pages are regenerated periodically and immediately when content is edited.
export const revalidate = 300;

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const content = await getSiteContent();
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only z-50 rounded-full bg-accent-700 px-4 py-2 text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to main content
      </a>
      <SiteHeader orgName={content.company.name} />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter
        orgName={content.company.name}
        tagline={content.company.tagline}
        email={content.contact.email}
        legalName={env().ORG_LEGAL_NAME}
        showPhotoNote={anyPhotoAvailable()}
      />
    </div>
  );
}
