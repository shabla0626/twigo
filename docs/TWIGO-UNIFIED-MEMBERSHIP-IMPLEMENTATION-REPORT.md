# Twigo — unified membership implementation report

Date: 25 November 2026. Local workspace only. Production was not contacted, deployed, or migrated. Nothing was committed or pushed.

This report separates **implemented** changes (present in the local code and the local database) from **verified** results (commands and browser checks that actually ran).

## 1. Removed Senior/Starter dependencies

Implemented. Active authorization no longer reads a membership grade.

| Removed | Where it lived |
|---|---|
| `MemberStanding` enum (`EXPERT`, `STARTER`) | `prisma/schema.prisma`; dropped in `prisma/migrations/20261125115330_drop_member_grades` |
| `GroupMembership.standing` | same |
| `ResearchGroup.starterDays` | same |
| `isExpert`, `requireExpert` | `src/server/community/access.ts` |
| `setMemberStanding`, `setStarterDays`, `canClassify` | `src/server/community/groups.ts` |
| Senior-only project writes and Senior-only agreement eligibility | `src/server/community/group-projects.ts` (eligibility is active group members again) |
| Senior-only channel publishing | `src/server/community/broadcast.ts` |
| `GroupInvitationVote`, `InviteVoteChoice`, invitation status `VOTING` | schema and the same migration |
| Vote UI, “Mark as senior/starter”, Senior/Starter badges, starter-check panel | group overview, members, layout, projects, channel, help, explore, profile invite |

`admitMember` no longer takes a grade and no longer rewrites an existing member into another grade.

## 2. Authorization rules that changed

Implemented.

| Rule | Now |
|---|---|
| Basic community access | Unchanged: active account, verified email, and `membershipStatus = ACTIVE`. Owner and administrator accounts still pass `hasCommunityAccess` without an application. |
| Group discussion create and reply | `createDiscussion` and discussion comments call `hasCommunityAccess`. Group membership is not required. Archived and suspended groups still reject new discussion activity. |
| Group chat, research notes, tasks, decisions, meetings, group files, chat attachments | Still require an active group membership. Staff still do not count as group members. |
| Project create, agreement draft, open for acceptance | Any active member of an open group. Participants must be active group members. |
| Channel publish | Any active member of an open group. Reading and commenting stay available to approved community members. |
| Coordinator | Any active member of that group. The role does not change `User.membershipStatus` or `User.status`. |
| Invitation | An active group member may invite an approved community member. The row is `PENDING`. Acceptance calls `admitMember` with no grade. A pending, unverified, suspended, or staff account cannot be invited. |

Pending applicants and suspended members stay outside the community. That gate was not replaced with a new tier.

## 3. Unified membership model

Implemented. There is one community membership for people who have been approved: `CommunityMembership.ACTIVE` on an active, verified account.

These operational states remain: email unverified, application pending (`NONE`), approved (`ACTIVE`), community suspended (`SUSPENDED`), community revoked (`REVOKED`), account suspended, deactivated, and erased placeholder accounts. They are not grades.

No replacement hierarchy, level, or tier was added.

## 4. Coordinator

Implemented, and the succession rule was not rewritten.

- Coordinator is still `GroupRole.COORDINATOR` on a group membership.
- No Senior or Starter check remains on transfer, assignment, or automatic succession.
- Becoming or losing coordinator updates the group role only.
- Succession is still by tenure (“longest-standing” means who has been in the group longest). That wording is not the removed grade.
- A coordinator does not gain other groups’ private areas or platform administrator rights. Those checks were left as they were.
- Verified by `tests/unified-membership.test.ts`: after `transferCoordinator`, community membership is unchanged, all three membership rows stay `ACTIVE`, and the previous coordinator becomes `MEMBER`.

## 5. Projects and agreements

Implemented.

