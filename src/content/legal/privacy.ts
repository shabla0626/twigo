/**
 * Privacy Policy, version 1 (draft pending legal review). Written from the actual application:
 * src/server/*, prisma/schema.prisma, src/config/org-settings.ts (retention defaults), the
 * cookies set in src/lib/auth/session.ts and src/app/(auth)/actions.ts.
 */
export const privacy = (name: string) => `## 1. Who is responsible

${name} is currently a brand and an online community run by its founder. The legal operator who is responsible for your information (the "controller") has not yet been formally confirmed. Its identity and contact details will be given on the [Legal Notices](/legal/notices) page. Until then, privacy questions and requests can be sent from your account (Account, Your data) or through the [contact page](/contact).

## 2. Summary

- We collect what is needed to run the community: your account, your application, your profile, what you post, and records needed for security.
- We do not sell your information and do not use it for advertising. There is no advertising or analytics tracking on the site.
- We do not ask for national identity numbers, tax identification numbers, bank or card details during registration or application.
- Group chats, files and research notes are visible only to the group's current members. Administrators do not browse them.
- You can download your data, correct it, and ask for it to be deleted.

## 3. What we collect, why, and for how long

Retention periods below are the current settings. They are proposals that still need legal review; where no period has been decided, this is said.

### Account

- **What:** name, email address, password (stored only as a one-way hash), two-step verification settings (the secret is stored encrypted), recovery codes (hashed), sign-in times, account status.
- **Why and how used:** to let you sign in securely and to contact you about your account.
- **Who can see it:** you; administrators (not your password or secrets).
- **Retention:** while your account exists. Closing your account deactivates it; full deletion is done on request (see section 7). A fixed deletion period after closure has not yet been decided.

### Application

- **What:** full name, country and region, time zone, preferred contact method, current occupation, education, experience level, skills, relevant experience, an optional portfolio or profile link, work preferences, availability, motivation answers and acknowledgements. We do not ask for a resume file.
- **Why:** to review whether you can join the member community.
- **Who can see it:** authorized administrators only; never other members.
- **Retention:** declined applications are deleted after **365 days**; accepted applications are kept while you are a member.

### Profile

- **What:** display name and the optional details you add (photo, headline, introduction, general location, time zone, skills, experience, interests, availability). You choose which are shown to other members.
- **Who can see it:** approved members see what you chose to show.
- **Retention:** while your account exists.

### Ideas, comments, discussions and announcements

- **What:** the text you post, when, and who supports an idea; the history of edits to ideas.
- **Who can see it:** all approved members.
- **Retention:** while the community content exists. Content you delete, or that moderation removes, is kept for **30 days** for moderation and appeals, then permanently deleted.

### Groups, chat, files, meetings and research

- **What:** groups you joined or left (each change is shown in the group's chat), chat messages and attachments, research notes, tasks, decisions, links, uploaded files, and meeting records (the Google Meet link, who started it, times, who opened it).
- **Who can see it:** the group's current members. An administrator who joins a group as a member sees the chat only from the moment they joined, and this is shown to the group.
- **Retention:** chat is kept while the group exists (no automatic deletion is set); files of archived groups are deleted after **365 days**; meeting records after **365 days**. Meetings take place in Google Meet; we never record or store audio or video.

### Project records and agreements

- **What:** projects created by a group, versions of their agreements (scope, responsibilities, contracting arrangement, payment recipient, compensation terms), and each participant's acceptance with its time and fingerprint.
- **Who can see it:** the group's members; the full financial terms only the project's group and the owner of ${name}. Other administrators see that an agreement exists, not its terms.
- **Retention:** kept as evidence of what was agreed. How long such records must be kept has not yet been decided and is subject to legal review.

### Acceptance records

- **What:** which version of which document you accepted or acknowledged, its fingerprint, the time, and how (for example at registration).
- **Why:** to show what you agreed to and when.
- **Retention:** while your account exists, and afterwards for as long as needed to evidence the agreements; the period is pending legal review.

### Notifications and emails

- **What:** notifications shown to you, your notification preferences, and a log of emails we sent you (address, subject, delivery status).
- **Retention:** read notifications are deleted after **90 days**; email records after **730 days**.

### Reports and moderation

- **What:** reports you make, reports about your content (with a copy of the reported content), and moderation decisions.
- **Who can see it:** moderators (administrators). Looking at a reported chat message is itself recorded.

### Contact form

- **What:** name, email, inquiry type, subject, message, optional organization and timeline, and a one-way hash derived from your network address (to stop abuse). The raw address is not stored with the message.
- **Retention:** closed inquiries are deleted after **365 days**.

### Security and audit records

- **What:** active sessions (a hash of the network address and the browser description), short-lived counters of sign-in attempts (kept in memory), and an audit log of sensitive administrative actions.
- **Retention:** expired sessions and used links are deleted after **30 days**. The audit log has no automatic deletion yet; a period is pending legal review.

### Privacy requests and community support

- **Privacy requests:** what you ask and our answer, to handle the request and show it was handled.
- **Voluntary support:** online contributions are not available. If records of contributions are ever kept, contributor names are private to the owner and only totals are published.

## 4. Why we may use your information

We use information to provide the community you signed up for, to keep it safe, and to meet legal duties. Which legal basis applies to each use (for example performing our agreement with you, legitimate interests, or consent) depends on the law that governs the operator; this is subject to legal review.

## 5. Service providers

- **Hosting, database and file storage:** the hosting provider and server location have not yet been chosen. They will be named here before this policy is published.
- **Email:** emails are sent through an email delivery provider. The intended provider is Resend; if it is used, it processes your email address and the content of the messages it delivers.
- **Google Meet:** meetings take place on Google Meet. When you open a meeting link, Google processes your information under its own terms; ${name} only stores the link.

We do not share your information with anyone else, except where the law requires it.

## 6. International transfers

Where your information is stored, and whether it leaves your country, depends on the hosting and email providers, which are not yet final. Safeguards for any such transfer will be described here before publication.

## 7. Your rights and how to use them

Depending on the law where you live, you may have the right to access your information, correct it, have it deleted, restrict or object to its use, receive a copy in a portable form, and withdraw consent where we rely on consent.

- **Download your data:** Account, Your data.
- **Correct it:** edit your profile and account, or send a request.
- **Delete it, object, or anything else:** send a privacy request from Account, Your data. We confirm it, handle it, and record the outcome. We may need to keep some records where the law requires it, and will tell you if so.
- **Close your account:** Account settings.

You may also be able to complain to a data protection authority where you live.

## 8. Security

Encrypted connections, hashed passwords, encrypted two-step secrets, mandatory two-step verification for administrators, automatic sign-out of idle administrators, private file storage with access checks, and an audit log of sensitive actions. No system is perfectly secure.

## 9. Changes

Every version of this policy is kept. When it changes materially, we publish a new version with its effective date.
`;
