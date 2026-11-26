import type { IdeaCategory } from "@prisma/client";

/** The public subheadline before this revision. A saved copy of it is upgraded on read. */
export const PREVIOUS_HERO_SUBHEADLINE =
  "Bring your ideas, skills, experience, and determination. Connect with other people, build project groups, explore opportunities, and create value through cooperation.";

/** The sentence under the founder's slogan. The slogan itself stays as the headline. */
export function heroSubheadline(name: string) {
  return `A member proposes an idea. When two other members support it, a project group opens. Before any customer pays, the group writes how the money is shared. ${name} takes no share.`;
}

export function homeDifferences(name: string) {
  return [
    {
      title: "Members bring the ideas",
      body: `${name} does not assign jobs. The work starts from something a member proposes.`,
    },
    {
      title: "Two supporters open the group",
      body: "Two members besides the author open the group. The founder does not pick the winner.",
    },
    {
      title: "The split is written first",
      body: `The group writes how the money is shared, and each person accepts it, before paid work. ${name} takes no commission and no ownership.`,
    },
  ];
}

export type StarterIdea = {
  key: string;
  /** First line of the description. Identifies the row so it is created once, including after a title edit. */
  marker: string;
  category: IdeaCategory;
  title: string;
  summary: string;
  description: string;
  problem: string;
  proposal: string;
};

/**
 * Two unfinished problems the founder offers so the community is not an empty
 * prompt. Support starts at zero. Nothing here is a finished business.
 */
export const STARTER_IDEAS: StarterIdea[] = [
  {
    key: "independent-evidence",
    marker: "Founder starting point: independent evidence.",
    category: "AI_DATA",
    title: "Check whether an AI answer rests on independent sources",
    summary:
      "Several models can give the same answer because they share one source. This starting point is a service that checks whether the reasons behind an answer are actually independent.",
    description:
      "Founder starting point: independent evidence.\n\nThis is a starting point from the founder. Members are invited to narrow it. It is not a finished business.\n\nWhen several models agree, that agreement is not yet evidence. The work is to trace an answer back to its sources and say whether those sources are independent of each other. A first offer could be a short written check for someone who is about to rely on an AI answer.",
    problem: "People treat matching answers from several AI models as confirmation. The models may be repeating one shared source.",
    proposal: "A short review that lists the sources behind an answer and says whether they are independent.",
  },
  {
    key: "missing-support",
    marker: "Founder starting point: missing support.",
    category: "CONSULTING_RESEARCH",
    title: "Find the missing support behind a technical plan",
    summary:
      "A technical capability does not keep working on its own. This starting point looks for the people, energy, parts, and repair a plan still needs.",
    description:
      "Founder starting point: missing support.\n\nThis is a starting point from the founder. Members are invited to narrow it. It is not a finished business.\n\nA stronger machine, model, or tool is not the whole system. The work is to name the supporting capacity a plan leaves out: people, energy, parts, and repair. A first offer could be a short review of one technical plan, with those gaps written down.",
    problem: "A plan can look ready because the technology is capable, while the people, energy, parts, or repair it depends on are missing.",
    proposal: "A short written review of one technical plan that lists the supporting capacity still missing.",
  },
];
