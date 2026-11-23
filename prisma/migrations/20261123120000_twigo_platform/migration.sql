-- M5 (Twigo platform transformation, 23 November 2026).
--
-- Adds, without changing or deleting any existing row:
--   * legal documents with versions, states and fingerprints, and acceptance records;
--   * member-led group projects with versioned project agreements and per-participant acceptance;
--   * owner-kept records and public aggregate reports for voluntary community support
--     (no payment processing of any kind);
--   * privacy requests from members;
--   * three optional fields on business ideas;
--   * new values in two existing lists (notification type PROJECT_AGREEMENT; report reasons
--     INTELLECTUAL_PROPERTY and DISPUTE).
--
-- To undo: drop the new tables (LegalAcceptance, LegalDocumentVersion, LegalDocument,
-- ProjectAgreementParticipant, ProjectAgreementVersion, GroupProject, SupportLedgerEntry,
-- SupportReport, PrivacyRequest), their new types, and the three new columns of
-- "BusinessIdea". The added list values can stay; they are harmless when unused.

-- CreateEnum
CREATE TYPE "LegalDocumentStatus" AS ENUM ('DRAFT', 'PENDING_LEGAL_REVIEW', 'APPROVED', 'PUBLISHED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "AcceptanceKind" AS ENUM ('ACCEPTED', 'ACKNOWLEDGED');

-- CreateEnum
CREATE TYPE "GroupProjectStatus" AS ENUM ('PLANNING', 'AGREEMENT_PENDING', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProjectAgreementStatus" AS ENUM ('DRAFT', 'OPEN', 'ACCEPTED', 'SUPERSEDED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "SupportEntryKind" AS ENUM ('CONTRIBUTION', 'OPERATING_EXPENSE', 'DEVELOPMENT_EXPENSE', 'OTHER_EXPENSE');

-- CreateEnum
CREATE TYPE "PrivacyRequestKind" AS ENUM ('ACCESS', 'CORRECTION', 'DELETION', 'WITHDRAW_CONSENT', 'OBJECTION', 'OTHER');

-- CreateEnum
CREATE TYPE "PrivacyRequestStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'REJECTED');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'PROJECT_AGREEMENT';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ReportReason" ADD VALUE 'INTELLECTUAL_PROPERTY';
ALTER TYPE "ReportReason" ADD VALUE 'DISPUTE';

-- AlterTable
ALTER TABLE "BusinessIdea" ADD COLUMN     "collaborationApproach" TEXT,
ADD COLUMN     "expectedActivities" TEXT,
ADD COLUMN     "objectives" TEXT;

-- CreateTable
CREATE TABLE "LegalDocument" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LegalDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegalDocumentVersion" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "LegalDocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "content" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "changeSummary" TEXT,
    "materialChange" BOOLEAN NOT NULL DEFAULT false,
    "requiresReacceptance" BOOLEAN NOT NULL DEFAULT false,
    "effectiveDate" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvalNote" TEXT,
    "publishedAt" TIMESTAMP(3),
    "publishedById" TEXT,
    "supersededAt" TIMESTAMP(3),

    CONSTRAINT "LegalDocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegalAcceptance" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "documentKey" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "contentHash" TEXT NOT NULL,
    "kind" "AcceptanceKind" NOT NULL,
    "method" TEXT NOT NULL,
    "context" TEXT,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LegalAcceptance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupProject" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "status" "GroupProjectStatus" NOT NULL DEFAULT 'PLANNING',
    "coordinatorId" TEXT,
    "needsLegalReview" BOOLEAN NOT NULL DEFAULT false,
    "legalReviewNote" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "activatedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "GroupProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectAgreementVersion" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "ProjectAgreementStatus" NOT NULL DEFAULT 'DRAFT',
    "terms" JSONB NOT NULL,
    "content" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "changeNote" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "ProjectAgreementVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectAgreementParticipant" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "userId" TEXT,
    "displayName" TEXT NOT NULL,
    "role" TEXT,
    "responsibilities" TEXT NOT NULL,
    "expectedContribution" TEXT,
    "compensation" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "acceptedHash" TEXT,
    "declinedAt" TIMESTAMP(3),
    "declineNote" TEXT,
    "withdrewAt" TIMESTAMP(3),
    "withdrawalNote" TEXT,

    CONSTRAINT "ProjectAgreementParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportLedgerEntry" (
    "id" TEXT NOT NULL,
    "kind" "SupportEntryKind" NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "occurredOn" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "contributorName" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportReport" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "currency" TEXT NOT NULL,
    "note" TEXT,
    "totals" JSONB,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrivacyRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "email" TEXT NOT NULL,
    "kind" "PrivacyRequestKind" NOT NULL,
    "details" TEXT NOT NULL,
    "status" "PrivacyRequestStatus" NOT NULL DEFAULT 'OPEN',
    "response" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "handledById" TEXT,
    "handledAt" TIMESTAMP(3),

    CONSTRAINT "PrivacyRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LegalDocument_key_key" ON "LegalDocument"("key");

-- CreateIndex
CREATE INDEX "LegalDocumentVersion_documentId_status_idx" ON "LegalDocumentVersion"("documentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "LegalDocumentVersion_documentId_version_key" ON "LegalDocumentVersion"("documentId", "version");

-- CreateIndex
CREATE INDEX "LegalAcceptance_userId_documentKey_idx" ON "LegalAcceptance"("userId", "documentKey");

-- CreateIndex
CREATE INDEX "LegalAcceptance_versionId_idx" ON "LegalAcceptance"("versionId");

-- CreateIndex
CREATE INDEX "GroupProject_groupId_idx" ON "GroupProject"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectAgreementVersion_projectId_version_key" ON "ProjectAgreementVersion"("projectId", "version");

-- CreateIndex
CREATE INDEX "ProjectAgreementParticipant_userId_idx" ON "ProjectAgreementParticipant"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectAgreementParticipant_versionId_userId_key" ON "ProjectAgreementParticipant"("versionId", "userId");

-- CreateIndex
CREATE INDEX "SupportLedgerEntry_occurredOn_idx" ON "SupportLedgerEntry"("occurredOn");

-- CreateIndex
CREATE INDEX "PrivacyRequest_status_createdAt_idx" ON "PrivacyRequest"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "LegalDocumentVersion" ADD CONSTRAINT "LegalDocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "LegalDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalDocumentVersion" ADD CONSTRAINT "LegalDocumentVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalAcceptance" ADD CONSTRAINT "LegalAcceptance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalAcceptance" ADD CONSTRAINT "LegalAcceptance_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "LegalDocumentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupProject" ADD CONSTRAINT "GroupProject_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ResearchGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupProject" ADD CONSTRAINT "GroupProject_coordinatorId_fkey" FOREIGN KEY ("coordinatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupProject" ADD CONSTRAINT "GroupProject_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectAgreementVersion" ADD CONSTRAINT "ProjectAgreementVersion_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "GroupProject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectAgreementVersion" ADD CONSTRAINT "ProjectAgreementVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectAgreementParticipant" ADD CONSTRAINT "ProjectAgreementParticipant_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "ProjectAgreementVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectAgreementParticipant" ADD CONSTRAINT "ProjectAgreementParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrivacyRequest" ADD CONSTRAINT "PrivacyRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrivacyRequest" ADD CONSTRAINT "PrivacyRequest_handledById_fkey" FOREIGN KEY ("handledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

