# Paused Astra Registry slice review

User requested immediate pause for usage. No further review or implementation is authorized by this note.

Tested Registry head: `1cc1dc06ed45f40c9b966b3f3fa54f559efbde04`, clean at start, BASE/registry-integration. Public mirror head `fa96b192f192a52bc27a7360b179375fd049ba8f`; all five raw spec files match both source bytes and SOURCE.json hashes. No repository source edits or PR actions performed.

## Confirmed findings

1. **P2: anonymous scan admission bypass** — `apps/template-registry/src/store.ts:560-563`. Only query/keyword/author use admission. Occupy both shared slots and request `/entries?kind=variable_set` from two replicas: both return 200 instead of 429. Unindexed kind/license/curated filters can consume ordinary serving capacity. Independent EXPLAIN ANALYZE with 10,001 artifacts showed a sequential scan of all 10,001 artifact rows plus 10,001 content index probes/filter evaluations, despite LIMIT 21 and zero matches. Temp test changes the existing admission test to kind; durable `admission.test.ts` includes bounded synthetic seed and query-plan output. Test fails expected429/actual200.

2. **P1: unactionable pending deletion accepted** — `apps/template-registry/src/recovery.ts:92-100`; review comment 4000731540. Use supported hard-delete route, then simulate restored `registry_delete_jobs.requested_audit_id` pointing to a credential.created event. Existing FK still holds. Cleanup returns 0 and object bytes remain, but recovery accepts the independently matching inventories. Confirmed real PG: `adversarial rejects unactionable deletion authorization` resolves instead of rejecting. Cleanup requires matching hard_delete_requested action AND root in store.ts:1029-1031; recovery only checks job existence.

3. **P1: supported dormant operator grant cannot recover** — `apps/template-registry/src/recovery.ts:291-298`; comment 4000731542. Insert verified account without publisher and call actual `changeRegistryOperator` supported function to grant it. Capture matching evidence, quarantine, recover: rejected REGISTRY_RECOVERY_RECONCILIATION_MISMATCH although grant is supported. Confirmed real PG: `adversarial accepts independently approved dormant operator grant` rejects instead of resolving. Adjacent suspended-publisher enabled grants are also permitted by mutation paths but were not independently tested.

4. **P1: missing immutable moderation audit history not bound** — `apps/template-registry/src/recovery.ts:325-327`; comment 4000731550. Recovery inventory schema has no audit digest/count; after takedown+restore current materialized states can be identical while audit events are missing. Independent reproduction prepared using actual moderation endpoints, captures evidence, simulates older restore by removing the two immutable audit rows with trigger temporarily disabled only in scratch database, then expects recovery rejection. Confirmed real PostgreSQL: `adversarial rejects missing permanent moderation history` resolved undefined instead of rejecting. The two permanent moderation events were lost without recovery refusal.

## Source-confirmed, no independent reproduction completed

5. **P1: uncoalesced public readiness probes** — `apps/template-registry/src/runtime.ts:89-95`; comment 4000731545. Every `/readyz` invocation starts verifyRegistryDatabases and blobs.ready. `db/schema-state.ts:129-134` acquires app connection before awaiting operator connection, so concurrent requests can hold all four app slots while waiting for two operator slots. No shared in-flight promise/admission exists. Exact reviewer body saved in BASE/evidence/registry-review-2026.json. Needs focused concurrent readiness regression before final verification.

## Validation and limits

183 existing contract/recovery/artifact/HTTP cases: 182 passed initially; the one prepared-transaction case failed because the new disposable fixture default disabled prepared transactions. After setting max_prepared_transactions=10 on the review-owned container and restarting it, that exact case passed. 60 exchange tests passed. Withdrawn idempotent re-publication retains yanked=true as intended; the contrary review premise is false. NUL rejection, report identities, publisher v4 name/ORCID binding, and completed-deletion absence fixes passed their existing cases.

Independent regression files are durably copied into `BASE/evidence/astra-registry-reproduction/`: `admission.test.ts`, `recovery-adversarial.test.ts`, and `vitest.config.mjs`. Imports intentionally point to exact local Registry source paths; migration paths are absolute. Original temp directory: `/var/folders/q7/ql25mp590n194x2v36dzcnh00000gp/T/registry-admission-review-uvbqxgqo`.

Fixture was NEW and review-owned: `studio-registry-adversarial-55573`, port55573, postgres18, synthetic password `registry-adversarial-test-only`. No existing Docker credential metadata was read. Fixture was stopped and automatically removed on pause; recreate separately if needed, with max_prepared_transactions=10. Test command from registry tree: `PGPORT=55573 PGUSER=postgres PGPASSWORD=registry-adversarial-test-only node node_modules/vitest/vitest.mjs run --root ../evidence/astra-registry-reproduction --config ../evidence/astra-registry-reproduction/vitest.config.mjs -t adversarial`. Admission case selector: `-t 'bounds shared anonymous scans'`.

Whole-epic integrated Astra review remains NOT DONE. Registry slice is NOT cleared due the confirmed findings. Stop pending user resumption.
