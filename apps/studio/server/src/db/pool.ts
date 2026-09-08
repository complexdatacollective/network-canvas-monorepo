import type pg from 'pg';

import { createPostgresPool } from '@codaco/studio-sync/postgres-pool';
import { BACKUP_ROLE, TENANT_ROLES } from '@codaco/studio-sync/rls';

import type { DbEnv } from '../env.ts';
import { logOperational } from '../observability/logger.ts';

// Production supplies one restricted login per runtime role: DATABASE_URL for
// studio_app and STUDIO_MAINTENANCE_DATABASE_URL for studio_maintenance. The
// migration command supplies its administrative credentials separately
// through its own DATABASE_URL. Each runtime pool starts every session as its
// one NOLOGIN role (`role=` is a startup parameter: a missing role refuses the
// connection, and even RESET ROLE returns to the restricted login). Explicit
// local development may use one superuser URL for both pools; production
// admission rejects that identity before request or worker startup.
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

/** Operator-only credentials: all-tenant, SELECT-only recovery reads. */
export function createBackupPool(db: DbEnv): pg.Pool {
  return connect(db, BACKUP_ROLE);
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
