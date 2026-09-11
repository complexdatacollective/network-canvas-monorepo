# Studio restore quarantine qualification

This records the focused local qualification of the Studio-only restore repair
on 2026-09-08. It is evidence for a quarantined PostgreSQL restore boundary,
not authenticated application reactivation, a published-image qualification,
or an RTO result.

The executable fake-Docker harness exercises the complete restore script:

```sh
node --test scripts/studio/studio-restore-quarantine.test.mjs
```

All 14 tests passed. They cover successful closure, PostgreSQL restore failure,
session-termination failure, foreground MinIO initialization failure, `TERM`,
symlinked inputs, a caller mutation after the private snapshot, and existing
Compose project, named-volume, and network collisions. Every post-start exit
repeats closure of `studio_runtime`, `studio_maintenance_runtime`, and
`studio_migrator`. The three target-collision controls prove refusal before an
image load, SQL command, or service start. Running the same harness with the
pre-repair restore script from parent commit
`9334b27636b1ee9702d1b29bc4803c6313d1997e` failed all 14 tests.

A disposable local drill then used only port 55540 and PostgreSQL 18 image
`sha256:1c59e2c3c818eaa0f0628f695b36e7c9e362d6b219b36a54a32df645cbd7e1af`.
It initialized the database with the generated `postgres-init.sql`, applied the
unaltered numbered migrations 0001 through 0007, inserted a database canary,
captured a custom-format dump, and invoked the actual restore script against a
fresh Compose volume. A checksum-consistent truncated dump first failed at real
`pg_restore`; after cleanup all three writers were `NOLOGIN`. A second fresh
volume restored successfully and returned:

```text
failure_status=1
after_failure=studio_maintenance_runtime=false,studio_migrator=false,studio_runtime=false
success=18.6 (Debian 18.6-1.pgdg12+2)|studio_maintenance_runtime=false,studio_migrator=false,studio_runtime=false|pg18-canonical-0001-0007|f|f|7
```

The two `f` values are effective `EXECUTE` checks for the application and
maintenance identities against PostgreSQL built-in large-object functions.
The logical dump did not carry an unsafe source grant on a built-in function;
the fresh administrator initialization and explicit postrestore privilege file
both establish the same reviewed boundary. The last value confirms all seven
canonical migrations were present after restore.

The first full Studio image build stopped at the Docker pruning boundary: the
pruned client context omitted `apps/studio/scripts/telemetry-plugins.ts`, so
Vite could not resolve the import from `apps/studio/client/vite.config.ts`. The
follow-up Dockerfile repair copies that exact candidate file from the pruner
stage into the builder. The same build then exposed the plugin's root-level
`scripts/build/posthog-source-maps-plugin.ts` dependency, so the builder copies that
exact candidate file as well. No ignored or host-generated source enters the
build.

The resulting local Linux/arm64 image was
`sha256:2c0581bfa5ce796b6461062ba7c80547fb31212d4b769462110b9598a067e790`
(`studio-pii-restore:6bf-telemetry-fix`). Its full populated Compose
qualification passed in 92.34 seconds. That run configured the generated
deployment, applied unchanged migrations 0001 through 0007 with distinct
application and maintenance credentials, rejected an active-session backup,
captured concurrent database and object-store writes, restored into a distinct
empty project, and compared both database counts and two referenced object
hashes. It also proved all three writer roles were `NOLOGIN` immediately after
restore before opening a local canary-only validation window, and exercised
missing and incorrect historical encryption keys.

Two caller defects surfaced only in this full composition. The qualification
pool helper still used the application credential for maintenance work after
the split-login change; it now uses the two configured credentials. The backup
script's key-verification command also replaced a caller's `COMPOSE_FILE`,
which made Compose attempt to reconcile the active qualification networks and
volumes. It now preserves the caller overlays and appends the dedicated
encryption-verification service. These fixes do not perform authorization
reconciliation or session invalidation, so this evidence remains a quarantined
restore qualification rather than a production reactivation or published
multi-platform image qualification.

