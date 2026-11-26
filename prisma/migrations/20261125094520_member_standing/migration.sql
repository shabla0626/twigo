-- CreateEnum
CREATE TYPE "MemberStanding" AS ENUM ('EXPERT', 'STARTER');

-- AlterTable
ALTER TABLE "ResearchGroup" ADD COLUMN     "starterDays" INTEGER;

-- AlterTable
ALTER TABLE "GroupMembership" ADD COLUMN     "standing" "MemberStanding" NOT NULL DEFAULT 'STARTER';

-- People who opened the group, and whoever coordinates it, already take part in production.
UPDATE "GroupMembership" SET "standing" = 'EXPERT' WHERE "founding" = true OR "role" = 'COORDINATOR';

