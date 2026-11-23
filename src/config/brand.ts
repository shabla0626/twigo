// Single source of truth for organization branding.
// Change the name, tagline, domain, contact and sender details through
// environment variables (see .env.example); no source edits are needed.
// The logo mark is the component in src/components/site/logo.tsx.
//
// No `server-only` import: also read by the realtime server and CLI scripts.

export type Brand = {
  name: string;
  /** What kind of organization it is, in a few words ("An Online Collaborative Community"). */
  identity: string;
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
  const name = e.ORG_NAME || "Twigo";
  const siteUrl = e.SITE_URL || "http://localhost:3000";
  let domain = "";
  try {
    domain = new URL(siteUrl).host;
  } catch {
    domain = "";
  }
  return {
    name,
    identity: "An Online Collaborative Community",
    legalName: e.ORG_LEGAL_NAME || "",
    // The founder's approved slogan, kept word for word.
    tagline: e.ORG_TAGLINE || "Together We Innovate, Grow & Opportunity",
    description: `${name} is an independent, remote-first online collaborative community where people come together to propose ideas, develop business opportunities, form voluntary project groups, and pursue income through meaningful contributions and cooperation. No fees. No guaranteed income.`,
    siteUrl,
    domain,
    contactEmail: e.ORG_CONTACT_EMAIL || "",
    jurisdiction: e.ORG_JURISDICTION || "",
    emailFromName: e.EMAIL_FROM_NAME || name,
    themeColor: "#f0f9fa",
  };
}
