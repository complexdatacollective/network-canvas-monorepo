# Registry reconciliation and integration review

Pending Registry work must retain its frozen trust boundary and stop when that
boundary is removed or the immutable resource is permanently unavailable. All
list results must satisfy the RPC output contract after PostgreSQL decoding.
The instances are publication/import reconciliation after configuration changes,
entry/artifact reads after removal, and timestamps nested inside JSON aggregates.

- The reconciliation worker starts even when Registry origin or storage is
  absent. Removing the origin audits and quarantines both intent kinds; changing
  it retains the same existing quarantine rule. Missing storage alone defers an
  import without making an external request.
- Entry and artifact HTTP 404/410 have a fixed resource-unavailable code. An
  already pending import transitions to audited quarantine. Authentication,
  timeout, throttling and server responses retain retry behavior. Publication's
  ambiguous exact-match lookup is unchanged.
- The database list adapter converts nested publication timestamps into Dates.
  Its PostgreSQL oracle validates a genuinely published row against the actual
  RPC output schema, rather than a duplicated test schema.

Fail-first evidence: the RPC test rejected the old JSON timestamp strings; wire
tests rejected the old undifferentiated 404/410 code; restoring the old worker
startup guard prevented a pending intent from reaching quarantine in the actual
Node entrypoint. The original source was restored after that negative control.
The fixture used an isolated local schema, disabled telemetry, and no Registry,
storage or recipient endpoint.

The integration CI run also exposed omitted explicit Registry table inventories,
the generated Registry environment documentation, the combined intent queue's
empty observation, and a stale managed log schema identity. The table oracle
retains three team-isolated tables and the deliberately user-global account
mapping. The managed identity now includes the merged audit-worker, recovery
authorization and protocol-lease diagnostics. Existing parser tests exercise
every emitter catalog entry, fixed fields and rejection of payload content.

Validation: 90 of 91 related PostgreSQL/configuration cases initially passed;
the remaining global-table inventory was corrected and its RLS suite rerun.
Registry wire tests (44), managed log tests (37), the production server build,
server types, changed-file lint and Knip passed. Knip retains only its two known
configuration hints. These are source/runtime checks, not production deployment
qualification.
