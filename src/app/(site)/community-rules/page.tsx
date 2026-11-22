import { PageHeader, Placeholder, Section } from "@/components/ui/primitives";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata("/community-rules", "Community rules", "Rules and code of conduct for members of the collaboration community.");

const RULES: [string, string[]][] = [
  [
    "1. What the community is for",
    [
      "Members propose, discuss and research ideas for legitimate business activities that create real value for paying customers.",
      "Ideas, endorsements and research groups are voluntary exploration. They are not companies, jobs, or approved commercial projects.",
      "Paid project work only starts after the organization approves a project and the people involved sign a written agreement with clear compensation terms.",
    ],
  ],
  [
    "2. Money: what is never allowed",
    [
      "No one may ask members for membership fees, joining fees, deposits, “training” payments, capital contributions or investments, for any reason.",
      "No recruitment-based earnings, pyramid or multi-level schemes, or offers that pay for bringing in new members.",
      "No requests for banking details, Social Security numbers, identity documents or passwords.",
      "If anyone asks you for money or financial details, do not pay and report it immediately.",
    ],
  ],
  [
    "3. Respect and honesty",
    [
      "Be respectful. Disagreement about ideas is welcome; personal attacks, harassment and discrimination are not.",
      "Do not exaggerate. Do not promise income, profits or results you cannot support.",
      "Share credit fairly and say early when you cannot do what you agreed to do.",
    ],
  ],
  [
    "4. Confidentiality and intellectual property",
    [
      "Do not post confidential information from your employer, clients or anyone else.",
      "Private group content (chat, files, research notes) stays inside the group. Do not copy it outside without the group’s agreement.",
      "Ownership of work product from paid projects is set out in each project’s written agreement. Draft terms are under legal review.",
    ],
  ],
  [
    "5. Privacy",
    [
      "Only share personal information about yourself that you are comfortable with other members seeing.",
      "Never share another member’s contact details or private messages without their permission.",
      "Meetings are held in Google Meet. Do not record a meeting without the clear consent of everyone present.",
    ],
  ],
  [
    "6. Lawful activity only",
    ["Ideas and projects must be legal where the organization and its customers operate. Ideas involving deception, gambling, unlicensed financial services or regulated activities without the required licenses are not allowed."],
  ],
  [
    "7. Moderation",
    [
      "Use the Report button on any idea, comment, discussion, message, group or profile. Reports go to the organization’s administrators.",
      "Administrators may remove content, suspend groups or suspend accounts that break these rules. Significant actions are recorded.",
      "Administrators do not browse private group chats. They see a chat message only when a member reports it.",
    ],
  ],
];

export default function CommunityRulesPage() {
  return (
    <>
      <PageHeader eyebrow="Members" title="Community rules and code of conduct" intro="These rules apply to everyone in the member community, including the founder and administrators." />
      <Section>
        <div className="prose-body mx-auto max-w-3xl">
          {RULES.map(([title, items]) => (
            <div key={title}>
              <h2>{title}</h2>
              <ul>
                {items.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </div>
          ))}
          <p className="mt-8 text-sm text-ink-500">
            Draft for legal review. Version <Placeholder>date of adoption</Placeholder>.
          </p>
        </div>
      </Section>
    </>
  );
}
