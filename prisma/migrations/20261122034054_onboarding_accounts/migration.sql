-- Onboarding redesign, part 2: accounts, applications and membership.
-- Additive only: no table or existing value is removed.

-- Account: community membership and registration consent.
ALTER TABLE "User" ADD COLUMN "membershipStatus" "CommunityMembership" NOT NULL DEFAULT 'NONE',
ADD COLUMN "membershipChangedAt" TIMESTAMP(3),
ADD COLUMN "membershipChangedById" TEXT,
ADD COLUMN "termsAcceptedAt" TIMESTAMP(3),
ADD COLUMN "termsVersion" TEXT;
CREATE INDEX "User_membershipStatus_idx" ON "User"("membershipStatus");

-- Applicant: linked to an account (null for applications made before accounts existed).
ALTER TABLE "Applicant" ADD COLUMN "userId" TEXT,
ALTER COLUMN "country" DROP NOT NULL,
ALTER COLUMN "timeZone" DROP NOT NULL;
CREATE UNIQUE INDEX "Applicant_userId_key" ON "Applicant"("userId");
ALTER TABLE "Applicant" ADD CONSTRAINT "Applicant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Application: drafts, submission and decision records.
ALTER TABLE "Application" ADD COLUMN "additionalComments" TEXT,
ADD COLUMN "decidedAt" TIMESTAMP(3),
ADD COLUMN "decidedById" TEXT,
ADD COLUMN "draftStep" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "interviewDetails" TEXT,
ADD COLUMN "statusChangedAt" TIMESTAMP(3),
ADD COLUMN "submittedAt" TIMESTAMP(3),
ALTER COLUMN "status" SET DEFAULT 'DRAFT',
ALTER COLUMN "experienceLevel" DROP NOT NULL,
ALTER COLUMN "remoteExperience" DROP NOT NULL,
ALTER COLUMN "motivation" DROP NOT NULL,
ALTER COLUMN "contribution" DROP NOT NULL,
ALTER COLUMN "desiredWork" DROP NOT NULL,
ALTER COLUMN "willingToLearn" SET DEFAULT true,
ALTER COLUMN "privacyNoticeVersion" DROP NOT NULL,
ALTER COLUMN "acknowledgedAt" DROP NOT NULL;
ALTER TABLE "Availability" ALTER COLUMN "schedule" DROP NOT NULL;

-- Backfill: existing applications were all submitted through the old form.
UPDATE "Application" SET "submittedAt" = "createdAt", "statusChangedAt" = COALESCE("reviewedAt", "updatedAt"), "draftStep" = 3 WHERE "status" <> 'DRAFT';
UPDATE "Application" SET "decidedAt" = COALESCE("reviewedAt", "updatedAt") WHERE "status" IN ('ACCEPTED', 'DECLINED');

-- Link applicants to the accounts that were created for them by invitation (strong link via the participant record).
UPDATE "Applicant" a SET "userId" = u."id"
FROM "Participant" p JOIN "User" u ON u."participantId" = p."id"
WHERE p."applicantId" = a."id" AND a."userId" IS NULL;

-- Existing members keep their community access (nobody is downgraded).
UPDATE "User" u SET "membershipStatus" = 'ACTIVE', "membershipChangedAt" = CURRENT_TIMESTAMP
WHERE u."role" = 'MEMBER' AND (u."participantId" IS NOT NULL OR EXISTS (SELECT 1 FROM "MemberProfile" m WHERE m."userId" = u."id"));

-- At most one open application per applicant (a new one is only possible after a decline or withdrawal).
CREATE UNIQUE INDEX "Application_one_open_per_applicant" ON "Application"("applicantId") WHERE "status" NOT IN ('DECLINED', 'WITHDRAWN');
