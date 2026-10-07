import { Duration, Effect } from 'effect';
import type { SqlClient } from 'effect/sql';

import { checkSchemaEffect, SCHEMA_LOCK_KEY } from './schema.ts';

const PROBE_TIMEOUT = Duration.seconds(1);

export const databaseAlive = Effect.fn('db.readiness.alive')(function* (
  sql: SqlClient.SqlClient,
) {
  yield* sql`select 1`;
}, Effect.timeout(PROBE_TIMEOUT));

export const schemaVerdict = (sql: SqlClient.SqlClient) =>
  checkSchemaEffect(sql).pipe(Effect.timeout(PROBE_TIMEOUT));

/**
 * Read from `pg_locks`: a `pg_try_advisory_lock` that succeeded would itself
 * hold the lock. A `bigint` advisory key is split across `classid` (high half)
 * and `objid` (low half) with `objsubid = 1`.
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
