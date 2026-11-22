-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EmailStatus" ADD VALUE 'SERVER_UNAVAILABLE';
ALTER TYPE "EmailStatus" ADD VALUE 'AUTH_FAILED';
ALTER TYPE "EmailStatus" ADD VALUE 'SENDER_REJECTED';
ALTER TYPE "EmailStatus" ADD VALUE 'RECIPIENT_REJECTED';
ALTER TYPE "EmailStatus" ADD VALUE 'DELIVERED';
ALTER TYPE "EmailStatus" ADD VALUE 'DELIVERY_FAILED';

-- AlterTable
ALTER TABLE "EmailDelivery" ADD COLUMN     "body" TEXT,
ADD COLUMN     "providerEvent" TEXT,
ADD COLUMN     "providerEventAt" TIMESTAMP(3),
ADD COLUMN     "retryOfId" TEXT;

-- CreateIndex
CREATE INDEX "EmailDelivery_providerMessageId_idx" ON "EmailDelivery"("providerMessageId");

-- CreateIndex
CREATE INDEX "EmailDelivery_to_createdAt_idx" ON "EmailDelivery"("to", "createdAt");

