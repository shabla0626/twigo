-- Invitations that were still waiting on a senior-promotion vote are revoked.
-- They are not converted into membership and they are not sent as pending invitations.
UPDATE "GroupInvitation"
SET "status" = 'REVOKED',
    "respondedAt" = COALESCE("respondedAt", CURRENT_TIMESTAMP)
WHERE "status" = 'VOTING';

-- Replace the invitation status enum without the promotion-only VOTING value.
CREATE TYPE "GroupInviteStatus_new" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'REVOKED');
ALTER TABLE "GroupInvitation" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "GroupInvitation" ALTER COLUMN "status" TYPE "GroupInviteStatus_new" USING ("status"::text::"GroupInviteStatus_new");
ALTER TYPE "GroupInviteStatus" RENAME TO "GroupInviteStatus_old";
ALTER TYPE "GroupInviteStatus_new" RENAME TO "GroupInviteStatus";
DROP TYPE "GroupInviteStatus_old";
ALTER TABLE "GroupInvitation" ALTER COLUMN "status" SET DEFAULT 'PENDING';

ALTER TABLE "GroupInvitationVote" DROP CONSTRAINT "GroupInvitationVote_invitationId_fkey";
ALTER TABLE "GroupInvitationVote" DROP CONSTRAINT "GroupInvitationVote_userId_fkey";

ALTER TABLE "ResearchGroup" DROP COLUMN "starterDays";
ALTER TABLE "GroupMembership" DROP COLUMN "standing";

DROP TABLE "GroupInvitationVote";
DROP TYPE "MemberStanding";
DROP TYPE "InviteVoteChoice";
