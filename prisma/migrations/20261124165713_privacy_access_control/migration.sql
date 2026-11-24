-- CreateEnum
CREATE TYPE "GroupAccessScope" AS ENUM ('CHAT', 'RESEARCH', 'FILES', 'TASKS_DECISIONS', 'PROJECTS');

-- CreateEnum
CREATE TYPE "GroupAccessStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'REVOKED', 'EXPIRED', 'CANCELLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PrivacyRequestStatus" ADD VALUE 'VERIFICATION_REQUIRED';
ALTER TYPE "PrivacyRequestStatus" ADD VALUE 'INFO_REQUIRED';
ALTER TYPE "PrivacyRequestStatus" ADD VALUE 'APPROVED_FOR_DELETION';
ALTER TYPE "PrivacyRequestStatus" ADD VALUE 'PROCESSING';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "erasedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ContentReport" ADD COLUMN     "reporterGroupMember" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "PrivacyRequest" ADD COLUMN     "adminNotes" TEXT,
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "completionEmailId" TEXT,
ADD COLUMN     "outcome" JSONB,
ADD COLUMN     "scope" TEXT,
ADD COLUMN     "verificationMethod" TEXT,
ADD COLUMN     "verifiedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "GroupAccessRequest" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "requestedById" TEXT,
    "reason" TEXT NOT NULL,
    "requestedScope" "GroupAccessScope"[],
    "requestedHours" INTEGER NOT NULL,
    "status" "GroupAccessStatus" NOT NULL DEFAULT 'PENDING',
    "grantedScope" "GroupAccessScope"[],
    "startsAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "revokedById" TEXT,
    "revokedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupAccessRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GroupAccessRequest_status_expiresAt_idx" ON "GroupAccessRequest"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "GroupAccessRequest_requestedById_status_idx" ON "GroupAccessRequest"("requestedById", "status");

-- CreateIndex
CREATE INDEX "GroupAccessRequest_groupId_idx" ON "GroupAccessRequest"("groupId");

-- AddForeignKey
ALTER TABLE "GroupAccessRequest" ADD CONSTRAINT "GroupAccessRequest_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "ContentReport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupAccessRequest" ADD CONSTRAINT "GroupAccessRequest_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ResearchGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupAccessRequest" ADD CONSTRAINT "GroupAccessRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupAccessRequest" ADD CONSTRAINT "GroupAccessRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupAccessRequest" ADD CONSTRAINT "GroupAccessRequest_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

