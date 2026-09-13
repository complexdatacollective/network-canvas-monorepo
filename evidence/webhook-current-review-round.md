# Current webhook review corrections

The first ciphertext select and its audited locked recheck can observe different
secrets during rotation. A dedicated internal conflict error now distinguishes
that retryable race from revoked delivery authority. The sender never receives
the rejected plaintext. A PostgreSQL test observes the actual blocked recheck
using pg_blocking_pids before committing the competing rotation; old code
returned suppressed, while the correction produces a retryable result.

New subscriptions accept only team scope because the sole configurable producer
is study.created, emitted before a subscription to that study could exist.
Both the RPC schema and command boundary reject the unusable study scope.
Historical rows remain readable. Callback URLs are bounded before insertion,
including the normalized URL used by the command, matching the database limit.

A success received after an endpoint was disabled no longer resets its failure
counter or last-failure timestamp. The delivery itself still completes and is
audited. A real sender-boundary regression reproduces the late success.

Validation: three new PostgreSQL cases failed against old source; all 18 runtime
tests pass with the corrections. Independently relaxing the RPC URL maximum
causes its boundary oracle to fail. Server typecheck, focused lint, and Knip pass.
No numbered migration changes are required. Existing unpublished webhook
changeset applies.
