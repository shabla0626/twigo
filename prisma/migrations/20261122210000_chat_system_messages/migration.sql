-- M1 (audit finding P1-1): system lines in group chat.
--
-- Every change of a group's membership (joined, left, removed, new coordinator)
-- is written into the group's chat as a line without an author, so members can
-- always see who entered or left their private conversation.
--
-- Additive only: one new type and one new column with a default. Existing
-- messages keep their content and become kind USER. Nothing is deleted.
-- To undo: ALTER TABLE "ChatMessage" DROP COLUMN "kind"; DROP TYPE "ChatMessageKind";

-- CreateEnum
CREATE TYPE "ChatMessageKind" AS ENUM ('USER', 'SYSTEM');

-- AlterTable
ALTER TABLE "ChatMessage" ADD COLUMN "kind" "ChatMessageKind" NOT NULL DEFAULT 'USER';
