import { Duration, Effect } from 'effect';
import type { SqlClient } from 'effect/unstable/sql';

import { checkSchemaEffect, SCHEMA_LOCK_KEY } from './schema.ts';

// The database's readiness probes, on the Effect clients (#1927 §9, §22).
//
// Each takes the client it probes rather than a tag, so the process that
// mounts one decides which identity answers — the same reason
// `jobs/readiness.ts` takes its client. Each is bounded on its own: a probe
// that hangs on a wedged socket or an exhausted pool fails with a
// `TimeoutError` after a second rather than outliving the readiness deadline
// it is meant to report inside. The second is the one `http/health.ts` gives
// every check.
//
// The web and worker probes still run on node-postgres (`http/health.ts`'s
// `databaseCheck` and `schemaCheckOnPool`, and `SchemaStatus.read`): those are
// wired in `app.ts` and `programs/{serve,worker}.ts`, and the node pools pin
// their role with a startup parameter these clients cannot yet send.

const PROBE_TIMEOUT = Duration.seconds(1);

/** Liveness: the database answers a statement at all. */
export const databaseAlive = Effect.fn('db.readiness.alive')(function* (
  sql: SqlClient.SqlClient,
) {
  yield* sql`select 1`;
}, Effect.timeout(PROBE_TIMEOUT));

/**
 * Whether the database is this build's: `checkSchemaEffect`'s verdict, bounded.
 * A stale or absent schema is an answer in the success channel, exactly as
 * `checkSchemaEffect` returns it; only a failure to read is a failure.
 */
export const schemaVerdict = (sql: SqlClient.SqlClient) =>
  checkSchemaEffect(sql).pipe(Effect.timeout(PROBE_TIMEOUT));

/**
 * Whether some backend holds the migration's session lock right now — a
 * migrate is applying the schema to this database (`db/migrate.ts`,
 * `scripts/apply.ts`). Stage 4's `MaintenanceGate` reads it; nothing does yet.
 *
 * Read from `pg_locks` rather than by trying the lock: a `pg_try_advisory_lock`
 * that succeeded would itself be holding the lock a migrate is about to wait
 * on. A single-`bigint` advisory key is recorded split across `classid` (high
 * half) and `objid` (low half) with `objsubid = 1`, and advisory locks are
 * per database, so the database is part of the match.
 */
export const migrationLockHeld = Effect.fn('db.readiness.migrationLockHeld')(
  function* (sql: SqlClient.SqlClient) {
    const rows = yield* sql<{ held: boolean }>`
      select exists (
        select 1 from pg_locks
         where locktype = 'advisory'
           and granted
           and database = (select oid from pg_database
                            where datname = current_database())
           and classid = (${SCHEMA_LOCK_KEY}::int8 >> 32)::oid
           and objid = (${SCHEMA_LOCK_KEY}::int8 & 4294967295)::oid
           and objsubid = 1
      ) as held`;
    return rows[0]?.held === true;
  },
  Effect.timeout(PROBE_TIMEOUT),
);
