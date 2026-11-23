import { communityGuidelines, communitySupport, cookiePolicy, groupParticipation, intellectualProperty, participationCompensation } from "./policies";
import { privacy } from "./privacy";
import { terms } from "./terms";

/**
 * The legal documents of the site. Version 1 of each is created in the database from these texts
 * the first time it is needed, with the status PENDING_LEGAL_REVIEW (never APPROVED: only the owner
 * can mark a version approved, after a real legal review).
 *
 * `acceptance` says where a person agrees to the document:
 *   registration-accept  ticked at sign-up (a contract term)
 *   registration-ack     acknowledged at sign-up (read and understood; not consent)
 *   group                accepted when joining a group or supporting an idea (founding a group)
 *   none                 informational; part of another document by reference
 */
export type LegalKey = "terms" | "privacy" | "community-guidelines" | "intellectual-property" | "participation-compensation" | "cookies" | "group-participation" | "community-support";

export type LegalDefinition = {
  key: LegalKey;
  title: string;
  summary: string;
  acceptance: "registration-accept" | "registration-ack" | "group" | "none";
  text: (name: string) => string;
};

export const LEGAL_DOCUMENTS: LegalDefinition[] = [
  { key: "terms", title: "Terms of Use", summary: "The rules for using the community: voluntary participation, no fees, no commission, ideas, groups and projects.", acceptance: "registration-accept", text: terms },
  { key: "privacy", title: "Privacy Policy", summary: "What information is collected, why, who can see it, how long it is kept, and your rights.", acceptance: "registration-ack", text: privacy },
  { key: "community-guidelines", title: "Community Guidelines", summary: "How members treat each other, what is not allowed, reporting, moderation and appeals.", acceptance: "registration-accept", text: communityGuidelines },
  { key: "intellectual-property", title: "Intellectual Property Policy", summary: "You keep what you bring and create; ideas are not transferred; projects agree ownership in writing.", acceptance: "none", text: intellectualProperty },
  { key: "participation-compensation", title: "Participation and Compensation Policy", summary: "Voluntary participation, no guaranteed income, and how participants decide project compensation.", acceptance: "none", text: participationCompensation },
  { key: "group-participation", title: "Group Participation Agreement", summary: "Purpose, membership, decisions, confidentiality, leaving and disputes in a project group. No financial obligation.", acceptance: "group", text: groupParticipation },
  { key: "cookies", title: "Cookie Policy", summary: "The two strictly necessary cookies and the one browser-storage use; no tracking.", acceptance: "none", text: cookiePolicy },
  { key: "community-support", title: "Community Support Policy", summary: "Voluntary financial support for the community: optional, separate from project earnings, no privileges.", acceptance: "none", text: communitySupport },
];

export const REGISTRATION_ACCEPT: LegalKey[] = LEGAL_DOCUMENTS.filter((d) => d.acceptance === "registration-accept").map((d) => d.key);
export const REGISTRATION_ACK: LegalKey[] = LEGAL_DOCUMENTS.filter((d) => d.acceptance === "registration-ack").map((d) => d.key);
export const isLegalKey = (k: string): k is LegalKey => LEGAL_DOCUMENTS.some((d) => d.key === k);
export const legalDefinition = (k: LegalKey) => LEGAL_DOCUMENTS.find((d) => d.key === k)!;
