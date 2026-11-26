# Twigo product consistency audit

Date: 2026-11-25

Scope: the local project at `D:\MyProject\Co_work` as it exists in the working tree, including uncommitted community changes (anonymity, self-join, Senior/Starter, invitation votes, project channel, cultural works). This is a reading of the code, schema, and existing tests. The test suite was not re-run, because that suite writes to a database and this audit was not allowed to change data. Production was not contacted.

This document does not change the application. Corrective work waits for approval.

Two sources of “intended behavior” are in play and they are not identical:

- This assignment’s statement of Twigo’s original model.
- Later founder instructions already implemented in this working tree: anonymous profiles until a shared project, open self-join as Starter, Senior production, and a Senior vote before an invitation makes someone a Senior.

Where those sources agree, the implementation is judged against both. Where they disagree, the finding is marked **UNCERTAIN** rather than “fixed” by choosing one.

## 1. Executive assessment

The current implementation still represents the original model in its load-bearing parts. A visitor does not become a community member by registering. An idea opens one group when two other active members support it. The group writes its own agreement. The software does not take a share, hold project money, or pay people. Private chat, files, research, and agreements stay with group members. An administrator reads that private material only after a member’s report and a founder-approved, expiring grant.

The product is not logically closed. The newest membership distinction, Senior and Starter, was attached to the agreement rule in a way that lets a person be dropped from the next agreement without the consent protection that rule was written to provide. Coordinator succession does not keep the “a coordinator is a Senior” rule. An older administrator-managed project list still sits beside member-led group projects and can be published as “roles needed.” Group discussions are readable and writable by approved members who are not in the group, while chat is not.

Overall classification: **partially coherent**.

## 2. Product logic map

```text
Visitor
  → free account (email + password)
  → email verification
  → membership application
  → human review
  → acceptance sets CommunityMembership ACTIVE
  → approved member

Approved member
  → proposes a business idea
  → other active members support it (not the author, not money)
  → when the stored threshold is reached (default 2)
       one ResearchGroup is created inside the same locked transaction
       author is coordinator and Senior
       supporters are founding members and Seniors
       one chat channel is created
       the idea becomes GROUP_FORMED

Later entry, current working tree
  → self-join: Starter
       discussion, chat, meetings, research, profiles
       not project writes, not channel publishing
  → a member proposes an invitation
       Seniors vote
       more than half the voting weight: invitation is sent
       acceptance: Senior, no starter check

Inside the group
  → collaboration (chat, meetings, research, tasks, decisions, files, announcements)
  → a Senior creates a GroupProject
  → participants write a versioned agreement and each accepts that exact text
  → commercial activity and payment stay outside Twigo

Separate, older path
  → administrator Project, optional public listing on /participation
  → Participant / ProjectAssignment
  → not the member-written GroupProject agreement
```

`ResearchGroup.ideaId` is unique. `createGroupFromIdea` runs only from `evaluateIdea` after `SELECT … FOR UPDATE` on the idea, and only when no group row exists. Support does not create a payment obligation.

## 3. Business rule inventory

