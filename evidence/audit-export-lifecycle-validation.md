# Audit export storage lifecycle validation

Validated with Node.js 24.18.0 and an isolated PostgreSQL 18 fixture on
`127.0.0.1:55545` with `max_prepared_transactions=16`. Credentials are absent
from source and evidence.

The upload attempt identity, exact private object key, optional multipart upload
ID, and absolute effect deadline are durable before the corresponding storage
effects proceed. An expired attempt is first fenced in PostgreSQL. Its cleanup
not-before instant is strictly later than the absolute effect deadline. Cleanup
then uses bounded exact-key abort, list, delete, list, and head operations. A
successful absence observation is durable; a later claimed pass verifies
absence again before it clears an abandoned attempt or audibly finalizes a
consumed or expired ready export. Database row locks are never held over object
storage calls.

This protocol relies on the configured S3-compatible provider serializing an
abort and complete for the same multipart upload, and giving strongly
consistent completed writes, listings, heads, and deletes. The self-hosted
policy grants the exact multipart list/abort and object get/put/delete actions.
Cloudflare R2 documents the same consistency behavior used by the managed
deployment. A provider that does not satisfy these assumptions is not qualified
for staged audit exports.

Evidence:

- `audit-export-lifecycle-focused-tests.log`: 7 server files, 176 tests passed
  and 8 environment-gated tests skipped against PostgreSQL.
- `audit-export-lifecycle-deadline-test.log`: 17 focused export lifecycle tests
  passed after making the cleanup not-before instant strictly later than the
  attempt deadline.
- `audit-export-lifecycle-dispatcher-test.log`: 29 shared dispatcher tests
  passed, including lease-heartbeat loss, rejection, and synchronous failure.
- `audit-export-lifecycle-policy-test.log`: the focused self-hosted object
  policy test passed.
- `audit-export-lifecycle-installer-tests.log`: 42 installer policy, bundle,
  and archive tests passed against the committed candidate bytes.
- `audit-export-lifecycle-mutants.log`: removing the deadline fence, upload-ID
  persistence, first durable absence observation, and heartbeat cancellation
  each made its specific regression oracle fail before production source was
  restored.
- `audit-export-migration-provenance.txt`: migrations 0001 through 0012 are
  unchanged from the review base and records the regenerated unpublished 0013
  artifact hashes.

The bundle control was run after committing because the installer archive
intentionally reads its candidate bytes from the Git object database.
