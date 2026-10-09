-- How an interview ended, recorded with its finish time from now on. Interviews
-- finished before this column existed keep NULL in both: which finish stage
-- they ended at was never recorded, and nothing here invents it.
CREATE TYPE "FinishOutcome" AS ENUM ('completed', 'ineligible', 'terminated');

ALTER TABLE "Interview" ADD COLUMN "finishStageId" TEXT;
ALTER TABLE "Interview" ADD COLUMN "finishOutcome" "FinishOutcome";