| Rule | Authoritative place | Also used by | Data | Tests seen |
| --- | --- | --- | --- | --- |
| Slogan kept literally | `src/content/opening.ts`, homepage | public pages | site content | not re-run |
| No fee, no commission, no platform share | `src/lib/content/defaults.ts`, `src/content/opening.ts`, `src/server/community/group-projects.ts` agreement preamble | homepage, compensation page, help, welcome | agreement text | privacy/legal text probes |
| Registration is not membership | `hasCommunityAccess` in `src/lib/auth/session-core.ts` | pages, actions, Socket.IO | `User.membershipStatus`, `emailVerifiedAt` | auth tests exist in the suite |
| Acceptance grants membership | `updateApplicationStatus` in `src/server/admin/applications.ts` | admin applications UI, email after commit | `Application`, `Participant`, `MemberProfile` | application tests in the suite |
| Author cannot support own idea | `endorseIdea` in `src/server/community/ideas.ts` | idea page | `IdeaEndorsement` | community tests |
| Threshold default 2, one counter | `SETTINGS["community.endorsementThreshold"]` in `src/config/org-settings.ts`; `evaluateIdea` | help, ideas, operators, welcome | `BusinessIdea.endorsementCount` | community tests |
| One group per idea, locked | `evaluateIdea`, `createGroupFromIdea` | notifications after commit | `ResearchGroup.ideaId` unique | community tests |
| Material idea edit clears support before a group exists | `updateIdea` | idea history UI | `IdeaRevision` | community tests |
| After a group exists, idea direction changes in the group | `updateIdea` refusal; `updateGroupInfo` | coordinator tools | `GroupDecision`, announcement, chat line | stage tests |
| Staff are not group members | `GROUP_PARTICIPANT`, `groupAccess`, `channelAccess` | join, support, chat, files | membership rows ignored for staff | `tests/privacy-access-control.test.ts` |
| Private chat requires active membership and is rechecked | `channelAccess` in `src/realtime/chat-service.ts` | `src/realtime/server.ts` | `ChatMessage` | privacy and regression probes |
| Investigation is report + owner grant + scope + expiry | `src/server/admin/group-access.ts` | agreement download, file download | `GroupAccessRequest`, audit before read | privacy access tests |
| Agreement text freezes at open; fingerprint must match | `openForAcceptance`, `acceptAgreement` | project page, `/api/agreements/[id]` | `ProjectAgreementVersion.contentHash` | agreement tests in the suite |
| In-force participants are not silently omitted | `openForAcceptance` | — | `ProjectAgreementParticipant` | the guard exists; the Senior filter weakens it (finding C1) |
| Twigo does not move project money | no payment module; agreement says the platform does not collect, hold, or distribute | public copy | none | wording tests |
| Deletion is staged and does not claim completion early | `src/server/privacy-deletion.ts` | account delete page, admin privacy requests | privacy request rows, audit | `tests/privacy-access-control.test.ts` |
| Senior / Starter | `GroupMembership.standing`; `requireExpert` | projects, channel publish, invitation accept | `MemberStanding` | join tests updated; no consent test for demotion |
| Invitation vote | `src/server/community/invitations.ts` | members page, profile invite form | `GroupInvitation`, `GroupInvitationVote` | no dedicated vote test found |

The endorsement threshold is not copied as a second number in business code. Pages read `getSetting("community.endorsementThreshold")`. The owner may set it from 1 to 50. Lowering it reevaluates open ideas. The default remains 2.

## 4. Architecture assessment

The application is one Next.js process with a custom server (`server.ts`): pages and server actions, Prisma, Socket.IO on `/socket.io`, and scheduled jobs. That boundary fits a member community. Authorization for chat and files is repeated on the server, not only in the page.

Sound boundaries:

- Community access is one flag, `communityAccess`, checked by pages, actions, file routes, and the socket handshake.
- Group privacy for chat, research, files, and agreements is membership or an investigation grant.
- Idea support and group creation share one locked function.
- Agreement versions are rows. Opening one does not edit it in place.

Problems:

- **Two project models.** `Project` (`prisma/schema.prisma` around the participants section) is an administrator record with roles, assignments, milestones, and `isPublished`. `GroupProject` is the member-led undertaking with versioned agreements. `Project.researchGroupId` can point at a group, and a group status `APPROVED_FOR_PROJECT` is then administrator-managed (`setGroupStatusByCoordinator`). They are not the same workflow. Publishing a `Project` feeds `/participation` through `getPublishedOpportunities`. That page can show “Roles needed.” Empty, it correctly says projects start from members’ ideas. The dangerous case is a published row. Do not delete either model until a decision says whether the administrator record is only historical.

- **Standing is now coupled to consent.** `MemberStanding` was added for production access. `openForAcceptance` uses that same flag as the set of people who must not be omitted. A membership label therefore changes a contract rule. That coupling is the defect in C1.

