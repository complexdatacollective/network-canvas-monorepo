import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type pg from 'pg';
import { fromDrizzle, type Db } from 'pg-boss';

// pg-boss talks to Postgres through an `IDatabase`: one `executeSql` call it
// makes no assumptions about. That is the seam that lets a job be created by
// the same transaction as the change that caused it — pass the command's own
// client and the INSERT lands inside it, so a rollback takes the job with it
// and a commit can never leave the change without its job.
//
// Drizzle's is the adapter pg-boss ships for this; it needs an `execute()` and
// the `sql` tag, which is all `drizzle({ client })` is used for here.

/**
 * The handle for one enqueue inside a domain transaction. A `PoolClient` and
 * not a `Pool` on purpose: a pool checks out a fresh connection per query, so
 * an enqueue handed one would commit on its own, outside the transaction it
 * was supposed to join.
 */
export function jobDatabaseFor(client: pg.PoolClient): Db {
  return fromDrizzle(drizzle({ client }), sql);
}

/**
 * The instance connection for a pg-boss that owns no pool of its own: the
 * queue cache it reads at start, and nothing transactional. Enqueues still
 * pass their own client through `jobDatabaseFor`.
 */
export function jobDatabaseForPool(pool: pg.Pool): Db {
  return fromDrizzle(drizzle({ client: pool }), sql);
}
