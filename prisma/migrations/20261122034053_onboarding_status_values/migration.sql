-- Onboarding redesign, part 1: status values.
-- Existing values are RENAMED in place, so every existing application keeps its status:
--   NEW -> SUBMITTED, INTERVIEW -> INTERVIEW_REQUESTED.
ALTER TYPE "ApplicationStatus" RENAME VALUE 'NEW' TO 'SUBMITTED';
ALTER TYPE "ApplicationStatus" RENAME VALUE 'INTERVIEW' TO 'INTERVIEW_REQUESTED';
ALTER TYPE "ApplicationStatus" ADD VALUE 'DRAFT' BEFORE 'SUBMITTED';
ALTER TYPE "ApplicationStatus" ADD VALUE 'WITHDRAWN';

-- Email sent to the local test mail server (never reaches a real inbox).
ALTER TYPE "EmailStatus" ADD VALUE 'CAPTURED_LOCALLY' BEFORE 'NOT_CONFIGURED';

-- Community membership, separate from the account.
CREATE TYPE "CommunityMembership" AS ENUM ('NONE', 'ACTIVE', 'SUSPENDED', 'REVOKED');
