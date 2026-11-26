import Link from "next/link";
import { PageHeader, Section, SectionHeading } from "@/components/ui/primitives";
import { getSiteContent } from "@/lib/content";
import { pageMetadata } from "@/lib/seo";
import { getSetting } from "@/server/settings";

export const metadata = pageMetadata(
  "/operators",
  "Who operates Twigo",
  "Twigo is operated by its founder. This page says what that person does, and what members do for themselves.",
);

const DOES = [
  "Keeps the website available and the public pages accurate.",
  "Reviews reports that members send.",
  "Publishes the policies members are asked to read.",
  "Charges no membership fee and takes no share of a group's earnings.",
];

const DOES_NOT = [
  "Does not assign work or choose a job for a member.",
  "Does not pick which idea becomes a project.",
  "Does not choose the most recognized pieces or writers. Members mark those.",
  "Does not guarantee income.",
];

export default async function OperatorsPage() {
  const [c, threshold] = await Promise.all([getSiteContent(), getSetting("community.endorsementThreshold")]);
  const name = c.company.name;
  return (
    <>
      <PageHeader
        eyebrow="Operators"
        title={`Who operates ${name}`}
        intro={`${name} is operated by its founder. There is one operator. This page does not list a staff that does not exist. If more people operate the site later, they will be named here with what each of them is responsible for.`}
      />
      <Section labelledBy="does-heading">
        <div className="grid gap-10 lg:grid-cols-2">
          <div>
            <SectionHeading id="does-heading" eyebrow="The operator" title="What the operator does" />
            <ul className="mt-6 space-y-3">
              {DOES.map((item) => (
                <li key={item} className="rounded-2xl border border-ink-100 bg-white p-4 leading-7 text-ink-700">
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <SectionHeading eyebrow="Limits" title="What the operator does not do" />
            <ul className="mt-6 space-y-3">
              {DOES_NOT.map((item) => (
                <li key={item} className="rounded-2xl border border-ink-100 bg-white p-4 leading-7 text-ink-700">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>
      <Section tone="soft" labelledBy="members-heading">
        <div className="mx-auto max-w-3xl">
          <SectionHeading id="members-heading" eyebrow="Members" title="Project groups are formed by members." />
          <div className="mt-6 space-y-4 text-lg leading-8 text-ink-700">
            <p>A member publishes a view on the discussion board, or proposes a business idea directly. Other members comment. The people who took part in a discussion can propose an idea from it.</p>
            <p>When {threshold} members besides the idea’s author support it, a project group opens. Before anyone is paid, that group writes how the money is shared. {name} takes nothing from it.</p>
            <p>
              Questions about the site itself go to{" "}
              {c.contact.email ? (
                <a href={`mailto:${c.contact.email}`} className="font-medium text-accent-700 underline">
                  {c.contact.email}
                </a>
              ) : (
                <Link href="/contact" className="font-medium text-accent-700 underline">
                  the contact page
                </Link>
              )}
              . Read more about why the community exists on the{" "}
              <Link href="/about" className="font-medium text-accent-700 underline">
                About
              </Link>{" "}
              page.
            </p>
          </div>
        </div>
      </Section>
    </>
  );
}
