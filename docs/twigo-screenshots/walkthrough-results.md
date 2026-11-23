| Role | Step | Result | Note | Screenshot |
|---|---|---|---|---|
| Visitor | opens / | passed |  | `01-visitor-home.png` |
| Visitor | opens /how-it-works | passed |  |  |
| Visitor | opens /about | passed |  |  |
| Visitor | opens /compensation | passed |  |  |
| Visitor | opens /participation | passed |  |  |
| Visitor | opens /founding-contributors | passed |  |  |
| Visitor | opens /faq | passed |  |  |
| Visitor | opens /work-with-us | passed |  |  |
| Visitor | opens /legal/community-guidelines | passed |  |  |
| Visitor | opens /legal | passed |  |  |
| Visitor | opens /legal/terms | passed |  |  |
| Visitor | opens /legal/privacy | passed |  |  |
| Visitor | opens /legal/notices | passed |  |  |
| Visitor | opens /support | passed |  |  |
| Visitor | meetings are described as Google Meet, with no built-in voice or video promised | passed |  |  |
| Visitor | revenue wording matches the Twigo model | passed |  | `02-visitor-pay-and-fairness.png` |
| Visitor | policies are shown as drafts awaiting legal review, with no placeholders or invented operator details | passed |  | `03-visitor-legal-draft.png` |
| Visitor | community support: optional, no online payment, no invented figures | passed |  | `04-visitor-community-support.png` |
| Visitor | sends a message through the contact form | passed |  | `05-visitor-contact-sent.png` |
| Applicant | Nina (account, no application) signs in and is offered the application | passed |  | `06-applicant-not-started.png` |
| Applicant | fills in and submits the application | passed |  | `07-applicant-received.png` |
| Applicant | the administrator asks for an interview; Nina sees the details | passed |  | `08-applicant-interview.png` |
| Applicant | waitlisted, then declined: Nina can see it and may apply again, but cannot enter | passed |  | `09-applicant-declined.png` |
| Applicant | re-applies after the decline | passed |  | `10-applicant-re-applied.png` |
| Applicant | Omar's application is approved; the same account opens the community | passed |  | `11-applicant-approved-enters.png` |
| Applicant | password recovery and an email outage | passed | covered by browser tests E and F (tests/e2e/phase1.spec.ts) |  |
| Member | navigates the three main areas | passed |  |  |
| Member | edits the profile | passed |  | `12-member-profile-saved.png` |
| Member | uploads a profile photo | passed |  | `13-member-profile-photo.png` |
| Member | proposes a business idea | passed |  | `14-member-idea-published.png` |
| Member | a minor correction keeps support and is recorded in the history | passed |  | `15-member-minor-edit.png` |
| Member | a material change resets support and tells the supporter | passed |  | `16-member-supporter-notified.png` |
| Member | comments on an idea, and the author is notified | passed |  | `17-member-notifications.png` |
| Member | discovers a group and joins it; the group sees a line in its chat | passed |  | `18-member-joined-group.png` |
| Group | plans a project: Maya drafts the agreement, both participants accept it, work starts | passed |  | `19-group-project-agreement.png` |
| Group | chat between two sessions, live | passed |  |  |
| Group | sends a file in the chat; the other member receives it | passed |  | `20-group-chat-attachment.png` |
| Group | membership changes appear in the chat as system lines | passed |  | `21-group-chat-with-system-line.png` |
| Group | Tom leaves after confirming | passed |  |  |
| Group | starts a meeting, a member sees it, the meeting is ended | passed |  | `22-group-meeting-visible-to-member.png` |
| Group | meeting expiry after four hours | passed | covered by automated tests (tests/corrective-meetings.test.ts); waiting four hours in a browser is not practical |  |
| Group | adds a note and a task, and marks the task done | passed |  | `23-group-research.png` |
| Group | uploads a file | passed |  |  |
| Group | records a decision | passed |  | `24-group-decision.png` |
| Group | changes the group's purpose with a reason; it is announced and recorded | passed |  | `25-group-purpose-change-announced.png` |
| Group | hands the coordinator role over (asks first) | passed |  | `26-group-new-coordinator.png` |
| Group | the coordinator's account is suspended: another member takes over at once | passed |  | `27-group-succession.png` |
| Administrator | the owner invites an administrator; the invitation is activated | passed |  | `28-administrator-activated.png` |
| Administrator | must set up two-step verification before the admin area opens | passed |  | `29-administrator-two-step-on.png` |
| Administrator | works with applications, members, moderation and public content | passed |  | `30-administrator-content-saved.png` |
| Administrator | owner-only areas are refused with a plain message | passed |  | `31-administrator-no-access.png` |
| Administrator | joins a group as an ordinary member and sees no earlier chat; the group sees it | passed |  | `32-administrator-admin-sees-no-earlier-chat.png` |
| Owner | sees the contact message from the visitor | passed |  |  |
| Owner | saves organization settings | passed |  | `33-owner-settings.png` |
| Owner | creates a project, assigns a participant and records a compensation agreement | passed |  | `34-owner-compensation.png` |
| Owner | deleting the project is refused while an agreement exists; after removing it, deletion works | passed |  | `35-owner-project-deleted.png` |
| Owner | legal documents: versions, status, acceptance records and notices | passed |  | `36-owner-admin-legal.png` |
| Owner | project agreements: the owner sees the group project and can download it | passed |  | `37-owner-admin-agreements.png` |
| Owner | community support records: payments shown as not available | passed |  | `38-owner-admin-support.png` |
| Owner | Back up now writes a backup | passed |  | `39-owner-backup-written.png` |
| Owner | previews and runs the retention clean-up | passed |  | `40-owner-retention.png` |