- **Group discussions are outside the membership boundary.** `createDiscussion` in `src/server/community/comments.ts` checks that the group is open. It does not check membership. The discussions page tells every approved member they can read and reply, and warns them not to post confidential information. Chat does the opposite and checks membership on every socket event.

- **Comment drift.** `channelAccess` documents that owners “take part in groups like any member,” then returns null for `OWNER` and `ADMIN`. The refusal matches the privacy rule. The comment does not.

Maintainability: business rules for support and agreements are concentrated. The new invitation and standing rules live in `invitations.ts`, `groups.ts`, and `group-projects.ts` without a test that walks demotion through an open agreement.

## 5. Privacy and security assessment

Enforced in code:

- Staff cannot join groups, support ideas, or open live chat. `channelAccess` returns null for owner and administrator accounts. Investigation views are not the live socket.
- `authorizeGroupRead` requires a member report, an approved request, the requesting administrator, the granted scope, and an unexpired window. `MAX_ACCESS_DAYS` is 30. The founder still chooses the start and end inside that cap. A longer investigation needs a new approval. The privacy text already says “at most 30 days.” This audit does not treat that cap as an invented requirement.
- The view is written to the audit log before the data is returned. If that write fails, the read does not proceed.
- Agreement download (`src/app/api/agreements/[id]/route.ts`) and group file download (`authorizeDownload`) use the same grant. Draft agreements are not downloaded.
- Socket `channel:join`, history, send, edit, and delete call `channelAccess` again. A revoked member is removed from the room on `group.access_revoked`.
- Sessions are stored as hashes. Administrator mail status uses `EmailStatus`, and `ACCEPTED` is commented as not proof of inbox delivery. `DELIVERED` depends on the provider webhook.
- Passwords and secrets were not printed or changed for this audit.

Gaps:

- **C1** is also a privacy-of-terms issue: compensation text can be replaced for someone who was demoted.
- **Profile photos.** `authorizeDownload` returns any `PROFILE_PHOTO` to any person with community access. The member profile page hides the photo from people who do not share a project. The file route does not apply that teammate rule. The identifier is not shown on the anonymous profile, so this is not a public listing, but a known file id is enough.
- **Discussions** (finding M1) are the wide door into group-adjacent text.
- UI hiding is not the control for chat and files. Those routes check the server. Discussions and profile-photo bytes do not match the newer display rules.

No alternate administrator membership path was found in `groupAccess` or `channelAccess`.

## 6. Revenue and agreement assessment

No code path collects, holds, splits, or pays project money. No commission field is applied to a group project. The agreement preamble in `group-projects.ts` states that Twigo is not a party and receives no share, commission, or fee. Public FAQ and compensation copy say contributions to the community are optional and give no privilege. That matches sections 14–16.

The agreement record itself is substantial and matches section 13’s list: scope, deliverables, timeline, customer, contracting model, payment recipient, expenses, gross and net revenue definitions, distribution formula, schedule, intellectual property, confidentiality, withdrawal, disputes, per-person responsibilities and compensation, version, SHA-256 fingerprint, acceptance time, decline, and withdrawal. Acceptance compares the fingerprint under a row lock. A draft is frozen when opened. Concurrent acceptance is serialized with `lockProject` and `FOR UPDATE`.

The software does not pretend that acceptance is the customer’s payment. The project page says commercial work starts only after acceptance, and payment happens outside the platform.

The failure is not a hidden fee. It is C1: the omission guard was narrowed to Seniors, so a demotion can do what the comment above that guard says must not happen.

`terms.deductions` is text the participants write for taxes and expenses. It is not a platform deduction.

## 7. Membership and group assessment

Membership stages are distinct. `destination` sends a verified account with no application, or a draft, to `/apply`, and a submitted application to `/application`. `hasCommunityAccess` requires an active account, a verified email, and `membershipStatus === ACTIVE`, unless the account is staff. `updateApplicationStatus` grants that status in the same transaction as the acceptance, and sends mail only after the commit. An email failure does not roll the decision back, and the result reports the mail outcome separately. That matches sections 4 and 23.

