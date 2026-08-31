import pg from 'pg';

import { TENANT_ROLES } from '@codaco/studio-sync/rls';

import type { DbEnv } from '../env.ts';

// The pool is lazy — no connection is made until the first query — so
// creating it with the dev defaults never requires a running database.

// An unroutable host makes connect() hang until the OS gives up, which is long
// enough for the boot retry to stack a probe per tick until the pool is
// exhausted. A bounded wait turns that into a fast, repeatable failure.
const CONNECTION_TIMEOUT_MS = 10_000;

// One DATABASE_URL, three identities. The connecting login owns the schema and
// applies it; the application pool starts every session as a NOLOGIN role
// instead (`role=` is a startup parameter: a missing role refuses the
// connection, and even RESET ROLE returns to it), so the server never runs as
// a role that could bypass row-level security — not in a deployment, and not
// in development, where the login is the superuser. Garbage collection pins
// the maintenance role the same way as durable delivery workers do.
function connect(db: DbEnv, role?: string): pg.Pool {
  const pool = new pg.Pool({
    connectionString: db.url,
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
    ...(role === undefined ? {} : { options: `-c role=${role}` }),
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
export function createPool(db: DbEnv): pg.Pool {
  return connect(db, TENANT_ROLES.app);
}

/** Background jobs: every session runs as the cross-team maintenance role. */
export function createMaintenancePool(db: DbEnv): pg.Pool {
  return connect(db, TENANT_ROLES.maintenance);
}

/** The connecting login itself: schema application, reset, and seeding. */
export function createOwnerPool(db: DbEnv): pg.Pool {
  return connect(db);
}

/**
 * A pinned pool against a database whose schema — and so whose roles — was
 * never applied is refused at connect, before any query could tell the
 * schema is absent.
 */
export function isMissingRoleError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    error.code === '22023' &&
    error.message.includes(TENANT_ROLES.app)
  );
}
