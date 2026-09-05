import { escapeIdentifier } from 'pg';
import type pg from 'pg';

import { validateRoleNames } from '@codaco/studio-sync/role-bootstrap';

import { createOwnerPool } from '../../db/pool.ts';
import type { DbEnv } from '../../env.ts';

/**
 * Explicit operator provisioning for the unique databases created by
 * createScratchDatabase. It never changes a shared developer database, and it
 * opens admission only after the exact CONNECT enrollment has committed.
 * Production migration security remains fully enabled in every caller.
 */
export async function enrollMigrationTestDatabase(
  pool: pg.Pool,
  administrativeDb: DbEnv,
  additionalLogins: readonly string[] = [],
): Promise<string[]> {
  const administrator = createOwnerPool(administrativeDb);
  const client = await pool.connect();
  try {
    const result = await client.query<{ database: string; login: string }>(
      'SELECT current_database() AS database, session_user AS login',
    );
    const identity = result.rows[0];
    if (!identity || !/^studio_test_db_[a-f0-9]{12}$/.test(identity.database))
      throw new Error(
        'Migration test enrollment requires an isolated scratch database.',
      );
    const logins = [identity.login, ...additionalLogins];
    validateRoleNames(logins);
    const database = escapeIdentifier(identity.database);
    // PostgreSQL refuses ALLOW_CONNECTIONS false from inside that database.
    // The separate fixture administrator remains connected to the test host DB.
    await administrator.query(
      `ALTER DATABASE ${database} ALLOW_CONNECTIONS false`,
    );
    const retained = await client.query<{ present: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid() AND backend_type = 'client backend') AS present",
    );
    if (retained.rows[0]?.present !== false)
      throw new Error(
        'Migration test enrollment requires all other sessions to be closed.',
      );
    const roles = await client.query<{ rolname: string }>(
      "SELECT rolname FROM pg_roles WHERE rolname IN ('studio_app', 'studio_maintenance', 'studio_backup')",
    );
    await client.query('BEGIN');
    try {
      await client.query(`REVOKE ALL ON DATABASE ${database} FROM PUBLIC`);
      if (roles.rows.length)
        await client.query(
          `REVOKE CONNECT ON DATABASE ${database} FROM ${roles.rows.map(({ rolname }) => escapeIdentifier(rolname)).join(', ')}`,
        );
      await client.query(
        `GRANT CONNECT ON DATABASE ${database} TO ${logins.map(escapeIdentifier).join(', ')}`,
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
    await administrator.query(
      `ALTER DATABASE ${database} ALLOW_CONNECTIONS true`,
    );
    return logins;
  } finally {
    client.release();
    await administrator.end();
  }
}
