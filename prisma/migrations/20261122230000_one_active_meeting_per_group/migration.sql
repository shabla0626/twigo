-- M3 (audit finding P2-10): a group can have only one meeting in progress.
--
-- Starting a meeting checked "is one in progress?" and then created a row, so
-- two members pressing "Start" at the same moment could create two meetings.
-- This partial unique index makes that impossible in the database itself.
-- (Prisma's schema file cannot express a partial index; like
-- "Application_one_open_per_applicant" it exists only here.)
--
-- Step 1 closes older duplicates so the index can be created: where a group has
-- more than one meeting still marked "in progress", all but the newest are
-- marked as ended. No row is deleted. (The development database has no meeting
-- in progress today, so step 1 changes nothing there.)
-- To undo: DROP INDEX "GroupMeeting_one_active_per_group";

UPDATE "GroupMeeting" m
   SET "endedAt" = (now() AT TIME ZONE 'UTC') -- times are stored as UTC without a zone
 WHERE m."endedAt" IS NULL
   AND EXISTS (
         SELECT 1 FROM "GroupMeeting" n
          WHERE n."groupId" = m."groupId"
            AND n."endedAt" IS NULL
            AND (n."startedAt" > m."startedAt" OR (n."startedAt" = m."startedAt" AND n."id" > m."id"))
       );

CREATE UNIQUE INDEX "GroupMeeting_one_active_per_group" ON "GroupMeeting" ("groupId") WHERE "endedAt" IS NULL;
