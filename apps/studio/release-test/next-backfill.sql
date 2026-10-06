-- Candidate-next's hand-written backfill (#1901), sealed into the generated
-- migration by build-next.sh. Every studies row gets a value derived from its
-- own id, so the lane can tell a row the backfill reached from one it did not:
-- the delta's default is 'delta-default'. Under FORCE ROW LEVEL SECURITY the
-- migration owner's UPDATE would match no rows and say nothing, which is what
-- the role switch is for (apps/studio/api/migrations/README.md, Backfills).
SET LOCAL ROLE studio_maintenance;
UPDATE public.studies SET release_test_probe = 'backfilled:' || id;
RESET ROLE;