Idea support matches sections 5–8: not the author, active members only, count stored from the locked query, material change deletes endorsements and tells those people, minor change keeps support and tells them, a formed group blocks a material rewrite of the idea.

Group life matches section 9 in the older machinery. Members can leave. `ensureCoordinator` keeps a single coordinator, promotes the longest-standing eligible member, archives a group with nobody left, and flags a group whose remaining members are not eligible. Suspend and reopen are administrator actions. Reopen calls `ensureCoordinator` rather than inserting a second coordinator. A suspended group fails `channelAccess` and `admitMember`.

What the new standing layer does not keep:

- Founding members are created as `EXPERT` (`createGroupFromIdea`).
- Self-join stays `STARTER` (`admitMember` without an argument).
- A passed invitation calls `admitMember(..., "EXPERT")`.
- `transferCoordinator` and `ensureCoordinator` change `role` only. A Starter can become coordinator and still fail `requireExpert`.
- `setMemberStanding` refuses to mark the current coordinator as Starter. It does not refuse to hand the role to a Starter, and succession never promotes standing.

Section 3 of this assignment says formal qualifications must not decide whether someone may participate. The later founder instruction says Starters may discuss and must not take part in production until marked Senior, and invited people skip that check after a Senior vote. The code follows the later instruction. This audit does not recommend deleting that distinction. It does require an explicit decision before any “correction” that removes it. See U1.

Direct join remains available, which matches both “approved members may join open groups” and the later correction that invitation is an extra path.

## 8. Accumulated modification assessment

Recent local work, not yet described as deployed:

| Change | Effect on the rest of the product |
| --- | --- |
| Anonymous label until a shared active membership | Idea, board, and non-member group views use `memberLabel`. Admin reports were left able to show real names. Profile photos are not enforced on download (M2). |
| Self-join restored | `joinGroup` delegates to `admitMember`. Pending invitations are no longer auto-accepted on join, so a passed invitation can still make a Starter into a Senior. |
| `MemberStanding` | Production writes and channel publishing call `requireExpert`. Research, meetings, chat, and discussions do not. Agreement eligibility was switched to Seniors (C1). |
| Invitation vote | `inviteToGroup` creates `VOTING` and notifies Seniors. The invitee is notified only after yes-weight is more than half. Weights: each Senior 1; author and coordinator each `max(1, 20% of Seniors)`; one person holding both offices holds both weights. |
| Project channel and cultural works | Public-to-members read models, separate from chat. Channel publish is Senior-only. Cultural works are member installments, not seeded fiction. |
| Fields, discussion board, operators, related links | Added surfaces. They do not take a share or open private chat. Related links are outbound and do not create a group. |

`evaluateIdea` was not given a second threshold. Group creation was not moved out of its transaction. The no-commission sentences were not replaced by a fee.

## 9. Prioritized corrective plan

No correction is applied in this audit.

### C1 — Critical — Demotion drops a person out of agreement protection

- Class: **INCONSISTENT** with section 13. Also **ARCHITECTURALLY COUPLED** to standing.
- Where: `openForAcceptance` and `openProblem` in `src/server/community/group-projects.ts`. The eligible set is active memberships with `standing: "EXPERT"` (about line 281). The omission check uses that set (about line 296). `saveAgreementDraft` rejects a non-Senior participant with the same idea.
- Now: a person on the accepted agreement who is still an active member, but has been marked Starter, is not in `eligible`. The next draft may leave them out. `openForAcceptance` will not refuse. The comment above the check still says an active member who has not recorded leaving must stay listed.
- Intended: changing standing may close production tools. It must not replace that person’s agreed compensation or remove their consent. A new version that omits them still requires their withdrawal, or their acceptance of the version that omits them.
- Evidence: the filter is `eligible.has(p.userId)` after `eligible` was limited to Seniors. `setMemberStanding` in `src/server/community/groups.ts` can set another member to `STARTER`.
- Related: `requireExpert`, members page “Mark as starter,” project editor participant list.
- Consequence: a coordinator or the idea author can remove someone from the next commercial terms by relabeling them, which is the bypass section 13 forbids.
- Correction, after approval: build the omission set from active members who have not withdrawn, regardless of standing. Keep Seniors as the people who may be newly written into a production agreement, if that product rule remains. Do not let demotion itself count as withdrawal.
- Regression: an accepted agreement names two Seniors; one is marked Starter; opening a draft that omits them must fail until they withdraw. Marking them Senior again must not erase the accepted version.

