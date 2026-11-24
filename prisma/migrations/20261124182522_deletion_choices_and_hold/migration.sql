-- AlterTable
ALTER TABLE "PrivacyRequest" ADD COLUMN     "legalHold" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "legalHoldReason" TEXT,
ADD COLUMN     "removeChat" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "removeComments" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "removeIdeas" BOOLEAN NOT NULL DEFAULT false;

