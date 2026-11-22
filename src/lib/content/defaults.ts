import type { SiteContentMap } from "./schema";

/**
 * Default public copy. The administrator can override every value from
 * /admin/content; overrides are stored in the SiteContent table.
 * Organization name and contact email default to environment configuration.
 */
export function defaultContent(org: { name: string; contactEmail: string }): SiteContentMap {
  return {
    company: {
      name: org.name,
      tagline: "Remote collaborative project work",
      mission:
        "We organize people with different skills and schedules into remote teams that deliver real products and services to real customers, and we share the resulting revenue fairly, according to transparent, agreed contribution arrangements.",
    },
    hero: {
      eyebrow: "Founding stage · Now inviting founding contributors",
      headline: "Work Together. Create Value. Share the Results.",
      subheadline:
        "Bring your abilities together with others, collaborate remotely, and create meaningful opportunities through shared effort.",
    },
    announcement: {
      enabled: true,
      title: "We are recruiting our founding contributors",
      body:
        "The organization is at its very beginning. There is no established team and no active client projects yet. We are looking for responsible, motivated people who want to help build a collaborative working environment from the ground up.",
    },
    contact: {
      email: org.contactEmail,
      responseNote: "We read every message. As a small founding-stage organization, replies may take a few business days.",
    },
    faq: {
      items: [
        {
          q: "Do I need to pay to join?",
          a: "No. There are no membership fees, registration fees, joining fees, deposits or capital contributions of any kind, now or later. Participation is based on your willingness and ability to contribute work, not on money. If anyone ever asks you to pay to participate on our behalf, it is not us.",
        },
        {
          q: "Is professional experience required?",
          a: "Not for every role. Some projects need specialized professional skills, but many tasks, such as research, data organization, quality checking or administrative support, can be done by reliable people who are willing to learn. What we look for is responsibility, reliability and the ability to complete assigned work.",
        },
        {
          q: "Can I participate while keeping my current job?",
          a: "Yes. That is the primary model. Participants keep their existing jobs or main sources of income and contribute during the time they have available.",
        },
        {
          q: "Is all work performed remotely?",
          a: "Yes. The organization is designed to be fully remote. There is no requirement to work from a physical office.",
        },
        {
          q: "How are projects assigned?",
          a: "When a real business opportunity is secured, we identify the skills it requires and invite participants whose skills and availability fit. You can accept or decline. Nobody is assigned to a project without agreeing to its scope, responsibilities and compensation terms first.",
        },
        {
          q: "How is compensation determined?",
          a: "Before each project begins, the people involved agree in writing on the scope of work, responsibilities and compensation terms. Compensation reflects the work actually performed, time invested, complexity and responsibility, quality of deliverables and the previously agreed terms. The revenue a customer pays for a project is disclosed to the people who work on it. Project expenses and any organizational fee are agreed in writing beforehand as well; there is no fixed organizational percentage and there are no undisclosed deductions. Compensation is paid from actual customer revenue, after the customer has paid.",
        },
        {
          q: "Is income guaranteed?",
          a: "No. We do not promise guaranteed income, guaranteed projects or guaranteed earnings. Compensation depends on securing real business opportunities, completing the work, the customer paying, and the written agreement for that project.",
        },
        {
          q: "What happens if no suitable project is currently available?",
          a: "Your application stays on file and you may be placed on a waitlist. We will contact you when an opportunity that matches your skills and availability arises. You have no obligation in the meantime.",
        },
        {
          q: "Can beginners participate?",
          a: "Yes, where suitable entry-level tasks exist. Beginners may start with simpler assignments and take on more as they gain experience. We do not currently offer formal paid training; if that changes, it will be announced here.",
        },
        {
          q: "How much time should I contribute?",
          a: "It depends on you and on the project. You tell us how many hours per week you can realistically offer, and project responsibilities are agreed with that in mind. Reliability matters more than volume: it is better to commit to a few hours and deliver consistently.",
        },
        {
          q: "How are responsibilities assigned?",
          a: "Each project defines roles and responsibilities up front. They are matched to participants based on skills, experience and availability, and they are confirmed with each person before the project starts.",
        },
        {
          q: "Can participants work on multiple projects?",
          a: "Yes, if your availability allows it and you can meet your commitments on each. We will check workload before proposing an additional project.",
        },
        {
          q: "What happens if I need to leave a project?",
          a: "Tell the project coordinator as early as possible so the work can be handed over responsibly. How completed work is compensated when someone leaves is covered in the written agreement for that project.",
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
