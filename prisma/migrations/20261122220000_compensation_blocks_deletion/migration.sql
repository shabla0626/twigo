-- M2 (audit finding P1-6): a compensation agreement can no longer disappear as
-- a side effect of deleting something else.
--
-- Before: deleting a project or a participant record deleted their assignments,
-- and with them the compensation agreements (ON DELETE CASCADE).
-- After: the database refuses to delete an assignment that still has an
-- agreement (ON DELETE RESTRICT). The owner must first remove the agreement in
-- its own, audited action.
--
-- Constraint change only: no row is added, changed or deleted.
-- To undo: the same two statements with ON DELETE CASCADE.

-- DropForeignKey
ALTER TABLE "CompensationAgreement" DROP CONSTRAINT "CompensationAgreement_assignmentId_fkey";

-- AddForeignKey
ALTER TABLE "CompensationAgreement" ADD CONSTRAINT "CompensationAgreement_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "ProjectAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
