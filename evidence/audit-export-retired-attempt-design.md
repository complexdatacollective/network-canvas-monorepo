# Audit export retired-attempt cleanup invariant

An SDK `AbortSignal` bounds how long Studio waits; it does not establish that an
S3-compatible server discarded a request which the client stopped awaiting.
Amazon S3 explicitly permits in-flight multipart part uploads to finish after an
abort, while R2's strong-consistency promise describes visibility after a
completed operation and does not put a bound on a request whose response was
lost. Therefore a local deadline followed by any finite number of empty scans
cannot prove that an abandoned upload will never appear later.

Each export claim must mint and persist a fresh random attempt ID before storage
work, and its private object key must include that attempt ID. The worker must
create a separate durable retired-attempt row for that exact key before the
attempt can be retried, failed, or replaced. That row contains no export bytes,
handle, actor, team, or filter data. It survives deletion of the job and team.
It remains the cleanup authority after successful absence observations, using a
bounded owner-fenced sweep lease and increasing retry interval so empty checks do
not form a busy loop. A late upload or multipart create is consequently removed
on a later sweep. Cleanup responsibility is not erased merely because the store
was empty at a client-selected time.

A successful completion atomically promotes the current attempt's unique key to
the ready job and marks that attempt active, so the retired sweeper cannot delete
the downloadable artifact. When a ready export expires or is consumed, its
attempt is retired in the same audited transaction that removes the job. Every
other path retires the attempt before clearing or replacing the job pointer.
Retries under one long-lived dispatcher still receive distinct attempt IDs and
keys, and cleanup of an older key cannot overwrite or delete a newer ready key.

Provider bucket lifecycle rules remain a second cleanup layer for incomplete
multipart uploads. They do not replace Studio's durable exact-key tombstones or
authorize treating a timed-out remote effect as cancelled.
