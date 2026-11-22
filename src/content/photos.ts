/**
 * PHOTO MANIFEST: every photograph slot on the public website.
 *
 * Photographs are supplied by the site owner (own photos, or images they
 * license themselves). To add one: save the file at `src` under /public,
 * record its source and licence in docs/IMAGE-CREDITS.md, then rebuild.
 * Until a file exists, development shows a labelled placeholder and
 * production shows the page's original illustration or a neutral panel.
 *
 * Keep this file, docs/PHOTO-SHOT-LIST.md and docs/IMAGE-CREDITS.md in sync
 * (enforced by tests/photos.test.ts).
 */

export type Aspect = "3:2" | "4:3" | "4:5" | "16:9";

export type PhotoSlot = {
  /** Page the slot appears on. */
  page: string;
  /** Section within the page. */
  section: string;
  /** Path under /public. Descriptive filename, JPG or WebP. */
  src: `/images/people/${string}`;
  /** Brief for the owner: what the ideal photograph shows. */
  brief: string;
  /** Descriptive alt text for screen readers. */
  alt: string;
  aspect: Aspect;
  /** Minimum width in pixels of the supplied file. */
  minWidth: number;
  /** CSS object-position used when cropping (e.g. "50% 30%" keeps faces in view). */
  focal?: string;
};