- Creating a group project, editing a draft, and opening it for acceptance no longer call `requireExpert`.
- The eligible participant set is `activeMemberIds` (active group members who are not staff).
- An in-force participant who is still an active member and has not recorded withdrawal still cannot be omitted from the next version. That check uses active membership, not a grade.
- Acceptance is still of one version fingerprint. A coordinator cannot accept for someone else.
- Historical agreement rows are not rewritten by the migration. The migration does not update `ProjectAgreementVersion` or `ProjectAgreementParticipant`.
- Verified: a member who joined after the group opened can create a project, be the only listed participant, and open that version for acceptance, without a grade field.
- The local development database had **0** group projects and **0** agreement rows before and after the migration, so there was no local agreement row to preserve. The isolated migration test inserted one accepted agreement and confirmed compensation `40 percent`, responsibilities, `acceptedHash`, `contentHash`, version status `ACCEPTED`, and project coordinator id were unchanged.
- Administrator-managed `Project` records were not merged, disabled, or removed.

## 6. Discussion access

Implemented and partly verified.

| Action | Who |
|---|---|
| View, read, create, reply | Approved active community members, including people who are not in that group |
| Anonymous, unverified, pending, rejected, suspended, banned | No community access, so no discussion access |

Verified in `tests/unified-membership.test.ts`:

- An approved member who is not in the group created a discussion and a reply. Both rows were stored.
- A pending applicant and a community-suspended member were refused on create and on reply.
- The same outsider received `null` from `channelAccess`, `AccessError` from `getWorkspace` (notes, tasks, decisions, links), and `null` from `authorizeDownload` on a group file. A group member could download that file.

Browser, signed in as Shabla Walter, on the annotation group: the Discussions page states that every approved member can read and reply, and the start-discussion form is present. No discussion was created during the browser check.

Discussion posts and comments are text. There is no discussion-attachment file scope. `StoredFile` scopes remain profile photo, chat attachment, group file, and idea attachment. Group files and chat attachments were not opened to the whole community.

## 7. Invitations and voting

Implemented.

- The weighted Senior vote, `voteOnInvitation`, `openInvitationVotes`, and the members-page vote panel are gone.
- `inviteToGroup` creates `PENDING` and notifies the invitee.
- Invitations that were still `VOTING` are set to `REVOKED` by the migration. They are not turned into membership and they are not delivered as new invitations. The local database had **0** invitations, so no local row was revoked. The isolated test revoked one `VOTING` row and left one `PENDING` row as `PENDING`.
- `GroupInvitationVote` is dropped. It existed only for promotion votes. The local database had **0** vote rows. The isolated test inserted one vote and then dropped the table with the migration.
- Verified: inviting a user with `membershipStatus NONE` fails. Inviting an approved member creates `PENDING` and does not create a membership. Accepting creates an `ACTIVE` `MEMBER` row and does not change community membership.
- Self-join remains. An invitation does not replace application approval.

## 8. Database migration

Implemented: `prisma/migrations/20261125115330_drop_member_grades/migration.sql`.

The generated diff was edited before it was applied. Invitations in `VOTING` are revoked first, then `GroupInviteStatus` is recreated without `VOTING`, then `standing`, `starterDays`, `GroupInvitationVote`, `MemberStanding`, and `InviteVoteChoice` are dropped. The runner’s own transaction is used; the nested `BEGIN/COMMIT` from Prisma’s diff was removed so it would not commit early.

Applied to the local development database `cowork` on `localhost:5433` only, after the isolated test below. `npx prisma generate` and `npx tsc --noEmit` completed with exit code 0.

Earlier migration files that introduced standing and the vote were not edited.

## 9. Existing data preservation

### Isolated database — verified

A new database `cowork_grade_mig` was created on the same local PostgreSQL, loaded with the migrations **before** this one, then given representative rows: 3 users, a coordinator (`EXPERT`) and a member (`STARTER`), one `VOTING` invitation, one `PENDING` invitation, one vote, one project, one accepted agreement, one discussion, one chat message, one audit row whose metadata still says `STARTER`/`EXPERT`, one group file, one notification, and `starterDays = 30`.

After the new SQL, verified:

- Users, memberships, coordinator role, founding flag, project, agreement text, compensation, acceptance hash, discussion, chat body, file, and audit metadata were still there.
- `standing` and `starterDays` were gone.
- The vote table and both grade enums were gone.
- The `VOTING` invitation was `REVOKED`. The `PENDING` invitation was still `PENDING`.

