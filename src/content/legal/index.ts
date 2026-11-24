import { communityGuidelines, communitySupport, cookiePolicy, groupParticipation, intellectualProperty, participationCompensation } from "./policies";
import { privacy } from "./privacy";
import { privacyV2 } from "./privacy-v2";
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
  /** Version 1: the text every database starts with (the reviewed text; its fingerprint is locked by a test). */
  text: (name: string) => string;
  /**
   * Later versions prepared in a release (version 2, 3, ...). Each is added to a database as "Pending
   * legal review" once that database's latest version is exactly the previous text of this list, so a
   * version the owner wrote in the admin area is never overwritten or numbered over. Publishing it still
   * needs the owner's approval in Admin, Legal, after a legal review.
   */
  later?: { text: (name: string) => string; changeSummary: string; materialChange: boolean; requiresReacceptance: boolean }[];
};

export const LEGAL_DOCUMENTS: LegalDefinition[] = [
  { key: "terms", title: "Terms of Use", summary: "The rules for using the community: voluntary participation, no fees, no commission, ideas, groups and projects.", acceptance: "registration-accept", text: terms },
  {
    key: "privacy",
    title: "Privacy Policy",
    summary: "What information is collected, why, who can see it, how long it is kept, and your rights.",
    acceptance: "registration-ack",
    text: privacy,
    later: [
      {
        text: privacyV2,
        changeSummary:
          "Version 2: administrators can see a group's information only after a member's report and the owner's approval, for a limited time; how to ask for deletion of your account and personal data; backups; hosting and service providers described in general terms.",
        materialChange: true,
        requiresReacceptance: true,
      },
    ],
  },
  { key: "community-guidelines", title: "Community Guidelines", summary: "How members treat each other, what is not allowed, reporting, moderation and appeals.", acceptance: "registration-accept", text: communityGuidelines },
  { key: "intellectual-property", title: "Intellectual Property Policy", summary: "You keep what you bring and create; ideas are not transferred; projects agree ownership in writing.", acceptance: "none", text: intellectualProperty },
  { key: "participation-compensation", title: "Participation and Compensation Policy", summary: "Voluntary participation, no guaranteed income, and how participants decide project compensation.", acceptance: "none", text: participationCompensation },
  { key: "group-participation", title: "Group Participation Agreement", summary: "Purpose, membership, decisions, confidentiality, leaving and disputes in a project group. No financial obligation.", acceptance: "group", text: groupParticipation },
  { key: "cookies", title: "Cookie Policy", summary: "The two strictly necessary cookies and the one browser-storage use; no tracking.", acceptance: "none", text: cookiePolicy },
  { key: "community-support", title: "Community Support Policy", summary: "Voluntary financial support for the community: optional, separate from project earnings, no privileges.", acceptance: "none", text: communitySupport },
];

/**
 * Why a text cannot be approved or published yet (null when nothing stands in the way).
 *
 * A text that promises to add something "before publication" (for example the Privacy Policy, version 1:
 * "the hosting provider and server location ... will be named here before this policy is published") is
 * not finished: publishing it would make that sentence false. Such a text stays awaiting review until a
 * new version supplies the missing facts. Bracketed placeholders (a company name in square brackets, for example) are already
 * refused when a draft is edited (src/server/legal.ts).
 */
export function publicationProblem(content: string): string | null {
  const m = /[^.\n]*\bbefore (?:this (?:policy|document|text) is published|publication)\b[^.\n]*\./i.exec(content);
  return m ? `The text says something will be added before publication: “${m[0].trim()}” Supply those facts in a new version first.` : null;
}

/**
 * Version 1 was first stored with the summary "... Not reviewed by a lawyer." The review state is the
 * version's status, so that sentence is dropped from the summary when the version is approved (a published
 * version must not be listed next to a statement that it was never reviewed).
 */
export const withoutReviewDisclaimer = (summary: string | null) => (summary ? summary.replace(/\s*Not reviewed by a lawyer\.\s*$/i, "").trim() || null : summary);

export const REGISTRATION_ACCEPT: LegalKey[] = LEGAL_DOCUMENTS.filter((d) => d.acceptance === "registration-accept").map((d) => d.key);
export const REGISTRATION_ACK: LegalKey[] = LEGAL_DOCUMENTS.filter((d) => d.acceptance === "registration-ack").map((d) => d.key);
export const isLegalKey = (k: string): k is LegalKey => LEGAL_DOCUMENTS.some((d) => d.key === k);
export const legalDefinition = (k: LegalKey) => LEGAL_DOCUMENTS.find((d) => d.key === k)!;
