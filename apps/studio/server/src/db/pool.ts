import pg from 'pg';

import type { DbEnv } from '../env.ts';

// The single construction point for the server's Postgres pool. The pool is
// lazy — no connection is made until the first query — so creating it with
// the dev defaults never requires a running database.
export function createPool(db: DbEnv): pg.Pool {
  return new pg.Pool({ connectionString: db.url });
}
