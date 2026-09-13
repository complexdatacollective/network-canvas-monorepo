# Timing backend review checkpoint

The wave queue now owns both projections. Long recomputation holds an advisory lock without holding the wave lease row, allowing heartbeat renewal; publication checks the source generation and lease and rolls back stage rows if either changed. Timing ingestion derives the current stage ID from the validated pinned-protocol index. Seed projections count the latest exit direction and use zero missing values when no applicable payload variable is represented.

Validation: 47 PostgreSQL timing/seed tests passed. The new long-running recomputation and null-stage-ID cases failed against the predecessor. The seed oracle failed before the latest-exit correction. The single-worker test failed against the two-worker predecessor and passed after restoration. Studio server typecheck, focused lint, and Knip passed (only the two existing configuration hints).

This is a durable partial review checkpoint. The migration must still queue existing waves after the message migration is corrected. Participant runtime timing fixes and the final integrated adversarial review remain pending. No production qualification is claimed.
