// Single source of truth for organization branding.
// Change the name, tagline, domain, contact and sender details through
// environment variables (see .env.example); no source edits are needed.
// The logo mark is the component in src/components/site/logo.tsx.
//
// No `server-only` import: also read by the realtime server and CLI scripts.

export type Brand = {
  name: string;
  legalName: string;
  tagline: string;
  /** Short description used for SEO / social sharing defaults. */
  description: string;
  siteUrl: string;
  domain: string;
  contactEmail: string;
  jurisdiction: string;
  emailFromName: string;
  /** Theme color used by browsers (matches the bright public palette). */
  themeColor: string;
};

export function brand(): Brand {
  const e = process.env;
  const name = e.ORG_NAME || "CoWork";
  const siteUrl = e.SITE_URL || "http://localhost:3000";
  let domain = "";
  try {
    domain = new URL(siteUrl).host;
  } catch {
    domain = "";
  }
  return {
    name,
    legalName: e.ORG_LEGAL_NAME || "",
    tagline: e.ORG_TAGLINE || "Work Together. Create Value. Share the Results.",
    description:
      "A founding-stage, fully remote organization where members propose business ideas, form research groups and build legitimate projects together. No fees. No guaranteed income.",
    siteUrl,
    domain,
    contactEmail: e.ORG_CONTACT_EMAIL || "",
    jurisdiction: e.ORG_JURISDICTION || "",
    emailFromName: e.EMAIL_FROM_NAME || name,
    themeColor: "#f0f9fa",
  };
}
