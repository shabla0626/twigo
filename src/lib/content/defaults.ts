import type { SiteContentMap } from "./schema";

/**
 * Default public copy. The administrator can override every value from
 * /admin/content; overrides are stored in the SiteContent table.
 * Organization name and contact email default to environment configuration.
 */
export function defaultContent(org: { name: string; contactEmail: string; tagline?: string }): SiteContentMap {
  return {
    company: {
      name: org.name,
      tagline: "An Online Collaborative Community",
      mission: `${org.name} is an independent, remote-first online collaborative community where people come together to propose ideas, develop business opportunities, form voluntary project groups, and pursue income through meaningful contributions and cooperation.`,
    },
    hero: {
      eyebrow: "An Online Collaborative Community",
      // The founder's approved slogan, word for word.
      headline: org.tagline || "Together We Innovate, Grow & Opportunity",
      subheadline:
        "Bring your ideas, skills, experience, and determination. Connect with other people, build project groups, explore opportunities, and create value through cooperation.",
    },
    announcement: {
      enabled: true,
      title: "We are welcoming our first members",
      body: `${org.name} is at its very beginning. There is no established membership and no active projects yet. We are looking for responsible, motivated people who want to build a collaborative community from the ground up.`,
    },
    contact: {
      email: org.contactEmail,
      responseNote: "We read every message. As a small, newly established community, replies may take a few business days.",
    },
    faq: {
      items: [
        {
          q: "Do I need to pay to join?",
          a: `No. There are no membership fees, registration fees, joining fees, deposits or capital contributions of any kind, now or later. Participation is based on your willingness to contribute, not on money. ${org.name} welcomes voluntary support from people who want to help run the community, but it is never required and gives no special rights. If anyone asks you to pay to participate on our behalf, it is not us.`,
        },
        {
          q: "Is professional experience required?",
          a: "No. Some projects need specialized professional skills, but many tasks, such as research, data organization, quality checking or administrative support, can be done by reliable people who are willing to learn. What matters is responsibility, reliability and doing what you agreed to do.",
        },
        {
          q: "Can I participate while keeping my current job?",
          a: "Yes. That is the expected way to take part. Members keep their existing jobs or main sources of income and contribute during the time they have available. Participation is voluntary: you decide what to join and when to step back.",
        },
        {
          q: "Is all work performed remotely?",
          a: `Yes. ${org.name} is remote-first. There is no requirement to work from a physical office.`,
        },
        {
          q: "How do projects start?",
          a: "From members' ideas. Any member can propose an idea. When at least two members other than the author support it, a project group forms automatically. If the group finds a real opportunity, its members write a project agreement and every participant accepts it before commercial work begins. Nobody is assigned to a project: you choose what to join.",
        },
        {
          q: "How is compensation determined?",
          a: `The participants of each project decide it together, in writing, before commercial work begins: equal shares, shares based on contribution, role-based pay, fixed payments, or another arrangement they all accept. The agreement also records who contracts with the customer, who receives the customer's payment, which expenses are approved, how net revenue is calculated and when each person is paid. ${org.name} takes no commission, percentage or ownership share of project revenue, and never deducts anything.`,
        },
        {
          q: "Is income guaranteed?",
          a: "No. Joining does not guarantee a project, customers or income. Income depends on real opportunities, customer demand, completed work, the customer paying, and the agreement the participants accepted.",
        },
        {
          q: "Who owns my idea?",
          a: `You do. Posting an idea does not transfer its ownership to ${org.name}. Ideas are visible to all approved members, so they are not confidential: share only what you are comfortable sharing. Ownership of anything a project creates is agreed by its participants before the work begins. See the Intellectual Property Policy.`,
        },
        {
          q: "What happens if no suitable project is available?",
          a: "Nothing is lost and you owe nothing. You can propose ideas, support other members' ideas, and join or leave groups whenever it suits you.",
        },
        {
          q: "Can beginners participate?",
          a: "Yes. Beginners can start with simpler tasks in a group and take on more as they gain experience. There is no formal paid training at the moment; if that changes, it will be announced here.",
        },
        {
          q: "How much time should I contribute?",
          a: "It depends on you and on the project. Responsibilities in a project agreement are set with each person's availability in mind. Reliability matters more than volume: it is better to commit to a few hours and deliver consistently.",
        },
        {
          q: "Who decides responsibilities?",
          a: "The participants of each project, in the project agreement. Roles and responsibilities are matched to skills and availability and accepted by each person before the project starts.",
        },
        {
          q: "Can I work on several projects?",
          a: "Yes, if your availability allows it and you can meet your commitments on each. Each project has its own agreement.",
        },
        {
          q: "What happens if I need to leave a project?",
          a: "Tell the other participants as early as possible so the work can be handed over responsibly. What happens to work already done is set in that project's agreement; leaving does not by itself cancel compensation you earned under it.",
        },
        {
          q: `What is ${org.name} Community Support?`,
          a: `A way for members and supporters to help pay for running and improving the community, if they want to. It is entirely optional, separate from all project earnings, never deducted automatically, and gives no extra rights, votes or priority. Online contributions are not available yet.`,
        },
      ],
    },
    categories: {
      items: [
        {
          title: "Technology & Software Development",
          description: "Building websites, applications, automations and technical integrations for customers.",
          examples: "Web development, mobile apps, QA testing, DevOps, technical documentation",
        },
        {
          title: "AI & Data Operations",
          description: "Preparing, labeling and analyzing data, and building practical AI-assisted workflows.",
          examples: "Data labeling, data cleaning, model evaluation, analytics dashboards",
        },
        {
          title: "Research & Analysis",
          description: "Gathering and organizing information so customers and teams can make good decisions.",
          examples: "Market research, competitor analysis, literature reviews, data collection",
        },
        {
          title: "Marketing & Business Development",
          description: "Finding customers, communicating value and building relationships that bring in real work.",
          examples: "Content writing, social media, outreach, proposal writing, design",
        },
        {
          title: "Customer Support",
          description: "Helping customers through email, chat or ticketing systems on behalf of projects.",
          examples: "Ticket handling, onboarding help, FAQ maintenance",
        },
        {
          title: "Administration & Operations",
          description: "Keeping projects organized: scheduling, documentation, coordination and record keeping.",
          examples: "Project coordination, document processing, scheduling, bookkeeping support",
        },
        {
          title: "General Remote Work",
          description: "Clearly defined tasks that need care and reliability rather than specialized qualifications.",
          examples: "Data entry, online research, information organization, quality checking",
        },
      ],
    },
  };
}