### H1 — High — A coordinator can be a Starter

- Class: **PARTIALLY IMPLEMENTED** relative to the later founder rule that the coordinator stays a Senior. **INCONSISTENT** with “the group must remain able to do its work” if production is Senior-only and the only coordinator is a Starter.
- Where: `ensureCoordinator` and `transferCoordinator` in `src/server/community/groups.ts`. Both write `role: "COORDINATOR"` and do not write `standing`.
- Now: succession promotes the longest-standing eligible member. Hand-over can target any active member. `requireExpert` then blocks that coordinator from creating or editing a group project. `setMemberStanding` will not mark a coordinator down to Starter, but it never lifts a new coordinator up.
- Intended: whoever holds the coordinator role is a Senior, or the role cannot be given to a Starter.
- Evidence: founding creation sets both role and `standing: "EXPERT"`. Succession’s `update` sets only the role.
- Related: `canClassify`, project `requireExpert`, members page.
- Consequence: after the founding Seniors leave, a Starter coordinator cannot open production, and nobody else is required to promote them.
- Correction, after approval: when a member becomes coordinator, set `standing` to `EXPERT` in the same transaction, or refuse the hand-over until they are a Senior. Add the same rule to succession.
- Regression: the only Senior leaves; the remaining Starter becomes coordinator and `isExpert` is true. Hand-over to a Starter either promotes them or is refused.

### M1 — Medium — Group discussions ignore membership

- Class: **INCONSISTENT** with section 10’s requirement that group tools share membership rules. The screen text is consistent with itself: it invites every approved member.
- Where: `createDiscussion` in `src/server/community/comments.ts`. The discussions page renders the start form when the group is open, not when the viewer is a member.
- Now: any approved member who can call the action can open a discussion on any open group, and approved members can read it. Names of authors are masked for non-members.
- Intended by section 10: private collaboration stays inside the group. Intended by the current page: this board is public to the community and must not be used for secrets. Chat remains the private room.
- Evidence: `createDiscussion` checks suspension and archive only. The page copy says every approved member can read and reply.
- Consequence: internal plans posted as a “discussion” are community-visible. Members are warned, but the server does not stop a non-member from writing.
- Correction, after a product decision: either require membership to create and reply, or keep the public board and say in the group header that this tab is not private. Do not silently switch it.
- Regression: a non-member’s create and reply are refused if the decision is “members only”; they still succeed if the decision is “public board.”

### M2 — Medium — Profile photo bytes ignore the anonymous profile

- Class: **INCONSISTENT** with the later anonymity rule. **SECURITY OR PRIVACY RISK** at the file route, not on the profile page.
- Where: `authorizeDownload` in `src/server/community/files.ts`. `PROFILE_PHOTO` returns the file for any community member.
- Now: the profile page hides the photo from non-teammates. A request to `/api/files/{id}` does not ask whether the viewer shares a group with the owner.
- Intended by the later rule: people who do not share a project do not receive the photo.
- Evidence: the function returns before the group-membership branch when `scope === "PROFILE_PHOTO"`.
- Consequence: disclosure depends on the id staying secret.
- Correction, after approval: allow the photo to its owner, to teammates, and to staff who already may see the account in an application or member record. Everyone else receives the same 404 as a missing file.
- Regression: a non-teammate with community access receives 404; a teammate receives the image.

### M3 — Medium — Administrator project listings remain a second public work list

