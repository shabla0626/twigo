-- The new enum value cannot be used in the same transaction that adds it.
ALTER TABLE "GroupInvitation" ALTER COLUMN "status" SET DEFAULT 'VOTING';
