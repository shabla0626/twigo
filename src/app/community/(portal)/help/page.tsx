import Link from "next/link";
import { PageTitle, Panel } from "@/components/community/ui";
import { ButtonLink } from "@/components/ui/primitives";
import { requireMember } from "@/lib/auth/guard";
import { getSetting } from "@/server/settings";

export const metadata = { title: "Help" };

const QUESTIONS: [string, string][] = [
  ["Do I need a business plan to propose an idea?", "No. A title and a few sentences are enough. Write what you know; the group can research the rest."],
  [
    "What does supporting an idea mean?",
    "It means you would like to investigate the idea with others. It is not a promise of money or work, and it does not mean the idea will succeed.",
  ],
  [
    "What happens when a project group is created?",
    "The idea’s author and its supporters become the first members. The group gets its own page with chat, meetings, shared research and discussions. A group is a place to investigate an idea; it is not a company or a job.",
  ],
  ["Can I join or leave groups freely?", "Yes. Join any active group from Explore Groups, and leave at any time from the group page. Leaving a group does not close your account."],
  [
    "How do meetings work?",
    "Meetings run in Google Meet. Anyone in the group can start one by pasting a Google Meet link; the group is notified and members join from the Meetings tab. Mute, camera and leave buttons are at the bottom of the Google Meet window. Meetings are not recorded by this site.",
  ],
  ["Who can see what I post?", "Ideas, comments and group discussions are visible to all approved members. Group chat, meetings and shared research are visible only to that group’s current members. Whenever someone joins or leaves a group, a line in its chat says so."],
  [
    "Can administrators read our group chat?",
    "Not behind your back. Administrators have no special access to group chats. They see a chat message only when a member reports it. An administrator may join a group like any member; then the chat shows that they joined, they are labelled “Administrator”, and they can read only what is written from that moment on.",
  ],
  ["Do I ever have to pay?", "No. Nobody may ask members for fees or investments. Paid work only starts after a written agreement with clear terms. Please report anyone who asks you for money."],
];

export default async function HelpPage() {
  await requireMember();
  const threshold = await getSetting("community.endorsementThreshold");
  const steps: [string, string][] = [
    ["Propose an idea", "Share a business opportunity in a few sentences."],
    ["Discuss and support", `Members comment and support the ideas they want to investigate. When ${threshold} members other than the author support an idea, a project group is created automatically.`],
    ["Join a group", "Explore groups and join the ones that interest you. Your groups are under My Groups."],
    ["Work together", "Chat, meet through Google Meet, and collect research to test whether the idea can work."],
    ["Turn it into a project", "When a group has a credible plan, it creates a project and writes down its agreement: who does what, who signs with the customer, and how earnings are shared. Paid work only starts after every participant accepts it."],
  ];
  return (
    <div className="max-w-3xl space-y-6">
      <PageTitle title="How it works" description="Everything in the community follows the same simple path." />
      <ol className="space-y-3">
        {steps.map(([t, b], i) => (
          <li key={t} className="flex gap-4 rounded-2xl border border-ink-100 bg-white p-5">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-100 text-sm font-bold text-accent-800">{i + 1}</span>
            <span>
              <span className="block font-semibold text-ink-950">{t}</span>
              <span className="mt-0.5 block text-[15px] leading-6 text-ink-700">{b}</span>
            </span>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        <ButtonLink href="/community">Browse Business Ideas</ButtonLink>
        <ButtonLink href="/community/groups" variant="secondary">
          Explore Groups
        </ButtonLink>
      </div>
      <Panel title="Common questions">
        <div className="divide-y divide-ink-100">
          {QUESTIONS.map(([q, a]) => (
            <details key={q} className="group py-3">
              <summary className="cursor-pointer list-none font-medium text-ink-900 [&::-webkit-details-marker]:hidden">
                <span className="mr-2 inline-block text-accent-700 transition group-open:rotate-90">›</span>
                {q}
              </summary>
              <p className="mt-2 pl-5 text-[15px] leading-6 text-ink-700">{a}</p>
            </details>
          ))}
        </div>
      </Panel>
      <p className="text-sm text-ink-600">
        Please read the{" "}
        <Link href="/legal/community-guidelines" className="font-medium text-accent-700 underline">
          Community Guidelines
        </Link>
        . Your profile, notification and privacy settings are in the account menu at the top right.
      </p>
    </div>
  );
}
