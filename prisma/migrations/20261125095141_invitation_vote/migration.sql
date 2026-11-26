-- CreateEnum
CREATE TYPE "InviteVoteChoice" AS ENUM ('YES', 'NO');

-- AlterEnum
ALTER TYPE "GroupInviteStatus" ADD VALUE 'VOTING';

-- CreateTable
CREATE TABLE "GroupInvitationVote" (
    "id" TEXT NOT NULL,
    "invitationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "choice" "InviteVoteChoice" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupInvitationVote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GroupInvitationVote_invitationId_userId_key" ON "GroupInvitationVote"("invitationId", "userId");

-- AddForeignKey
ALTER TABLE "GroupInvitationVote" ADD CONSTRAINT "GroupInvitationVote_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "GroupInvitation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupInvitationVote" ADD CONSTRAINT "GroupInvitationVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

