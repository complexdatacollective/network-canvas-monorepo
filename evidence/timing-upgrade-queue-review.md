# Queue pre-existing waves when introducing timing recomputation

The unpublished 0016 migration was regenerated through the shared authoring engine with the reviewed after-SQL in timing-upgrade-backfill.sql. It inserts missing wave projections and marks every existing wave dirty, so the one wave worker can rebuild both projections. Earlier migration directories remain unchanged at this checkpoint.

A real populated predecessor regression failed before the correction: only one fresh generation-zero row existed while the other two waves were absent from the queue. The corrected migration admits all three; the actual maintenance-role worker consumes each once, clears stale state, resets the old counts, and deletes the obsolete stage-only projection. Typecheck, focused lint and Knip pass.

This checkpoint is based on the preceding message parent. After integrating the corrected unpublished message migration, 0016 must be regenerated again against that parent's snapshot and the populated-upgrade tests repeated. Participant browser timing and final integrated review remain separate pending work.
