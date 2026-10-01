import pg from 'pg';

import { TENANT_ROLES } from '@codaco/studio-sync/rls';

import type { DbEnv } from '../env.ts';

// The pool is lazy — no connection is made until the first query — so
// creating it with the dev defaults never requires a running database.

// An unroutable host makes connect() hang until the OS gives up, which is long
// enough for the boot retry to stack a probe per tick until the pool is
// exhausted. A bounded wait turns that into a fast, repeatable failure.
const CONNECTION_TIMEOUT_MS = 10_000;

// The node-postgres pools the scripts use; the server's processes run on the
// Effect clients (`client.ts`). The application pool starts every session as
// the application role, sent as a startup parameter.
/** What a caller may vary; the identity and the timeout are not negotiable. */
export type PoolLimits = {
  /**
   * How many connections this pool may hold. Left to node-postgres's default
   * for a pool that serves requests; set by a pool whose whole job is one kind
   * of statement, so it cannot take a share of the database's connections that
   * its work does not need.
   */
  max?: number;
};

function connect(db: DbEnv, role?: string, limits: PoolLimits = {}): pg.Pool {
  const pool = new pg.Pool({
    connectionString: db.url,
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
    ...(role === undefined ? {} : { options: `-c role=${role}` }),
    ...limits,
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

/** The application's pool: every session runs as the application role. */
export function createPool(db: DbEnv, limits: PoolLimits = {}): pg.Pool {
  return connect(db, TENANT_ROLES.app, limits);
}

/** The connecting login itself: schema application, reset, and seeding. */
export function createOwnerPool(db: DbEnv): pg.Pool {
  return connect(db);
}