That database was then dropped. It was not the development database and not production.

### Local development database — verified

Counts immediately before the migration and after `npm run db:deploy`:

| Table | Before | After |
|---|---|---|
| User | 6 | 6 |
| GroupMembership | 3 | 3 |
| ResearchGroup | 1 | 1 |
| GroupProject | 0 | 0 |
| ProjectAgreementVersion | 0 | 0 |
| ProjectAgreementParticipant | 0 | 0 |
| GroupDiscussion | 0 | 0 |
| ChatMessage | 3 | 3 |
| AuditLog | 114 | 114 |
| GroupInvitation | 0 | 0 |
| StoredFile | 0 | 0 |
| Notification | 5 | 5 |

Membership roles after the migration: 1 `COORDINATOR` / `ACTIVE`, 2 `MEMBER` / `ACTIVE`. Before the migration all 3 memberships were `EXPERT`. The grade column is gone; the rows and roles remain. `gradeColumns` and `GroupInvitationVote` were absent after the migration.

## 10. Files and modules modified for this change

These are the files this task changed. The working tree already contained other uncommitted work (homepage, discussions, fields, anonymity, and the earlier Senior/Starter experiment). That other work was not reverted and was not recommitted.

- `prisma/schema.prisma`
- `prisma/migrations/schema.snapshot.prisma`
- `prisma/migrations/20261125115330_drop_member_grades/migration.sql` (new)
- `src/server/community/access.ts`
- `src/server/community/groups.ts`
- `src/server/community/invitations.ts`
- `src/server/community/group-projects.ts`
- `src/server/community/broadcast.ts`
- `src/server/community/comments.ts`
- `src/app/community/actions.ts`
- `src/app/community/(portal)/groups/[slug]/page.tsx`
- `src/app/community/(portal)/groups/[slug]/layout.tsx`
- `src/app/community/(portal)/groups/[slug]/members/page.tsx`
- `src/app/community/(portal)/groups/[slug]/projects/page.tsx`
- `src/app/community/(portal)/groups/[slug]/broadcast/page.tsx`
- `src/app/community/(portal)/groups/page.tsx`
- `src/app/community/(portal)/members/[id]/page.tsx`
- `src/app/community/(portal)/help/page.tsx`
- `src/components/community/members-only.tsx`
- `tests/corrective-stage3b.test.ts` (removed the expectation that a rejoining founding member is `EXPERT`)
- `tests/unified-membership.test.ts` (new)
- Function map canvas updated so it no longer describes Senior, Starter, or promotion votes

`docs/TWIGO-PRODUCT-CONSISTENCY-AUDIT.md` was not rewritten. It is a snapshot of the product before this decision.

## 11. Automated test results

Verified by running the commands. Do not treat a timeout as a passed test.

| Run | Result |
|---|---|
| `npx tsc --noEmit` | Exit 0 |
| `npx vitest run tests/unified-membership.test.ts tests/corrective-stage3b.test.ts tests/twigo-projects.test.ts` | **3 files, 33 tests passed** |
| `npx vitest run` (full suite, database `cowork_test`) | **42 files. 472 passed, 3 failed, 475 total. Duration 3816s.** |
| Re-run of the two backup tests that timed out | Community backup/restore **passed**. The erasure-ledger restore test **timed out again at 240s**. |

The three full-suite failures:

1. `tests/community.test.ts` — backup/restore hit its 180s limit during the full run. **Passed** when run again after the suite, on `cowork_test`.
2. `tests/final-completion.test.ts` — “restoring a backup made before an erasure…” hit its 240s limit in the full run and again when run alone. The failure is `TestTimeoutError`, not an assertion about membership. The test restores a database five times. It was not modified by this task.
3. `tests/corrective-stage3.test.ts` — the home page source does not contain `Accomplish together what is hard to accomplish alone.` The about page still contains the sentence the test requires. This home page was already changed by earlier local work. This task did not edit `src/app/(site)/page.tsx`. The assertion was not changed, because that would alter homepage copy outside this assignment.

