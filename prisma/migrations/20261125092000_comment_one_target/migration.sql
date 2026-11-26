-- The original check allowed an idea or a group discussion only.
-- A discussion-board comment uses articleId, so the newer check replaces it.
ALTER TABLE "Comment" DROP CONSTRAINT "Comment_one_parent_check";