- Class: **LEGACY OR OBSOLETE** relative to “not a job board,” still **live**.
- Where: model `Project`; `getPublishedOpportunities` in `src/server/public.ts`; `src/app/(site)/participation/page.tsx`; admin project editor `isPublished`.
- Now: a published project in `SEEKING_PARTICIPANTS`, `PLANNING`, or `READY` is shown with role titles. No such row is required for the page to render. The empty state points people to member ideas.
- Intended: member groups create projects and agreements. Twigo does not recruit into administrator-owned jobs.
- Evidence: `Project` and `GroupProject` are different models. Only `GroupProject` has the member agreement.
- Consequence: one published administrator project would look like an opening Twigo is offering.
- Correction, after approval: keep the historical records. Stop publishing them as opportunities, or label any remaining row as a past administrator record that is not a member group and not a job offer. Do not merge the tables in this step.
- Regression: `isPublished: true` does not add a “roles needed” card, once that decision is made.

### L1 — Low — Agreement errors describe Starters as gone

- Class: **INCONSISTENT** wording, same code path as C1.
- Where: `openProblem` in `src/server/community/group-projects.ts`.
- Now: a listed participant who is an active Starter fails the Senior set, and the message says they are no longer an active member.
- Correction: follows C1. The message should name the real reason if a non-member is listed.

### L2 — Low — Chat comment contradicts the staff ban

- Class: **LEGACY** comment. Behavior is **CONSISTENT** with the privacy rule.
- Where: `ChannelAccess.historyFrom` and `channelAccess` in `src/realtime/chat-service.ts`.
- Now: staff receive null access. The comment above `historyFrom` still says staff take part and their history starts at join.
- Correction: rewrite the comment so a later edit does not “restore” staff chat from the comment.

### U1 — Uncertain — Does standing restrict participation?

- This assignment says formal qualifications must not decide participation, and approved members may join open groups.
- Later founder messages say everyone may join, Starters do not produce until marked Senior, and an invitation that Seniors approve skips that check.
- The code implements the later messages, except for H1 and C1.
- Do not remove Senior/Starter, and do not make invitation the only entrance, until the founder says which sentence governs.

### U2 — Uncertain — Group discussions versus private collaboration

- Recorded under M1. The page and section 10 of this assignment disagree. The founder should say which one stands. The audit does not pick.

### Checked and consistent enough to leave

- Slogan string in the opening content.
- No membership fee and no project commission in the member agreement or the public FAQ.
- No payment processor and no automatic revenue split.
- One endorsement implementation, default threshold 2, row lock, unique group per idea.
- Author cannot self-support. Material edits reset support only before a group exists.
- Staff excluded from live chat, support, and ordinary group membership.
- Investigation grant: member report, owner decision, scope, expiry, audit-before-read, no live socket.
- Agreement fingerprint, version row, lock, explicit acceptance.
- Deletion request stages and “not finished until execution” behavior covered by `tests/privacy-access-control.test.ts`.
- Email statuses distinguish provider acceptance from delivery.

### Journey coverage

The assignment’s 27 scenarios were not executed here. Existing suites already name many of them: registration and application, endorsement and single group creation, removal and rejoin, coordinator hand-over, chat refusal for non-members and staff, investigation access, deletion stages, and agreement acceptance. Not found as a dedicated test: Senior demotion against an in-force agreement (C1), succession of a Starter (H1), or the invitation vote arithmetic. A happy-path browser check of the members page does not cover those.

## 10. Overall conclusion

**Partially coherent.**

The original identity is still the spine of the software. People apply, members support ideas, one group forms, members write the agreement, and Twigo does not take the money or read the private room at will.

The accumulated Senior work is the break in that spine. It is a real product rule from later instructions, and it was wired into the agreement’s consent check so that relabeling a participant can drop them from the next version. Coordinator succession was not updated to the same rule, so the person who must keep the group usable can be the person who is barred from production.

Until C1 and H1 are decided and fixed, further features should not be built on top of agreement participation or coordinator changes. The legacy administrator project list should be treated as a separate historical tool, not as the member project.

No application code, legal text, production system, or git remote was changed for this audit.
