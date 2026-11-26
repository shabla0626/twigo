import type { IdeaCategory } from "@prisma/client";

export type FieldGuide = {
  category: IdeaCategory;
  /** What the field is, in plain language. */
  about: string;
  /** What a member can usefully share. */
  share: string;
  /** What a collaboration request should say. */
  ask: string;
};

/**
 * General orientation for the same areas used when an idea is proposed.
 * These are not job offers, courses, or claims that Twigo already does this work.
 */
export const FIELD_GUIDES: FieldGuide[] = [
  {
    category: "SOFTWARE_TECH",
    about: "Software is the instructions a computer follows: a website, an application, a small tool, or the work of keeping one of those running. The useful questions are what it should do, who uses it, and how someone can tell that it works.",
    share: "A short note on a problem you have already met, a way you checked a feature, or a tool you are willing to explain. Do not paste passwords, private keys, or someone else's private code.",
    ask: "Name the task and the skill. For example: review one screen, set up a form, or explain an error message. A request here does not hire anyone and does not open a project group.",
  },
  {
    category: "AI_DATA",
    about: "AI systems answer from data and from patterns in that data. Data work is collecting records, cleaning them, checking them, and saying what they do and do not show. Several models giving the same answer is not, by itself, proof that the answer is true.",
    share: "A method you used to check a dataset or an answer, including where the records came from. Leave out personal data that belongs to other people.",
    ask: "Ask for a second reading of one question, one table, or one set of sources. Say what you already checked.",
  },
  {
    category: "ONLINE_SERVICES",
    about: "An online service is something a person uses through a browser or an app, without meeting anyone in person. The first screen is the small part. The lasting work is reliability, support, and how money, if any, is handled.",
    share: "What it took to run a service you already know: the steps, the delays, or the support questions that kept coming back.",
    ask: "Ask for help with one piece, such as the wording of a help page or a checklist for when something breaks.",
  },
  {
    category: "CONTENT_MEDIA",
    about: "Content is writing, pictures, audio, or video made for an audience. A useful piece says who it is for. Material you post here should be yours to share, or used only as a short quotation with its source.",
    share: "An outline, a draft paragraph, or a note on how you edited something. Do not upload a whole book, a film, or another person's work.",
    ask: "Ask for an editor, a translator, or a reviewer for one named piece. Say the language and how long it is.",
  },
  {
    category: "ECOMMERCE",
    about: "Selling goods online covers the product, the listing, the order, the delivery, and the return. A listing is not yet a sale. The work that decides whether it continues is usually fulfillment and what happens when something goes wrong.",
    share: "A real step you have done: writing a listing, packing an order, or dealing with a supplier delay. Prices you mention are examples, not offers from Twigo.",
    ask: "Ask for help with one step, such as checking a product description or listing what a return process must include.",
  },
  {
    category: "LOCAL_SERVICES",
    about: "Local work happens in person: repair, care, teaching, delivery, or a shop. Twigo's own work is remote, so a local effort needs a clear remote part (research, writing, scheduling) or people who are actually in that place. Name a region, not a home address.",
    share: "How a local service was organized: the steps, the time it took, and what had to be done on site.",
    ask: "Say which part can be done at a distance and which part cannot. Do not ask members to travel or to pay.",
  },
  {
    category: "CONSULTING_RESEARCH",
    about: "Consulting and research help someone decide. The work is gathering evidence, separating what was observed from what was concluded, and naming the source. A confident tone is not the same as a checked fact.",
    share: "A question you investigated and how you kept the sources straight. A technical plan can be reviewed by asking what people, energy, parts, and repair it still needs.",
    ask: "State the question and what a useful answer would contain. Do not ask anyone to invest, and do not present the request as a paid engagement.",
  },
  {
    category: "EDUCATION_TRAINING",
    about: "Teaching a skill needs a lesson, a way to practice, and a way to tell whether the learner can do it. A short explanation that a careful person can follow is already useful. Twigo does not sell courses.",
    share: "An outline of a lesson you can explain, or a mistake beginners often make and how you would correct it.",
    ask: "Ask for a review of one lesson, or for someone who can explain one skill you do not have. Say who the learner is.",
  },
  {
    category: "MARKETING_SALES",
    about: "Marketing and sales are how a person hears about something and decides whether to buy it. A claim needs a basis the reader can check. Collecting other people's contact details, or asking members to buy, does not belong on this page.",
    share: "A message you sent, what you hoped it would do, and what actually happened. Take out names and addresses.",
    ask: "Ask for a review of one page of wording. Say who it is meant for and what you are not allowed to promise.",
  },
  {
    category: "OTHER",
    about: "Use this when the work does not fit the fields above. The first sentence should say what it actually is, so another member can tell whether they can help.",
    share: "The experience or the material, in plain words, and why it did not fit another field.",
    ask: "Say what help you want and what you have already tried.",
  },
];
