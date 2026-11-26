-- CreateEnum
CREATE TYPE "GroupInviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'REVOKED');

-- CreateEnum
CREATE TYPE "CulturalKind" AS ENUM ('SOCIAL', 'LITERATURE', 'CREATIVE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ReportTarget" ADD VALUE 'PROJECT_BROADCAST';
ALTER TYPE "ReportTarget" ADD VALUE 'CULTURAL_WORK';

-- CreateTable
CREATE TABLE "GroupInvitation" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "inviterId" TEXT,
    "inviteeId" TEXT NOT NULL,
    "status" "GroupInviteStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "GroupInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectBroadcast" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "authorId" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "commentCount" INTEGER NOT NULL DEFAULT 0,
    "removedAt" TIMESTAMP(3),
    "removedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectBroadcast_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectBroadcastComment" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "authorId" TEXT,
    "body" TEXT NOT NULL,
    "removedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectBroadcastComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CulturalWork" (
    "id" TEXT NOT NULL,
    "authorId" TEXT,
    "kind" "CulturalKind" NOT NULL,
    "seriesTitle" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "removedAt" TIMESTAMP(3),
    "removedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CulturalWork_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GroupInvitation_inviteeId_status_idx" ON "GroupInvitation"("inviteeId", "status");

-- CreateIndex
CREATE INDEX "GroupInvitation_groupId_status_idx" ON "GroupInvitation"("groupId", "status");

-- CreateIndex
CREATE INDEX "ProjectBroadcast_groupId_createdAt_idx" ON "ProjectBroadcast"("groupId", "createdAt");

-- CreateIndex
CREATE INDEX "ProjectBroadcast_authorId_idx" ON "ProjectBroadcast"("authorId");

-- CreateIndex
CREATE INDEX "ProjectBroadcastComment_postId_createdAt_idx" ON "ProjectBroadcastComment"("postId", "createdAt");

-- CreateIndex
CREATE INDEX "CulturalWork_kind_createdAt_idx" ON "CulturalWork"("kind", "createdAt");

-- CreateIndex
CREATE INDEX "CulturalWork_seriesTitle_idx" ON "CulturalWork"("seriesTitle");

-- CreateIndex
CREATE INDEX "CulturalWork_authorId_idx" ON "CulturalWork"("authorId");

-- AddForeignKey
ALTER TABLE "GroupInvitation" ADD CONSTRAINT "GroupInvitation_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ResearchGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupInvitation" ADD CONSTRAINT "GroupInvitation_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupInvitation" ADD CONSTRAINT "GroupInvitation_inviteeId_fkey" FOREIGN KEY ("inviteeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectBroadcast" ADD CONSTRAINT "ProjectBroadcast_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ResearchGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectBroadcast" ADD CONSTRAINT "ProjectBroadcast_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectBroadcastComment" ADD CONSTRAINT "ProjectBroadcastComment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "ProjectBroadcast"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectBroadcastComment" ADD CONSTRAINT "ProjectBroadcastComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CulturalWork" ADD CONSTRAINT "CulturalWork_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

