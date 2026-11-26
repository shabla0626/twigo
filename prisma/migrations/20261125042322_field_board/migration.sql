-- CreateEnum
CREATE TYPE "FieldPostKind" AS ENUM ('EXPERIENCE', 'COLLABORATION');

-- AlterEnum
ALTER TYPE "ReportTarget" ADD VALUE 'FIELD_POST';

-- CreateTable
CREATE TABLE "FieldPost" (
    "id" TEXT NOT NULL,
    "authorId" TEXT,
    "category" "IdeaCategory" NOT NULL,
    "kind" "FieldPostKind" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "links" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "removedAt" TIMESTAMP(3),
    "removedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FieldPost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FieldPost_category_createdAt_idx" ON "FieldPost"("category", "createdAt");

-- CreateIndex
CREATE INDEX "FieldPost_authorId_idx" ON "FieldPost"("authorId");

-- AddForeignKey
ALTER TABLE "FieldPost" ADD CONSTRAINT "FieldPost_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

