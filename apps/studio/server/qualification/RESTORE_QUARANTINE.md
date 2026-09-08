# Studio restore quarantine qualification

This records the focused local qualification of the Studio-only restore repair
on 2026-09-08. It is evidence for a quarantined PostgreSQL restore boundary,
not authenticated application reactivation, a published-image qualification,
or an RTO result.

The executable fake-Docker harness exercises the complete restore script:

```sh
node --test scripts/studio-restore-quarantine.test.mjs
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
`scripts/posthog-source-maps-plugin.ts` dependency, so the builder copies that
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
