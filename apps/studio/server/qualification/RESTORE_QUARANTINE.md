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

Building a new full Studio image for the broader Compose qualification stopped
at the existing Docker pruning boundary: the pruned client context omitted
`apps/studio/scripts/telemetry-plugins.ts`, so Vite could not resolve the import
from `apps/studio/client/vite.config.ts`. This repair does not change that build
path. The direct PostgreSQL drill and fake-executable controls above therefore
qualify the restore mechanics while full rebuilt-image recovery remains a
separate caller boundary.
