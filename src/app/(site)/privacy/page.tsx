import { Notice, PageHeader, Placeholder, Section } from "@/components/ui/primitives";
import { getSiteContent } from "@/lib/content";
import { env } from "@/lib/env";
import { pageMetadata } from "@/lib/seo";
import { getSetting } from "@/server/settings";
import { PRIVACY_NOTICE_VERSION } from "@/lib/validation/application";

export const metadata = pageMetadata("/privacy", "Privacy Notice", "How applicant, member and contact information is collected, used, stored and deleted.");

export default async function PrivacyPage() {
  const c = await getSiteContent();
  const e = env();
  const declinedDays = await getSetting("retention.declinedApplicationsDays");
  const controller = e.ORG_LEGAL_NAME || <Placeholder>Legal entity name</Placeholder>;
  const jurisdiction = e.ORG_JURISDICTION || <Placeholder>Governing jurisdiction</Placeholder>;
  const email = c.contact.email || <Placeholder>Privacy contact email</Placeholder>;

  return (
    <>
      <PageHeader eyebrow="Legal" title="Privacy Notice" intro={`Version ${PRIVACY_NOTICE_VERSION}`} />
      <Section tone="gray">
        <div className="mx-auto max-w-3xl rounded-3xl border border-ink-100 bg-white p-6 shadow-soft sm:p-10">
          <Notice tone="warn" title="Draft: requires legal review">
            This notice is an initial draft prepared for a founding-stage organization. It has not been reviewed by a
            lawyer and is not claimed to satisfy the privacy laws of every jurisdiction (for example GDPR, UK GDPR, CCPA/
            CPRA or others). Bracketed items must be completed before launch.
          </Notice>
          <div className="prose-body">
            <h2>1. Who we are</h2>
            <p>
              This website is operated by {c.company.name} (legal entity: {controller}; jurisdiction: {jurisdiction}). For
              privacy questions or requests, contact {email}.
            </p>

            <h2>2. Information we collect</h2>
            <p>When you submit an application we collect:</p>
            <ul>
              <li>Identity and contact details: full name, email address, country, region, time zone, preferred contact method.</li>
              <li>Professional background: occupation, education, experience level, skills, relevant experience and an optional portfolio/LinkedIn link.</li>
              <li>Collaboration preferences: work categories, hours available, schedule, project types and remote experience.</li>
              <li>Your answers to the motivation questions and your acknowledgements, with the date and notice version accepted.</li>
            </ul>
            <p>
              When you use the contact form we collect your name, email, inquiry type, subject and message. For security
              and abuse prevention we store a one-way, salted hash derived from your IP address; we do not store the raw
              IP address with your submission.
            </p>
            <p>If your application is accepted and you activate a member account, we also process:</p>
            <ul>
              <li>Account data: email address, password (stored only as a one-way hash), optional two-step verification settings, sign-in times and the devices/browsers signed in.</li>
              <li>Your member profile: display name and the optional details you add (photo, general location, time zone, skills, experience, interests, availability). You choose which are shown to other members.</li>
              <li>What you post: business ideas, endorsements, comments, group discussions, group chat messages, research notes, tasks, decisions, links and uploaded files.</li>
              <li>Group and meeting records: which groups you joined or left, and meeting metadata (who started a meeting, when, who opened the link). Meetings take place in Google Meet; we do not record or store audio or video.</li>
              <li>Notifications, your notification preferences, and a log of emails we sent you (recipient, subject, delivery status).</li>
              <li>Reports you file, and reports about content you posted, including a copy of the reported content.</li>
            </ul>
            <p>
              We do <strong>not</strong> request Social Security numbers, tax identification numbers, banking
              information, passwords or other sensitive financial information during the application process.
            </p>

            <h2>3. How we use it</h2>
            <ul>
              <li>To review your application and assess suitability for collaborative projects.</li>
              <li>To contact you about your application and, if accepted, about suitable project opportunities.</li>
              <li>To respond to inquiries.</li>
              <li>To provide the member community: ideas, research groups, chat, meetings, files and notifications.</li>
              <li>To moderate the community and enforce the community rules.</li>
              <li>To protect the website against spam and abuse.</li>
            </ul>
            <p>We do not sell your personal information and do not use it for advertising.</p>
            <p>
              <Placeholder>Legal basis for processing (e.g. consent / legitimate interests / pre-contractual steps) to be confirmed by legal counsel for the applicable jurisdiction(s).</Placeholder>
            </p>

            <h2>4. Who can see it</h2>
            <p>
              Application information is accessible only to authorized administrators through an authenticated dashboard. It
              is never published on the website and never shown to other members. Compensation records are restricted to the
              owner and are not shared with other participants.
            </p>
            <p>
              Inside the member community, other approved members can see your display name, the profile details you chose to
              show, and what you post in community-visible areas (ideas, comments, group discussions). Group chat, research
              notes, meetings and files are visible only to the current members of that group. Administrators do not browse
              private group chats; they see a message only when a member reports it, and they can read a group’s research
              notes when the group asks the organization to review its proposal.
            </p>
            <p>
              We use service providers to operate the website (for example hosting, database and email delivery
              providers): <Placeholder>List of processors and their locations</Placeholder>.
            </p>

            <h2>5. Retention and deletion</h2>
            <ul>
              <li>Declined applications are deleted after a defined period (currently configured as {declinedDays ?? "no automatic deletion"}{declinedDays ? " days" : ""}).</li>
              <li>Each other category (deleted posts and messages, chat history, files of archived groups, notifications, meeting records, email logs, expired sessions) has its own retention period set by the organization and enforced by a daily job.</li>
              <li>Applications of accepted participants are kept for as long as you participate, plus any period required by law.</li>
              <li>You may ask us to delete your application at any time. We will delete it unless we are required to keep it.</li>
            </ul>

            <h2>6. Your rights</h2>
            <p>
              Depending on where you live, you may have rights to access, correct, delete or restrict the use of your
              information, to object to processing and to data portability. Members can download their own data and
              deactivate their account under Account settings. For other requests, contact {email}.
            </p>

            <h2>7. Security</h2>
            <p>
              We use encrypted connections (HTTPS), access-controlled administration with mandatory two-step verification,
              hashed passwords, encrypted storage of two-step secrets, private file storage with access checks, audit logging
              of administrative actions and server-side validation. No system is perfectly secure, but we take reasonable
              measures to protect your information.
            </p>

            <h2>8. International transfers</h2>
            <p>
              <Placeholder>Describe where data is stored and safeguards for cross-border transfers, if applicable.</Placeholder>
            </p>

            <h2>9. Changes</h2>
            <p>If this notice changes materially, we will update the version number above and the date of the change.</p>
          </div>
        </div>
      </Section>
    </>
  );
}
