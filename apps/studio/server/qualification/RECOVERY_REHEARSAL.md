# Combined recovery rehearsal evidence

This is the local qualification receipt for the combined Studio and Template
Registry recovery repair on 2026-09-08. It records a quarantined restore. It
does not qualify authenticated reactivation, production RTO, published image
provenance, or the complete amd64/arm64 release matrix.

The rehearsal began at commit
`ab5ff7a1e4a04b5f2a178f951798ed23a3e45313`. Docker Engine 29.7.2 ran the
images on Linux arm64. The application images were built from the monorepo root
with these contexts:

```sh
docker build -f apps/studio/Dockerfile -t studio-recovery-rehearsal:ab5-fixed .
docker build --build-arg SOURCE_REVISION=ab5ff7a1e4a04b5f2a178f951798ed23a3e45313 -f apps/template-registry/Dockerfile -t registry-recovery-rehearsal:ab5-fixed .
```

These were deliberately local working-tree builds of the base plus this repair;
the revision label is not published provenance. The final restore entrypoint
was copied byte-for-byte from this working tree into the fresh target. It runs
on the host, so the last role-quarantine change did not require rebuilding a
service image.

The quiesced backup retained these exact local image IDs:

```text
studio             sha256:0f98967483aee08c73486053eaf3f9dd1720003c3cf2af43d9d8842a4a9758d9
template-registry  sha256:1313f9e6b668c8f91cb1aaebbe185c931f17ed96156b2d2dfdeac9b9ac363ddc
traefik            sha256:6b9cbca6fac42ab0075f5437d8dc1685cfd188626d8d515839ea94f8b6271c42
minio              sha256:7ab545e819836c9e2bebe9240831aa1110b570c00b40d3d25792b7ba408262d6
minio-client       sha256:a7fe349ef4bd8521fb8497f55c6042871b2ae640607cf99d9bede5e9bdf11727
postgres           sha256:d3e1620b530c944afa6e887d22eb899824da68e19c52024bf98f5220c88a65b2
```

The source project was `nc-recovery-source`; the final distinct empty target
was `nc-recovery-target-final`. The fixed host ports were 55510 through 55515,
after checking 55510 through 55519 were free. The machine-readable fixture is
[`combined-recovery.fixture.json`](./combined-recovery.fixture.json). It keeps
the synthetic relational identifiers and exact object bytes so a later
qualification harness can reuse the same canaries without retaining secrets.

The capture refused an outside `pg_sleep` session with exit 3 before producing
`COMPLETE`. The successful retry produced a `Studio quiesced backup v1` marker,
and every entry in `SHA256SUMS` verified before the first restore write. The
captured artifact hashes were:

```text
studio.dump         cbe0320df21af0acd578f6c457b1e07ad51993a4758177e15b1b19557a7136fc
registry.dump       0b528dc821477f5dbc62580e08d3a738d0be7e667389eb58396269c59ccadaee
minio.tar           be07dfe1abadd1ebe97795c28f2731a2f216f61938d415e1bc902787e0dd0eea
registry-minio.tar  a508013fddda9ad49db40faad5db5869029f36ca2765a1ed3c26a12d26295255
reconciliation     7cfb721e6a6269d0632cdf5d46bf7e45c6048596c3011bdfb1fa602fa0b7b70e
```

A substituted reconciliation digest refused before creating a target
container. A valid digest with the wrong user inventory failed reconciliation;
the exit trap returned `registry_migrator` to `NOLOGIN`. The final successful
restore reported `REGISTRY_RECOVERY_RECONCILED`. Only `postgres`,
`registry-postgres`, `minio`, and `registry-minio` remained running; Studio,
Registry HTTP, Traefik, and workers remained stopped.

Post-restore read-only queries returned these exact role states:

```text
studio_backup_login=true
studio_maintenance_runtime=false
studio_migrator=false
studio_runtime=false
registry_backup_login=true
registry_migrator=false
registry_operations=false
registry_runtime=false
```

Studio retained one instance, one participant with code `RESTORE-CANARY`, and
one asset reference. Registry retained the fixture auth user and its active,
unsuspended publisher. Reading each restored object through its MinIO service
produced the two SHA-256 values recorded in the fixture.

## Fail-closed restore repair follow-up

The initial rehearsal exposed three restore defects after its successful path:
fresh Registry initialization enrolled writer logins before the cleanup trap,
the trap closed only the migrator after later failures, and verified inputs
were reread from caller-owned paths. The repaired restore now snapshots every
regular, non-symlinked backup, custody, and reconciliation input into a new
mode-0700 directory; verifies and consumes only that snapshot; and removes it
on every exit. Cleanup is armed before either database starts. It quarantines
all six Studio and Registry writer roles and terminates matching sessions. The
Registry backup verifier runs with its supported closed-login exception, so
only `registry_migrator` receives a temporary login for the recovery
transaction; `registry_runtime` and `registry_operations` never open.

The executable full-script harness covers ordinary failures and a real `TERM`
delivered after the owner opens:

```sh
node --test scripts/studio-restore-failure.test.mjs scripts/studio-restore-order.test.mjs
STUDIO_RESTORE_SCRIPT=/tmp/studio-restore-39b2.sh node --test scripts/studio-restore-failure.test.mjs
```

The repaired script passed all 17 checks. The second command, using the exact
pre-repair `39b2ff7fa844fce50ea64e21c6b58e00db8d2001` script, failed all 13
applicable checks, including both forced termination failures. The role-state
model proves that the repaired script commits `NOLOGIN` before termination,
while the old combined transaction rolls it back. The remaining failures cover
quarantine, symlink, and stable-snapshot controls. This is negative control
evidence, not a simulated successful recovery.

Three additional fresh-volume projects exercised the actual retained images,
PostgreSQL databases, and MinIO stores. `nc-recovery-review-pre-v2` used a
checksum-consistent invalid Registry dump and failed at the real `pg_restore`
before the owner window. `nc-recovery-review-post-v2` used independently hashed
but intentionally wrong current reconciliation evidence and reported
`REGISTRY_RECOVERY_FAILED` after the owner window opened. Both failure targets
ended with every Registry writer `NOLOGIN` and zero matching sessions.
`nc-recovery-review-success-v2` restored the unchanged prior backup and reported
`REGISTRY_RECOVERY_RECONCILED`. Its read-only result was:

```text
studio_backup_login=true
studio_maintenance_runtime=false
studio_migrator=false
studio_runtime=false
registry_backup_login=true
registry_migrator=false
registry_operations=false
registry_runtime=false
studio_writer_sessions=0
registry_writer_sessions=0
studio_canary=1,1,1
registry_canary=1,1
studio_object_sha=09a7edd8557110e99d1211af88630233b9c649189264d52e2eaf93a5418fb174
registry_object_sha=18eb36ad9fe8ad57f26686117b34db595fcf04afa17a389d415ba3d58a485afd
running=minio,postgres,registry-minio,registry-postgres
```

A real PostgreSQL reconnect control then briefly opened the synthetic
`registry_runtime` login on the isolated successful target and held one live
writer session. After the repaired role-close transaction committed, a fresh
password connection was rejected (status 2); the separate termination step
ended the held session (status 2). The final query again returned all three
Registry writers `NOLOGIN` and zero matching sessions. This directly checks
the admission boundary that a combined role-close/termination transaction
could not enforce.

These follow-up projects used no published ports and did not alter the retained
source or original successful target. The evidence remains local arm64
recovery evidence with the qualification limits stated at the top of this
document.
