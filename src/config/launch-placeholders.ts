// What still has to be decided or supplied before the public site may go live.
//
// The public pages never show an unfinished placeholder such as "[Company Name]": where a fact is not
// yet confirmed, they say so in plain words (for example "Not yet confirmed" on the Legal Notices
// page). This file turns the open points into one list for the owner (admin overview, "Before launch").

export type LaunchItem = {
  /** What is missing, in plain words. */
  what: string;
  /** Where it shows on the public site. */
  pages: { label: string; href: string }[];
  /** How it gets resolved. */
  how: string;
};

export type LaunchInputs = {
  /** Each legal document with the status of the version visitors see. */
  legalDocs: { key: string; title: string; status: string }[];
  /** Labels of legal-notice fields that are empty or not confirmed for publication. */
  unconfirmedNotices: string[];
  contactEmail: string;
};

const NOTICES = { label: "Legal notices", href: "/legal/notices" };
const CONTACT = { label: "Contact", href: "/contact" };

/** Everything still open. Empty means every document is published and every notice confirmed. */
export function outstandingLaunchItems(input: LaunchInputs): LaunchItem[] {
  const items: LaunchItem[] = [];
  for (const n of input.unconfirmedNotices) {
    items.push({ what: `${n} not confirmed`, pages: [NOTICES], how: "Fill it in and mark it confirmed under Admin, Legal, Legal notices" });
  }
  if (!input.contactEmail) items.push({ what: "Official contact email address", pages: [CONTACT], how: "Set ORG_CONTACT_EMAIL on the server, or the contact address in Website content" });
  for (const d of input.legalDocs) {
    if (d.status !== "PUBLISHED") {
      items.push({ what: `${d.title}: legal review and publication`, pages: [{ label: d.title, href: `/legal/${d.key}` }], how: "Have a lawyer review it; then mark it approved and publish it under Admin, Legal" });
    }
  }
  return items;
}
