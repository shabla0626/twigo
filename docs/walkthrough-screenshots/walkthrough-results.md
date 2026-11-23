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
| Visitor | opens /community-rules | passed |  |  |
| Visitor | opens /privacy | passed |  |  |
| Visitor | opens /terms | passed |  |  |
| Visitor | meetings are described as Google Meet, with no built-in voice or video promised | passed |  |  |
| Visitor | revenue wording matches the founder's decision | passed |  | `02-visitor-pay-and-fairness.png` |
| Visitor | sends a message through the contact form | passed |  | `03-visitor-contact-sent.png` |
| Applicant | Nina (account, no application) signs in and is offered the application | passed |  | `04-applicant-not-started.png` |
| Applicant | fills in and submits the application | passed |  | `05-applicant-received.png` |
| Applicant | the administrator asks for an interview; Nina sees the details | passed |  | `06-applicant-interview.png` |
| Applicant | waitlisted, then declined: Nina can see it and may apply again, but cannot enter | passed |  | `07-applicant-declined.png` |
| Applicant | re-applies after the decline | passed |  | `08-applicant-re-applied.png` |
| Applicant | Omar's application is approved; the same account opens the community | passed |  | `09-applicant-approved-enters.png` |
| Applicant | password recovery and an email outage | passed | covered by browser tests E and F (tests/e2e/phase1.spec.ts) |  |
| Member | navigates the three main areas | passed |  |  |
| Member | edits the profile | passed |  | `10-member-profile-saved.png` |
| Member | uploads a profile photo | passed |  | `11-member-profile-photo.png` |
| Member | proposes a business idea | passed |  | `12-member-idea-published.png` |
| Member | a minor correction keeps support and is recorded in the history | passed |  | `13-member-minor-edit.png` |
| Member | a material change resets support and tells the supporter | passed |  | `14-member-supporter-notified.png` |
| Member | comments on an idea, and the author is notified | passed |  | `15-member-notifications.png` |
| Member | discovers a group and joins it; the group sees a line in its chat | passed |  | `16-member-joined-group.png` |
| Group | chat between two sessions, live | passed |  |  |
| Group | sends a file in the chat; the other member receives it | passed |  | `17-group-chat-attachment.png` |
| Group | membership changes appear in the chat as system lines | passed |  | `18-group-chat-with-system-line.png` |
| Group | Tom leaves after confirming | passed |  |  |
| Group | starts a meeting, a member sees it, the meeting is ended | passed |  | `19-group-meeting-visible-to-member.png` |
| Group | meeting expiry after four hours | passed | covered by automated tests (tests/corrective-meetings.test.ts); waiting four hours in a browser is not practical |  |
| Group | adds a note and a task, and marks the task done | passed |  | `20-group-research.png` |
| Group | uploads a file | passed |  |  |
| Group | records a decision | passed |  | `21-group-decision.png` |
| Group | changes the group's purpose with a reason; it is announced and recorded | passed |  | `22-group-purpose-change-announced.png` |
| Group | hands the coordinator role over (asks first) | passed |  | `23-group-new-coordinator.png` |
| Group | the coordinator's account is suspended: another member takes over at once | passed |  | `24-group-succession.png` |
| Administrator | the owner invites an administrator; the invitation is activated | passed |  | `25-administrator-activated.png` |
| Administrator | must set up two-step verification before the admin area opens | passed |  | `26-administrator-two-step-on.png` |
| Administrator | works with applications, members, moderation and public content | passed |  | `27-administrator-content-saved.png` |
| Administrator | owner-only areas are refused with a plain message | passed |  | `28-administrator-no-access.png` |
| Administrator | joins a group as an ordinary member and sees no earlier chat; the group sees it | passed |  | `29-administrator-admin-sees-no-earlier-chat.png` |
| Owner | sees the contact message from the visitor | passed |  |  |
| Owner | saves organization settings | passed |  | `30-owner-settings.png` |
| Owner | creates a project, assigns a participant and records a compensation agreement | passed |  | `31-owner-compensation.png` |
| Owner | deleting the project is refused while an agreement exists; after removing it, deletion works | passed |  | `32-owner-project-deleted.png` |
| Owner | Back up now writes a backup | passed |  | `33-owner-backup-written.png` |
| Owner | previews and runs the retention clean-up | passed |  | `34-owner-retention.png` |
