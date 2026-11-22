-- M4 (audit finding P2-9, founder decision 5): revision history for business ideas.
--
-- Every edit of an idea stores the text as it was BEFORE the edit, who made the
-- edit, and whether it was a minor correction (support is kept) or a material
-- change (support is reset and supporters are asked again). Members can read
-- the history on the idea page.
--
-- Additive only: one new type, one new value in the notification types, one
-- new table. No existing row is changed or deleted.
-- To undo: DROP TABLE "IdeaRevision"; DROP TYPE "IdeaRevisionKind";
-- (the added notification type 'IDEA_CHANGED' can stay; it is harmless when unused).

-- CreateEnum
CREATE TYPE "IdeaRevisionKind" AS ENUM ('MINOR', 'MATERIAL');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'IDEA_CHANGED';

-- CreateTable
CREATE TABLE "IdeaRevision" (
    "id" TEXT NOT NULL,
    "ideaId" TEXT NOT NULL,
    "editorId" TEXT,
    "kind" "IdeaRevisionKind" NOT NULL,
    "before" JSONB NOT NULL,
    "changedFields" TEXT[],
    "supportersBefore" INTEGER NOT NULL DEFAULT 0,
    "supportReset" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdeaRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IdeaRevision_ideaId_createdAt_idx" ON "IdeaRevision"("ideaId", "createdAt");

-- AddForeignKey
ALTER TABLE "IdeaRevision" ADD CONSTRAINT "IdeaRevision_ideaId_fkey" FOREIGN KEY ("ideaId") REFERENCES "BusinessIdea"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdeaRevision" ADD CONSTRAINT "IdeaRevision_editorId_fkey" FOREIGN KEY ("editorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