`tests/unified-membership.test.ts` is included in the full suite and is among the tests that passed (the three failures are the ones named above).

## 12. Browser test results

Verified in the existing browser session, signed in as Shabla Walter, against `http://127.0.0.1:3000` after the dev server was restarted so it loaded the new Prisma client.

| Page | What was seen |
|---|---|
| Group overview | “You coordinate this group”. No Senior, Starter, vote, or starter-check panel. Coordinator tools still present. Members listed by name. |
| Members | Coordinator and Founding member labels. Make coordinator and Remove remain. No grade badge and no invitation-vote panel. |
| Discussions | Copy says every approved member can read and reply. Start-discussion form is present. No post was submitted. |
| Projects | Create-project form is present for this member. No grade sentence. No project was created. |
| Channel | Publish form is present. Copy says members of the project publish and any approved member can read and comment. Nothing was published. |
| Help | Join/invite and visibility answers have no Senior, Starter, or vote wording. |
| Chat | Composer and member list loaded for this group member. No message was sent. |

Playwright (`npm run test:e2e`) was **not** run.

A second browser account was not created, so the non-member discussion page and the non-member chat refusal were not clicked in the browser. Those paths were verified by the automated test in section 6.

## 13. Obsolete references that remain, and why

| Text | Why it remains |
|---|---|
| `STARTER_IDEAS`, `ensureStarterIdeas`, homepage id `starters-heading` | Example business ideas on the public home page, not a membership grade |
| `labels.ts` `EXPERT: "Expert (10+ years)"` | Experience on an application, not community membership |
| “longest-standing member” | Coordinator succession by time in the group |
| Meeting “starter” | The person who started that meeting |
| “no standing access” in privacy comments and tests | Ordinary English for “no access of their own”, not the removed grade |
| “starter kits” on the home page | A fee the community does not charge |
| Previous migration SQL that created `MemberStanding` and the vote | Applied history. Editing it would change checksums. The new migration drops them. |
| Audit log metadata that mentions the old grades | Kept for history. Current authorization does not read it. The isolated test confirmed a metadata value `STARTER`/`EXPERT` survived. |
| `docs/TWIGO-PRODUCT-CONSISTENCY-AUDIT.md` | Historical audit from before this decision |

## 14. Unresolved issues outside this assignment

- Profile photos can still be downloaded by any community member (`authorizeDownload` returns `PROFILE_PHOTO` without a group check). Not changed.
- Administrator-managed projects and member-led group projects both remain. Not merged.
- The home-page regression test in section 11 still expects a sentence the current home page does not contain.
- The erasure backup test still exceeds its 240 second limit on this machine. The smaller backup/restore test passed when run alone.
- Playwright was not run.
- The public site was not updated. This work is local only.

## Acceptance checklist

| Criterion | State |
|---|---|
| Senior is not an active membership classification | Implemented and verified (schema, typecheck, tests, browser) |
| Starter is not an active membership classification | Implemented and verified |
| No replacement hierarchy | Implemented |
| Approved active members share basic membership rights | Implemented; discussion and project tests cover the grade-shaped holes |
| Coordinator is a group role | Implemented and verified |
| Projects and agreements do not use Senior/Starter | Implemented and verified |
| Existing agreements preserved | Migration does not write those tables. Local count stayed 0. Isolated fixture preserved one accepted agreement. |
| Discussions open to approved members | Implemented and verified by test. Browser confirmed the member UI. |
| Chat, notes, tasks, files stay restricted | Verified by test. Browser confirmed chat still opens for a member. |
| Promotion invitations and voting removed | Implemented. Isolated migration revoked a `VOTING` row. |
| Ordinary invitations work and do not skip approval | Verified by test |
| Other business rules left in place | Idea threshold, one group, investigation grant, no commission, and both project systems were not redesigned |
| Migration preserves data | Verified on the isolated database and on local `cowork` |
| Regression tests | 472 passed in the full run. 3 failed, as recorded in section 11. Not all failures were fixed, because two are timeouts and one is older homepage copy. |
| Production untouched | No SSH, deploy, production SQL, Caddy edit, push, or commit |
