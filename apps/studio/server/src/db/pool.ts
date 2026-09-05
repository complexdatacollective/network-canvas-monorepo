import type pg from 'pg';

import { createPostgresPool } from '@codaco/studio-sync/postgres-pool';
import { TENANT_ROLES } from '@codaco/studio-sync/rls';

import type { DbEnv } from '../env.ts';
import { logOperational } from '../observability/logger.ts';

// One DATABASE_URL, three identities. The connecting login owns the schema and
// applies it; the application pool starts every session as a NOLOGIN role
// instead (`role=` is a startup parameter: a missing role refuses the
// connection, and even RESET ROLE returns to it), so the server never runs as
// a role that could bypass row-level security — not in a deployment, and not
// in development, where the login is the superuser. Garbage collection pins
// the maintenance role the same way as durable delivery workers do.
function connect(db: DbEnv, role?: string): pg.Pool {
  return createPostgresPool({
    connectionString: db.url,
    role,
    onIdleError: () => logOperational('STUDIO_DATABASE_IDLE_ERROR'),
    roleMismatchCode: 'STUDIO_DATABASE_ROLE_MISMATCH',
  });
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
