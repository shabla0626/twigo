import Link from "next/link";
import { brand } from "@/config/brand";
import { IconArrow } from "../ui/icons";
import { Section, SectionHeading } from "../ui/primitives";
import { Reveal } from "../visuals/reveal";

const steps = (name: string) => [
  ["Join and apply", "Create a free account, then tell us about your skills and the time you have. A person reviews every application."],
  ["Share and support ideas", "Members propose business ideas and support the ones they would like to investigate."],
  [
    "Research together",
    "When two members other than the author support an idea, a project group is created automatically, with its own chat, meetings and shared notes.",
  ],
  [
    "Agree before any paid work",
    `The project's members write down scope, roles and how money is shared, and each of them accepts it, before commercial work begins. ${name} takes no share.`,
  ],
] as const;

/** The whole journey in four plain steps: join → ideas → groups → agreed paid work. */
export function JourneySteps({ tone = "white" as "blue" | "white" | "gray" | "soft", showLink = true }) {
  const STEPS = steps(brand().name);
  return (
    <Section tone={tone} labelledBy="journey-heading">
      <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
        <SectionHeading id="journey-heading" eyebrow="How it works" title="From an idea to agreed, paid work, in four steps." />
        {showLink && (
          <Link href="/how-it-works" className="inline-flex shrink-0 items-center gap-1.5 font-semibold text-accent-700 hover:text-accent-800">
            The full process <IconArrow className="h-4 w-4" />
          </Link>
        )}
      </div>
      <ol className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map(([title, body], i) => (
          <li key={title}>
            <Reveal delay={i * 80} className="h-full rounded-2xl border border-ink-100 bg-white p-6">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-accent-100 text-sm font-bold text-accent-800">{i + 1}</span>
              <h3 className="mt-4 text-lg font-semibold text-ink-950">{title}</h3>
              <p className="mt-2 leading-7 text-ink-600">{body}</p>
            </Reveal>
          </li>
        ))}
      </ol>
      <p className="mt-8 max-w-3xl text-sm leading-6 text-ink-600">
        Supporting an idea or joining a group does not guarantee income. Groups are places to investigate ideas; they are not companies or jobs. Nobody may
        ask members for fees or investments.
      </p>
    </Section>
  );
}