export const PHOTOS = {
  // ------------------------------------------------------------------ home
  "home-hero": {
    page: "Home",
    section: "Hero",
    src: "/images/people/home/hero-remote-collaboration.jpg",
    brief:
      "Two or three people of different ages and backgrounds collaborating remotely: for example one person at a home desk on a video call with others visible on the laptop screen. Bright natural light, realistic home setting, space on one side for breathing room.",
    alt: "People of different ages collaborating remotely on a shared project from their own workspaces",
    aspect: "4:3",
    minWidth: 2400,
    focal: "50% 35%",
  },
  "home-mission": {
    page: "Home",
    section: "Our Mission",
    src: "/images/people/home/mission-small-team-working.jpg",
    brief: "A small, mixed group of ordinary people working together with laptops and notes, informal and realistic, not an executive meeting.",
    alt: "A small group of people with different backgrounds working together with laptops and notes",
    aspect: "4:5",
    minWidth: 1600,
    focal: "50% 40%",
  },
  "home-who-professional": {
    page: "Home",
    section: "Who Can Participate: professionals",
    src: "/images/people/home/who-technical-professional.jpg",
    brief: "A software developer or data analyst concentrating on code or a chart at a laptop, at home or in a modest workspace.",
    alt: "A technical professional working on code at a laptop",
    aspect: "4:3",
    minWidth: 1600,
  },
  "home-who-general": {
    page: "Home",
    section: "Who Can Participate: general contributors",
    src: "/images/people/home/who-general-contributor.jpg",
    brief: "A person doing careful everyday operational work: organizing documents, entering data in a spreadsheet or checking information.",
    alt: "A person organizing documents and entering information on a computer",
    aspect: "4:3",
    minWidth: 1600,
  },
  "home-who-learning": {
    page: "Home",
    section: "Who Can Participate: developing contributors",
    src: "/images/people/home/who-learning-new-skills.jpg",
    brief: "An adult (any age, ideally not only young people) learning a new skill online: following a course and taking notes.",
    alt: "An adult learning a new skill online and taking notes",
    aspect: "4:3",
    minWidth: 1600,
  },
  "home-founding": {
    page: "Home",
    section: "Founding Contributor Opportunities",
    src: "/images/people/home/founding-remote-worker.jpg",
    brief: "An individual remote worker in a modest, tidy home workspace, focused on their work. Natural, not posed toward the camera.",
    alt: "A person focused on remote work in a modest home workspace",
    aspect: "4:3",
    minWidth: 1600,
  },

  // ----------------------------------------------------------------- about
  "about-header": {
    page: "About",
    section: "Header",
    src: "/images/people/about/header-different-backgrounds.jpg",
    brief: "People from clearly different professional backgrounds and age groups working together on one task. Editorial feel, natural light.",
    alt: "People from different professional backgrounds working together on one task",
    aspect: "4:3",
    minWidth: 1800,
  },
  "about-cooperation": {
    page: "About",
    section: "The Value of Cooperation",
    src: "/images/people/about/cooperation-side-by-side.jpg",
    brief: "Two people with different skill levels working side by side, one explaining something to the other on a laptop.",
    alt: "Two people working side by side while one explains something on a laptop",
    aspect: "3:2",
    minWidth: 1600,
  },

  // ---------------------------------------------------------- how it works
  "how-header": {
    page: "How It Works",
    section: "Header",
    src: "/images/people/how-it-works/header-working-from-home.jpg",
    brief: "A person working individually from home, for example at a kitchen table or small desk with a laptop.",
    alt: "A person working individually from home with a laptop",
    aspect: "4:3",
    minWidth: 1800,
  },
  "how-discussion": {
    page: "How It Works",
    section: "Phase 2: match and agree",
    src: "/images/people/how-it-works/remote-discussion.jpg",
    brief: "A remote project discussion: a laptop screen showing a video call with several participants, seen from behind or beside the person.",
    alt: "A remote project discussion on a video call",
    aspect: "3:2",
    minWidth: 1600,
  },
  "how-research": {
    page: "How It Works",
    section: "Phase 1: apply and get to know each other",
    src: "/images/people/how-it-works/online-research.jpg",
    brief: "A person doing online research and computer work: browser open, notes beside the laptop.",
    alt: "A person doing online research on a computer with notes beside them",
    aspect: "3:2",
    minWidth: 1600,
  },
  "how-collaboration": {
    page: "How It Works",
    section: "Phase 3: work, deliver and settle",
    src: "/images/people/how-it-works/digital-collaboration.jpg",
    brief: "People collaborating through digital tools: a shared document, task board or design file being worked on together.",
    alt: "People collaborating through a shared digital workspace",
    aspect: "3:2",
    minWidth: 1600,
  },

  // --------------------------------------------------------- participation
  "participation-header": {
    page: "Participation",
    section: "Header",
    src: "/images/people/participation/header-varied-contributors.jpg",
    brief: "A varied group of people (different ages, backgrounds and roles) each working in their own way, or one image that shows that variety.",
    alt: "A varied group of people with different roles working in their own ways",
    aspect: "4:3",
    minWidth: 1800,
  },
  "participation-technology": {
    page: "Participation",
    section: "Category: Technology & Software Development",
    src: "/images/people/participation/technology-software-development.jpg",
    brief: "A developer writing or reviewing code; screen visible but not the main focus.",
    alt: "A developer writing code at a computer",
    aspect: "4:3",
    minWidth: 1200,
  },
  "participation-ai-data": {
    page: "Participation",
    section: "Category: AI & Data Operations",
    src: "/images/people/participation/ai-data-operations.jpg",
    brief: "A person labeling or reviewing data, or working with charts and spreadsheets.",
    alt: "A person reviewing data and charts on a computer",
    aspect: "4:3",
    minWidth: 1200,
  },
  "participation-research": {
    page: "Participation",
    section: "Category: Research & Analysis",
    src: "/images/people/participation/research-analysis.jpg",
    brief: "A person researching with printed or on-screen sources, making notes.",
    alt: "A person researching sources and making notes",
    aspect: "4:3",
    minWidth: 1200,
  },
  "participation-marketing": {
    page: "Participation",
    section: "Category: Marketing & Business Development",
    src: "/images/people/participation/marketing-business-development.jpg",
    brief: "A person writing content, planning outreach or sketching ideas for a customer.",
    alt: "A person planning marketing content and sketching ideas",
    aspect: "4:3",
    minWidth: 1200,
  },
  "participation-support": {
    page: "Participation",
    section: "Category: Customer Support",
    src: "/images/people/participation/customer-support.jpg",
    brief: "A customer support worker with a headset or answering messages, friendly and attentive.",
    alt: "A customer support worker with a headset helping a customer",
    aspect: "4:3",
    minWidth: 1200,
  },
  "participation-admin": {
    page: "Participation",
    section: "Category: Administration & Operations",
    src: "/images/people/participation/administration-operations.jpg",
    brief: "A person organizing schedules, documents or project records.",
    alt: "A person organizing schedules and project documents",
    aspect: "4:3",
    minWidth: 1200,
  },
  "participation-general": {
    page: "Participation",
    section: "Category: General Remote Work",
    src: "/images/people/participation/general-remote-work.jpg",
    brief: "An ordinary person doing careful general computer work at home: data entry, checking information. Shows that no specialist background is needed.",
    alt: "A person doing general computer work from home",
    aspect: "4:3",
    minWidth: 1200,
  },

  // ---------------------------------------------------------- compensation
  "compensation-header": {
    page: "Compensation",
    section: "Header",
    src: "/images/people/compensation/header-reviewing-plan.jpg",
    brief: "Two or three people cooperating on ordinary business activities, such as reviewing a plan or document together. No money, no luxury.",
    alt: "People reviewing a project plan together",
    aspect: "4:3",
    minWidth: 1800,
  },

  // -------------------------------------------------- founding contributors
  "founding-header": {
    page: "Founding Contributors",
    section: "Header",
    src: "/images/people/founding-contributors/header-remote-contributor.jpg",
    brief: "A welcoming, sincere image of a person working remotely: focused, comfortable, ordinary home setting.",
    alt: "A person working remotely from a comfortable home setting",
    aspect: "4:3",
    minWidth: 1800,
  },
  "founding-person-1": {
    page: "Founding Contributors",
    section: "Who we are looking for (portrait 1)",
    src: "/images/people/founding-contributors/portrait-remote-worker-1.jpg",
    brief: "An individual remote worker. Choose the three portraits to differ in age, background and setting.",
    alt: "A remote worker at a laptop",
    aspect: "4:5",
    minWidth: 1000,
  },
  "founding-person-2": {
    page: "Founding Contributors",
    section: "Who we are looking for (portrait 2)",
    src: "/images/people/founding-contributors/portrait-remote-worker-2.jpg",
    brief: "A second, clearly different individual working remotely (different age group or background from portrait 1).",
    alt: "A remote worker taking notes beside a laptop",
    aspect: "4:5",
    minWidth: 1000,
  },
  "founding-person-3": {
    page: "Founding Contributors",
    section: "Who we are looking for (portrait 3)",
    src: "/images/people/founding-contributors/portrait-remote-worker-3.jpg",
    brief: "A third individual working remotely, again different from portraits 1 and 2.",
    alt: "A remote worker on a video call",
    aspect: "4:5",
    minWidth: 1000,
  },

  // ------------------------------------------------------------------- faq
  "faq-header": {
    page: "FAQ",
    section: "Header",
    src: "/images/people/faq/header-reading.jpg",
    brief: "A calm image of a person reading information on a laptop or tablet.",
    alt: "A person reading information on a laptop",
    aspect: "4:3",
    minWidth: 1200,
  },

  // --------------------------------------------------------------- contact
  "contact-header": {
    page: "Contact",
    section: "Header",
    src: "/images/people/contact/header-online-communication.jpg",
    brief: "A person communicating online: typing a message or speaking on a video call with a headset.",
    alt: "A person communicating online on a video call",
    aspect: "4:3",
    minWidth: 1200,
  },

  // ----------------------------------------------------------------- apply
  "apply-header": {
    page: "Apply",
    section: "Sidebar",
    src: "/images/people/apply/header-completing-form.jpg",
    brief: "A person calmly filling in an online form on a laptop or phone at home.",
    alt: "A person filling in an online form on a laptop at home",
    aspect: "4:3",
    minWidth: 1200,
  },
} satisfies Record<string, PhotoSlot>;

export type PhotoId = keyof typeof PHOTOS;

/** Category photos for the Participation page, in the default category order. */
export const CATEGORY_PHOTO_IDS: PhotoId[] = [
  "participation-technology",
  "participation-ai-data",
  "participation-research",
  "participation-marketing",
  "participation-support",
  "participation-admin",
  "participation-general",
];

export const ASPECT_RATIO: Record<Aspect, string> = { "3:2": "3 / 2", "4:3": "4 / 3", "4:5": "4 / 5", "16:9": "16 / 9" };
