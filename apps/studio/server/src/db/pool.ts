import pg from 'pg';

import type { DbEnv } from '../env.ts';

// The single construction point for the server's Postgres pool. The pool is
// lazy — no connection is made until the first query — so creating it with
// the dev defaults never requires a running database.

// An unroutable host makes connect() hang until the OS gives up, which is long
// enough for the boot retry to stack a probe per tick until the pool is
// exhausted. A bounded wait turns that into a fast, repeatable failure.
const CONNECTION_TIMEOUT_MS = 10_000;

export function createPool(db: DbEnv): pg.Pool {
  const pool = new pg.Pool({
    connectionString: db.url,
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
  });
  // A client that dies while idle (database restart, network partition) emits
  // `error` on the pool with no query to reject. Node turns an unhandled
  // `error` event into an uncaught exception, so without this listener a
  // routine database restart takes the server down. node-postgres has already
  // discarded the client by the time this runs; the next checkout reconnects.
  pool.on('error', (error) => {
    // oxlint-disable-next-line no-console -- server-side failure diagnostics
    console.error('Postgres pool error on an idle client:', error);
  });
  return pool;
}