The follow-up verified-reference migration was qualified on the same date from
commit `54a1155f47e448d14bca9bb870ba0a13011b761d`. Migrations 0001 through 0007
remain byte-identical; 0008 adds write-time guards for every stored encryption
key reference. Recurring readiness authenticates the bounded immutable proof
registry while startup retains the exhaustive stored-data scan.

The rebuilt local Linux/arm64 image
`sha256:0894dc7927d2edb6777e789fff8d8051c861a3801d28eed02f7371d1eb92b50f`
(`studio-pii-restore:verified-key-references-54a1155`) passed both Compose
qualification cases. The populated backup/restore case took 98.20 seconds and
ran all eight migrations, preserved historical-key refusal behavior, and
verified restored database counts and referenced objects in fresh volumes.
Separately, all 195 PII tests and all 195 migration tests passed against an
isolated PostgreSQL 18 fixture with missing-database skips disabled. Server
typecheck and repository Knip passed. The restore validation instructions now
explicitly open only the required restricted identities and, on failure, commit
NOLOGIN before bounded session termination and container shutdown.

The KMS custody follow-up was independently qualified on 2026-09-08 with local
Linux/arm64 image
`sha256:25fcc7c028d40980629423dd1790d1bbc634ac789866a2261b5a444849b7e94f`
(`studio-kms-restore:master-custody-race`). Both Compose cases passed; the
populated eight-migration backup/restore took 111.01 seconds. It verified
separate online operational and data-only offline custody service networks,
rejected absent, incorrect and ciphertext-only independent custody, retained
the hash-bound direct roots, restored database/object/image contents into
fresh volumes, and proved all writer logins closed after restoration. No real
AWS request was made; regional KMS behavior and plaintext ownership were
exercised separately through the SDK tests.

The exact custody snapshot is verified both before and after writer drain.
Six executable backup process controls prove successful artifact capture and
refusal after a concurrent key change, failed final verification, termination
failure and `TERM`. The earlier backup script from `411866038` completed under
the injected key-change race, causing the new negative control to fail. The
repaired script refuses `COMPLETE` and keeps all writer identities closed;
failed cleanup stops PostgreSQL. These six controls and the existing fourteen
restore process controls pass together. The key/KMS unit controls pass all 66
tests, including clearing owned invalid base64 plaintext and preserving
borrowed buffers. This evidence does not qualify provider credentials,
published multi-platform images or production recovery.

The combined KMS server run passed 1,934 tests across 96 files, with one existing
development-performance case skipped. Server typecheck and repository Knip
also passed. Removing only the invalid-decoding zeroization caused the new
buffer-ownership assertion to fail, and the original implementation was
restored before committing.

The retained-image precedence correction was qualified on 2026-09-08 with
Linux/arm64 image
`sha256:3162859ba3e5cb6cc967273afaf28a4e1fdde225feda5039ba66f4b88f65a316`
(`studio-kms-restore:retained-image-order`). Both Compose cases passed; the
populated restore took 102.90 seconds. The restore environment deliberately
used a unique, absent registry image name, verified absent before invocation,
while only the retained content IDs could supply the offline verifier. The
previous Compose-file order failed this same fixture with `No such image` at
`encryption-verify`. Recovery image overrides now follow the encryption service
definition in both the restore command and the documented private validation
command. All 20 shell process controls also passed. This remains local
quarantine evidence and does not establish authenticated reopening.

After integrating the bounded legacy cursor and invitation admission fixes from
the PII parent, the final combined server suite passed 1,937 tests with one
existing development-performance skip. An intermittent real-command resume
failure was traced to randomly leading `-` in the opaque cursor transport;
fixed `v1_` framing preserves the authenticated payload and CLI argument
semantics. The focused 22-test run, prior-implementation negative control,
independent framing review, server types, configured repository Knip, lint and
formatting all passed. No numbered migration bytes changed in this correction.
