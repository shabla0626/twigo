/**
 * Builds a SEPARATE local demo database ("cowork_demo") filled with clearly
 * fictional sample members, ideas and one research group, so the member
 * experience can be reviewed without touching real data.
 *
 *   npm run demo:seed            (then: npm run demo:dev, open http://127.0.0.1:3100)
 *
 * It refuses to run against any database whose name does not end in "_demo",
 * and it drops and recreates that database every time. All accounts use
 * @demo.test addresses and the password in DEMO_PASSWORD (default below).
 * The demo owner has two-step verification with the fixed test secret below.
 */
import { Client } from "pg";
import { createUtf8Database } from "../src/ops/create-database";
import { createPrismaClient } from "../src/lib/db-core";
import { encryptSecret } from "../src/lib/crypto";
import { hashPassword } from "../src/lib/auth/password";
import { deploy } from "./migrate";
import { DEMO } from "./demo-config";
import { loadDotEnv } from "./load-env";


const hours = (h: number) => new Date(Date.now() - h * 3600_000);

async function main() {
  loadDotEnv();
  const url = new URL(process.env.DEMO_DATABASE_URL ?? DEMO.databaseUrl);
  const name = url.pathname.slice(1);
  if (!name.endsWith("_demo")) throw new Error(`Refusing to reset database "${name}" (name must end in _demo)`);
  const admin = new Client({ connectionString: Object.assign(new URL(url), { pathname: "/postgres", search: "" }).toString() });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await createUtf8Database(admin, name);
  await admin.end();
  await deploy(url.toString(), () => {});

  const db = createPrismaClient(url.toString());
  const passwordHash = await hashPassword(process.env.DEMO_PASSWORD ?? DEMO.password);
  const now = new Date();

  await db.user.create({
    data: {
      email: DEMO.ownerEmail,
      name: "Demo Owner",
      role: "OWNER",
      status: "ACTIVE",
      passwordHash,
      emailVerifiedAt: now,
      totpSecretEnc: encryptSecret(DEMO.totpSecret),
      totpEnabledAt: now,
      profile: { create: { displayName: "Demo Owner" } },
    },
  });

  const people = [
    ["maya", "Maya Patel", "Bookkeeper, 12 years with small businesses", ["Bookkeeping", "Spreadsheets"]],
    ["luis", "Luis Romero", "Sales and customer service", ["Sales", "Spanish"]],
    ["grace", "Grace Kim", "Web designer", ["Web design", "Writing"]],
    ["sam", "Sam Okafor", "Retired accountant", ["Accounting", "Taxes"]],
    ["tom", "Tom Becker", "Teacher, interested in side projects", ["Teaching", "Research"]],
  ] as const;
  const u: Record<string, string> = {};
  for (const [key, displayName, headline, skills] of people) {
    const user = await db.user.create({
      data: {
        email: `${key}@demo.test`,
        name: displayName,
        role: "MEMBER",
        status: "ACTIVE",
        passwordHash,
        emailVerifiedAt: now,
        membershipStatus: "ACTIVE",
        membershipChangedAt: now,
        profile: { create: { displayName, headline, skills: [...skills], location: "United States", hoursPerWeek: 6 } },
      },
    });
    u[key] = user.id;
  }

  // People at earlier stages of joining (to try the applicant pages and the admin review).
  await db.user.create({ data: { email: "nina@demo.test", name: "Nina Novak", role: "MEMBER", status: "ACTIVE", passwordHash, emailVerifiedAt: now, termsAcceptedAt: now } });
  await db.user.create({
    data: {
      email: "omar@demo.test",
      name: "Omar Haddad",
      role: "MEMBER",
      status: "ACTIVE",
      passwordHash,
      emailVerifiedAt: now,
      termsAcceptedAt: now,
      applicant: {
        create: {
          email: "omar@demo.test",
          fullName: "Omar Haddad",
          country: "United States",
          region: "Ohio",
          occupation: "Warehouse supervisor",
          applications: {
            create: {
              status: "SUBMITTED",
              draftStep: 3,
              motivation: "I would like to earn extra income by building something with other people.",
              contribution: "I am organized and reliable, and I know logistics well.",
              submittedAt: hours(5),
              statusChangedAt: hours(5),
              privacyNoticeVersion: "demo",
              acknowledgedAt: hours(5),
              availability: { create: { hoursPerWeek: 5, schedule: "Weekends" } },
              workPreferences: { create: [{ category: "ADMIN_OPERATIONS" }, { category: "GENERAL_REMOTE" }] },
            },
          },
        },
      },
    },
  });

  // 1. An idea that already became a research group.
  const books = await db.businessIdea.create({
    data: {
      authorId: u.maya,
      title: "Bookkeeping help for small local shops",
      summary: "Many small shops keep their books in a shoebox. We could offer simple monthly bookkeeping at a price they can afford.",
      problem: "Owners of small shops have little time for paperwork and often pay late fees or miss deductions.",
      revenueModel: "A flat monthly fee per shop, paid by the shop owner.",
      category: "LOCAL_SERVICES",
      status: "GROUP_FORMED",
      endorsementCount: 2,
      commentCount: 2,
      createdAt: hours(80),
      lastActivityAt: hours(30),
    },
  });
  await db.ideaEndorsement.createMany({ data: [{ ideaId: books.id, userId: u.luis!, createdAt: hours(60) }, { ideaId: books.id, userId: u.grace!, createdAt: hours(40) }] });
  await db.comment.create({ data: { ideaId: books.id, authorId: u.luis, body: "I know three shop owners on my street who complain about this every tax season.", createdAt: hours(70) } });
  await db.comment.create({ data: { ideaId: books.id, authorId: u.sam, body: "I could help check the numbers. What software would we use?", createdAt: hours(50) } });

  const group = await db.researchGroup.create({
    data: {
      slug: "bookkeeping-help-for-small-local-shops",
      name: books.title,
      purpose: books.summary,
      category: books.category,
      ideaId: books.id,
      status: "RESEARCHING",
      memberCount: 4,
      createdAt: hours(40),
      lastActivityAt: hours(2),
      channels: { create: { name: "general", isDefault: true } },
      memberships: {
        create: [
          { userId: u.maya!, role: "COORDINATOR", founding: true, joinedAt: hours(40) },
          { userId: u.luis!, role: "MEMBER", founding: true, joinedAt: hours(40) },
          { userId: u.grace!, role: "MEMBER", founding: true, joinedAt: hours(40) },
          { userId: u.sam!, role: "MEMBER", joinedAt: hours(20) },
        ],
      },
    },
    include: { channels: true },
  });
  const channel = group.channels[0]!;
  const chat: [string, string, number][] = [
    ["maya", "Welcome everyone! Thanks for supporting the idea.", 30],
    ["luis", "Happy to be here. I can talk to the shop owners I know this week.", 29],
    ["grace", "I can put together a one-page flyer once we know the price.", 28],
    ["sam", "Joined today. I have time on Tuesday and Thursday evenings.", 20],
    ["maya", "Great. Let's meet on Thursday to agree on questions for shop owners.", 3],
  ];
  for (const [who, body, h] of chat) await db.chatMessage.create({ data: { channelId: channel.id, authorId: u[who], body, createdAt: hours(h) } });
  await db.groupAnnouncement.create({
    data: { groupId: group.id, authorId: u.maya, title: "First goal: talk to 10 shop owners", body: "Before we plan anything, let's learn what shop owners actually need. Add what you hear to Shared Research.", createdAt: hours(26) },
  });
  const discussion = await db.groupDiscussion.create({
    data: { groupId: group.id, authorId: u.luis, title: "What should we ask shop owners?", body: "Let's agree on 5 simple questions so our notes are comparable.", commentCount: 1, createdAt: hours(25), lastActivityAt: hours(24) },
  });
  await db.comment.create({ data: { discussionId: discussion.id, authorId: u.grace, body: "How do you keep your books today? What does it cost you?", createdAt: hours(24) } });
  await db.researchNote.create({
    data: { groupId: group.id, section: "CUSTOMERS", title: "First conversations", body: "Luis spoke with 2 owners. Both use a paper notebook and pay an accountant once a year.", authorId: u.luis, createdAt: hours(10) },
  });
  await db.researchNote.create({
    data: { groupId: group.id, section: "REVENUE", title: "Possible pricing", body: "Owners mentioned they could pay between $40 and $80 per month for simple monthly books.", authorId: u.sam, createdAt: hours(8) },
  });
  await db.researchTask.create({ data: { groupId: group.id, title: "Interview 10 shop owners", status: "IN_PROGRESS", assigneeId: u.luis, createdById: u.maya } });
  await db.researchTask.create({ data: { groupId: group.id, title: "Compare 3 bookkeeping apps", status: "TODO", assigneeId: u.sam, createdById: u.maya } });

  // 2. Ideas still gathering support.
  const tutoring = await db.businessIdea.create({
    data: {
      authorId: u.tom,
      title: "Evening tutoring for adults going back to school",
      summary: "Adults returning to college often need help with math and writing. A small team of tutors could offer evening sessions online.",
      category: "EDUCATION_TRAINING",
      endorsementCount: 1,
      commentCount: 1,
      createdAt: hours(20),
      lastActivityAt: hours(6),
    },
  });
  await db.ideaEndorsement.create({ data: { ideaId: tutoring.id, userId: u.grace!, createdAt: hours(6) } });
  await db.comment.create({ data: { ideaId: tutoring.id, authorId: u.grace, body: "I would love to help with the writing side.", createdAt: hours(6) } });

  await db.businessIdea.create({
    data: {
      authorId: u.grace,
      title: "Simple websites for local tradespeople",
      summary: "Plumbers, electricians and painters often have no website. We could build simple one-page sites with contact details and reviews.",
      category: "ONLINE_SERVICES",
      createdAt: hours(4),
      lastActivityAt: hours(4),
    },
  });

  await db.notification.createMany({
    data: [
      { userId: u.tom!, type: "IDEA_ENDORSED", title: "Grace Kim supports your idea", link: `/community/ideas/${tutoring.id}`, createdAt: hours(6), updatedAt: hours(6) },
      { userId: u.tom!, type: "IDEA_COMMENT", title: "New comment on your idea", link: `/community/ideas/${tutoring.id}`, createdAt: hours(6), updatedAt: hours(6) },
      { userId: u.maya!, type: "GROUP_MEMBERSHIP", title: "Sam Okafor joined Bookkeeping help for small local shops", link: `/community/groups/${group.slug}/members`, createdAt: hours(20), updatedAt: hours(20) },
    ],
  });

  await db.$disconnect();
  console.log(`Demo database "${name}" is ready. Members: maya, luis, grace, sam, tom; applicants: nina (no application yet), omar (application received) @demo.test; owner: ${DEMO.ownerEmail}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
