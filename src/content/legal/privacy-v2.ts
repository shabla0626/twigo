/**
 * Privacy Policy, version 2 (prepared 24 November 2026; pending legal review). Version 1 (privacy.ts)
 * is kept unchanged: it is the reviewed text and its fingerprint is locked by a test. Version 2 describes
 * the software as it now works: administrator access to group information only after a member's report
 * and the owner's approval (src/server/admin/group-access.ts), the account deletion process
 * (src/server/privacy-deletion.ts), backups (src/ops/backup.ts and the deployment script) and the service
 * providers in general terms. Retention periods are the current default settings, as in version 1.
 * Same Markdown subset as the other legal texts.
 */
export const privacyV2 = (name: string) => `## 1. Who is responsible

${name} is currently a brand and an online community run by its founder. The legal operator who is responsible for your information (the "controller") has not yet been formally confirmed. Its identity and contact details will be given on the [Legal Notices](/legal/notices) page. Until then, privacy questions and requests can be sent from your account (Account, Privacy & data) or through the [contact page](/contact).

## 2. Summary

- We collect what is needed to run the community: your account, your application, your profile, what you post, and records needed for security.
- We do not sell your information and do not use it for advertising. There is no advertising or analytics tracking on the site.
- We do not ask for national identity numbers, tax identification numbers, bank or card details during registration or application.
- A project group's chat, research notes, files, tasks, decisions and projects are private to the group's members. Administrator accounts cannot join groups or browse this information. An administrator can see it only to investigate a report made by a member of that group, and only after the owner of ${name} explicitly approved it, for the information and the period the owner set. Access ends automatically, and every step and every view is recorded.
- You can download your data, correct it, and ask for your account and personal data to be deleted. Some records are kept, as explained in section 7.

## 3. What we collect, why, and for how long

Retention periods below are the current settings. They are proposals that still need legal review; where no period has been decided, this is said.

### Account

- **What:** name, email address, password (stored only as a one-way hash), two-step verification settings (the secret is stored encrypted), recovery codes (hashed), sign-in times, account status.
- **Why and how used:** to let you sign in securely and to contact you about your account.
- **Who can see it:** you; administrators (not your password or secrets).
- **Retention:** while your account exists. Closing (deactivating) your account does not delete your information. Deletion is done on request, as described in section 7.

### Application

- **What:** full name, country and region, current occupation, education, experience level, skills, relevant experience, an optional portfolio or profile link, work preferences, availability, motivation answers and acknowledgements. We do not ask for a resume file.
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
- **Who can see it:** the group's current members. Administrators cannot join groups. If you report a message or a group, the moderators see the copy attached to your report. Beyond that, an administrator can see a group's information only during an investigation: a member of that group reported something, an administrator asked for access, and the owner approved it for specific information and a limited period (at most 30 days at a time). The administrator then has read-only access to the approved information only; it ends automatically at the set time, and the request, the decision and every view are recorded.
- **Retention:** chat is kept while the group exists (no automatic deletion is set); files of archived groups are deleted after **365 days**; meeting records after **365 days**. Meetings take place in Google Meet; we never record or store audio or video.

### Project records and agreements

- **What:** projects created by a group, versions of their agreements (scope, responsibilities, contracting arrangement, payment recipient, compensation terms), and each participant's acceptance with its time and fingerprint.
- **Who can see it:** the members of the group, including draft versions and each participant's terms. Administrators, including the owner, see only how many projects exist in each state; an agreement itself only within an approved investigation as described above.
- **Retention:** kept as evidence of what was agreed. How long such records must be kept has not yet been decided and is subject to legal review.

### Acceptance records

- **What:** which version of which document you accepted or acknowledged, its fingerprint, the time, and how (for example at registration).
- **Why:** to show what you agreed to and when.
- **Retention:** while your account exists, and afterwards for as long as needed to evidence the agreements; the period is pending legal review.

### Notifications and emails

- **What:** notifications shown to you, your notification preferences, and a log of emails we sent you (address, subject, delivery status and, except for messages that contain a sign-in or confirmation link, the text of the message).
- **Retention:** read notifications are deleted after **90 days**; email records after **730 days**.

### Reports and moderation

- **What:** reports you make, reports about your content (with a copy of the reported content), and moderation decisions.
- **Who can see it:** moderators (administrators). Looking at a reported chat message is itself recorded.

### Contact form

- **What:** name, email, inquiry type, subject, message, optional organization and timeline, and a one-way hash derived from your network address (to stop abuse). The raw address is not stored with the message.
- **Retention:** closed inquiries are deleted after **365 days**.

### Security and audit records

- **What:** active sessions (a hash of the network address and the browser description), short-lived counters of sign-in attempts (kept in memory), and an audit log of sensitive administrative actions, including every request for, decision on and use of access to a group's information.
- **Retention:** expired sessions and used links are deleted after **30 days**. The audit log has no automatic deletion yet; a period is pending legal review.

### Backups

- **What:** copies of the database, to recover from failures. The database is copied automatically once a day; the most recent copies (currently 14) are kept and older ones are deleted automatically. Before each software update, an additional copy of the database and of uploaded files is made; these copies are kept until the operator deletes them.
- **Who can see it:** only the operator, through access to the server.
- **Retention:** as described above. A backup is not changed when information is deleted from the active system, so deleted information can remain in backups until those backups are deleted.

### Privacy requests and community support

- **Privacy requests:** what you ask, how you confirmed your identity, our answer and how the request was handled, to handle it and show it was handled.
- **Voluntary support:** online contributions are not available. If records of contributions are ever kept, contributor names are private to the owner and only totals are published.

## 4. Why we may use your information

We use information to provide the community you signed up for, to keep it safe, and to meet legal duties. Which legal basis applies to each use (for example performing our agreement with you, legitimate interests, or consent) depends on the law that governs the operator; this is subject to legal review.

## 5. Service providers

- **Hosting and infrastructure:** ${name} uses third-party hosting and infrastructure services to operate the community. Information submitted to ${name} may be stored or processed using infrastructure operated by external service providers in the jurisdictions where those services operate. ${name} does not identify the precise physical server location in this notice.
- **Network and domain:** connections to the site pass through Cloudflare, which provides the domain name service and protects and forwards traffic to our server. Cloudflare processes technical information such as your network address and the requests your browser makes.
- **Email:** emails are sent through an email delivery provider, Resend, which processes your email address and the content of the messages it delivers.
- **Google Meet:** meetings take place on Google Meet. When you open a meeting link, Google processes your information under its own terms; ${name} only stores the link.

We do not share your information with anyone else, except where the law requires it.

## 6. International transfers

The providers in section 5 may process information in countries other than yours, depending on where they operate. Which safeguards apply to such transfers depends on the law that governs the operator; this is subject to legal review.

## 7. Your rights and how to use them

Depending on the law where you live, you may have the right to access your information, correct it, have it deleted, restrict or object to its use, receive a copy in a portable form, and withdraw consent where we rely on consent.

- **Download your data:** Account, Privacy & data.
- **Correct it:** edit your profile and account, or send a request.
- **Delete your account and personal data:** Account, Privacy & data, Request deletion (see below).
- **Object, restrict, or anything else:** send a privacy request from Account, Privacy & data. We confirm it, handle it, and record the outcome. We may need to keep some records where the law requires it, and will tell you if so.
- **Close your account:** Account, Privacy & data. Closing (deactivating) is not deletion: your information stays until you ask for deletion.

You may also be able to complain to a data protection authority where you live.

### Deleting your account and personal data

1. You see what is deleted and what is kept before you confirm anything.
2. You confirm your identity with your password (and your two-step code if you use one), and then confirm the request.
3. Nothing is deleted at that moment. The owner of ${name} reviews the request and may ask you for more information or explain why part of it cannot be carried out.
4. When the deletion is carried out, your profile and profile photo, your application, your notifications and settings, and your sign-in records are deleted. Your account is closed and anonymized: your name and email address are removed from it, and it can no longer be used.
5. Kept: what other members rely on or what shows what was agreed. Your contributions in shared group areas stay, shown without your name; the owner may also remove your ideas, comments, discussions and chat messages. Project agreements you accepted, the record of the policies you accepted, your privacy requests and the audit log are kept. Email records are deleted when their period ends. If your application is linked to earlier project records, it is kept for now and reviewed separately; you are told if so.
6. Backups are not changed: deleted information can remain in them until those backups are deleted, as described in section 3 (Backups).
7. You receive an email at your confirmed address when the deletion is completed.

## 8. Security

Encrypted connections, hashed passwords, encrypted two-step secrets, mandatory two-step verification for administrators, automatic sign-out of idle administrators, private file storage with access checks, access to group information only through recorded investigations the owner approved, encrypted daily database backups, and an audit log of sensitive actions. No system is perfectly secure.

## 9. Changes

Every version of this policy is kept. When it changes materially, we publish a new version with its effective date.
`;
