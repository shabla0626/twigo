// What still has to be supplied before the public site may go live.
//
// The public pages never invent missing facts. Where a fact or a legally
// reviewed text is missing they show a bracketed, highlighted placeholder
// (<Placeholder> in src/components/ui/primitives.tsx). This file lists every
// one of them in one place, so the owner sees what is still open (admin
// overview, "Before launch") and a production start can check it.
//
// A test (tests/corrective-stage2-unit.test.ts) counts the placeholders in
// the page sources and fails when this list no longer matches them.

export type LaunchItem = {
  /** What is missing, in plain words. */
  what: string;
  /** The public pages on which the placeholder is shown. */
  pages: { label: string; href: string }[];
  /** How it gets resolved. */
  how: string;
};

const PRIVACY = { label: "Privacy Notice", href: "/privacy" };
const TERMS = { label: "Terms & Conditions", href: "/terms" };
const CONTACT = { label: "Contact", href: "/contact" };
const RULES = { label: "Community Rules", href: "/community-rules" };

/** Passages that need text from a lawyer. They are fixed in the page source and disappear only when that text is put in. */
export const TEXT_PLACEHOLDERS: LaunchItem[] = [
  { what: "Legal basis for processing personal data", pages: [PRIVACY], how: "Text from legal counsel for the applicable jurisdiction" },
  { what: "List of data processors and their locations", pages: [PRIVACY], how: "Known once hosting and the email provider are chosen" },
  { what: "Where data is stored and safeguards for transfers abroad", pages: [PRIVACY], how: "Known once hosting is chosen; wording from legal counsel" },
  { what: "Classification of participants (contractor, partner, member…)", pages: [TERMS], how: "Legal and tax advice" },
  { what: "Ownership of project work and confidentiality", pages: [TERMS], how: "Legal review" },
  { what: "Limitation of liability", pages: [TERMS], how: "Clause drafted by legal counsel" },
  { what: "Date the Community Rules were adopted", pages: [RULES], how: "Set when the rules are adopted" },
];

/** Everything still open, given the current settings. Empty = no placeholder is visible on the public site. */
export function outstandingLaunchItems(settings: { legalName: string; jurisdiction: string; contactEmail: string }): LaunchItem[] {
  const items: LaunchItem[] = [];
  if (!settings.legalName) items.push({ what: "Legal name of the organization", pages: [PRIVACY, TERMS], how: "Set ORG_LEGAL_NAME on the server" });
  if (!settings.jurisdiction) items.push({ what: "Governing law and jurisdiction", pages: [PRIVACY, TERMS], how: "Set ORG_JURISDICTION on the server" });
  if (!settings.contactEmail) items.push({ what: "Official contact email address", pages: [CONTACT, PRIVACY], how: "Set ORG_CONTACT_EMAIL on the server, or the contact address in Website content" });
  return [...items, ...TEXT_PLACEHOLDERS];
}

/** Number of <Placeholder> uses in the public pages that depend on a setting (for the consistency test). */
export const SETTING_PLACEHOLDER_USES = 6;
