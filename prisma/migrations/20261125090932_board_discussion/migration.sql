-- AlterEnum
ALTER TYPE "ReportTarget" ADD VALUE 'ARTICLE';

-- AlterTable
ALTER TABLE "BusinessIdea" ADD COLUMN     "sourceArticleId" TEXT;

-- AlterTable
ALTER TABLE "Comment" ADD COLUMN     "articleId" TEXT;

-- CreateTable
CREATE TABLE "BoardArticle" (
    "id" TEXT NOT NULL,
    "authorId" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "commentCount" INTEGER NOT NULL DEFAULT 0,
    "recognitionCount" INTEGER NOT NULL DEFAULT 0,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editedAt" TIMESTAMP(3),
    "removedAt" TIMESTAMP(3),
    "removedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BoardArticle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArticleRecognition" (
    "articleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArticleRecognition_pkey" PRIMARY KEY ("articleId","userId")
);

-- CreateIndex
CREATE INDEX "BoardArticle_lastActivityAt_idx" ON "BoardArticle"("lastActivityAt");

-- CreateIndex
CREATE INDEX "BoardArticle_recognitionCount_idx" ON "BoardArticle"("recognitionCount");

-- CreateIndex
CREATE INDEX "BoardArticle_authorId_idx" ON "BoardArticle"("authorId");

-- CreateIndex
CREATE INDEX "ArticleRecognition_userId_idx" ON "ArticleRecognition"("userId");

-- CreateIndex
CREATE INDEX "BusinessIdea_sourceArticleId_idx" ON "BusinessIdea"("sourceArticleId");

-- CreateIndex
CREATE INDEX "Comment_articleId_createdAt_idx" ON "Comment"("articleId", "createdAt");

-- AddForeignKey
ALTER TABLE "BusinessIdea" ADD CONSTRAINT "BusinessIdea_sourceArticleId_fkey" FOREIGN KEY ("sourceArticleId") REFERENCES "BoardArticle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardArticle" ADD CONSTRAINT "BoardArticle_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleRecognition" ADD CONSTRAINT "ArticleRecognition_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "BoardArticle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleRecognition" ADD CONSTRAINT "ArticleRecognition_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "BoardArticle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A comment belongs to exactly one conversation.
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_one_target_chk" CHECK (
  (CASE WHEN "ideaId" IS NOT NULL THEN 1 ELSE 0 END)
  + (CASE WHEN "discussionId" IS NOT NULL THEN 1 ELSE 0 END)
  + (CASE WHEN "articleId" IS NOT NULL THEN 1 ELSE 0 END) = 1
);

