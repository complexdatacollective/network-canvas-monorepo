-- Candidate-next's hand-written backfill (#1901), sealed into the generated
-- migration by build-next.sh. Every protocols row gets a value derived from
-- its own id, so the lane can tell a row the backfill reached from one it did
-- not: the delta's default is 'delta-default'. Under FORCE ROW LEVEL SECURITY
-- the migration owner's UPDATE would match no rows and say nothing, which is
-- what the role switch is for (apps/studio/api/migrations/README.md,
-- Backfills).
--
-- `protocols` rather than `studies`: the first run of this lane backfilled
-- `studies`, and the immutability trigger refused the UPDATE ("closed studies
-- are read-only"). A migration's artefacts run delta, then sidecars, then
-- backfill, so a backfill runs under the triggers of the release it installs
-- — and this release keeps that trigger. A backfill that has to write such
-- rows disables the named trigger as the owner inside the migration, as
-- api/migrations/README.md describes; `protocols` carries no UPDATE trigger,
-- so this one needs nothing of the kind.
SET LOCAL ROLE studio_maintenance;
UPDATE public.protocols SET release_test_probe = 'backfilled:' || id;
RESET ROLE;
