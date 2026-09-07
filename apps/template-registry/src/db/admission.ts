import type pg from 'pg';

import {
  copyPostgresRestrictedIdentityPolicy,
  type PostgresRestrictedIdentityPolicy,
} from '@codaco/studio-sync/postgres-restricted-identities';

import { REGISTRY_BACKUP_ROLE, REGISTRY_ROLES } from './schema.ts';

export type RegistryDatabaseAdmission = Pick<
  PostgresRestrictedIdentityPolicy,
  'allowedLogins' | 'administrativeLogins'
>;

/** Snapshot deployment enrollment, retaining the two distinct runtime classes. */
export function copyRegistryDatabasePolicy(options: RegistryDatabaseAdmission) {
  return copyPostgresRestrictedIdentityPolicy({
    allowedLogins: options.allowedLogins,
    administrativeLogins: options.administrativeLogins,
    runtimeRoleSets: [[REGISTRY_ROLES.app], [REGISTRY_ROLES.operator]],
    backupRole: REGISTRY_BACKUP_ROLE,
  });
}

/** Offline administration must be explicitly declared before any migration SQL.
 * A relation's current owner never establishes an administrative exception. */
export async function assertRegistryMigrationOperator(
  client: pg.Pool | pg.PoolClient,
  options: RegistryDatabaseAdmission,
) {
  const policy = copyRegistryDatabasePolicy(options);
  const result = await client.query<{ permitted: boolean }>(
    `SELECT current_user = session_user AND (
       session_user = pg_catalog.pg_get_userbyid(database.datdba)
       OR session_user = ANY($1::pg_catalog.text[])
     ) AS permitted FROM pg_catalog.pg_database database
     WHERE database.datname = pg_catalog.current_database()`,
    [policy.administrativeLogins],
  );
  if (result.rows[0]?.permitted !== true)
    throw new Error('REGISTRY_MIGRATION_ADMINISTRATOR_UNDECLARED');
}
