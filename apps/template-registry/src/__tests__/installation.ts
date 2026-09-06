import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';

import { escapeIdentifier, escapeLiteral } from 'pg';
import type pg from 'pg';

import { createPostgresPool } from '@codaco/studio-sync/postgres-pool';
import {
  revokeLargeObjectPrivilegesSql,
  runtimeRolesSql,
} from '@codaco/studio-sync/role-bootstrap';

import { setRegistryPoolBounds } from '../db/pool.ts';
import { REGISTRY_BACKUP_ROLE, REGISTRY_ROLES } from '../db/schema.ts';

// Only a disposable local PostgreSQL fixture; no deployment credentials load.
// oxlint-disable-next-line node/no-process-env
const port = Number(process.env.PGPORT ?? 54318);
const adminUrl = `postgres://postgres:spike@127.0.0.1:${port}/postgres`;

/** The real immutable artifact names its roles. Validate those shared NOLOGIN
 * roles, never alter/drop them, and isolate every LOGIN and database per suite. */
export async function createRegistryInstallation() {
  const suffix = randomUUID().replaceAll('-', '');
  const databaseName = `registry_install_${suffix}`;
  const logins = {
    owner: `registry_owner_${suffix}`,
    app: `registry_runtime_${suffix}`,
    operator: `registry_operations_${suffix}`,
    backup: `registry_capture_${suffix}`,
  };
  const allowedLogins = Object.values(logins);
  const password = `registry-local-only-${suffix}`;
  const onIdleError = () => {
    throw new Error('REGISTRY_TEST_DATABASE_IDLE_ERROR');
  };
  const admin = createPostgresPool({
    connectionString: adminUrl,
    max: 2,
    onIdleError,
  });
  const url = (login: string) => {
    const value = new URL(adminUrl);
    value.pathname = `/${databaseName}`;
    value.username = login;
    value.password = password;
    return value.toString();
  };
  const owner = createPostgresPool({
    connectionString: url(logins.owner),
    max: 2,
    onIdleError,
  });
  const pool = createPostgresPool({
    connectionString: url(logins.app),
    role: REGISTRY_ROLES.app,
    max: 4,
    onIdleError,
  });
  const operatorPool = createPostgresPool({
    connectionString: url(logins.operator),
    role: REGISTRY_ROLES.operator,
    max: 2,
    onIdleError,
  });
  const backupPool = createPostgresPool({
    connectionString: url(logins.backup),
    role: REGISTRY_BACKUP_ROLE,
    max: 1,
    onIdleError,
  });
  setRegistryPoolBounds(pool);
  setRegistryPoolBounds(operatorPool);
  let disposed = false;
  const dispose = async () => {
    if (disposed) return;
    disposed = true;
    await Promise.all([
      pool.end(),
      operatorPool.end(),
      backupPool.end(),
      owner.end(),
    ]);
    try {
      const deadline = Date.now() + 2000;
      for (;;) {
        const active = await admin.query<{ count: number }>(
          'SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname = $1',
          [databaseName],
        );
        if (active.rows[0]?.count === 0) break;
        if (Date.now() >= deadline)
          throw new Error('REGISTRY_TEST_DATABASE_CONNECTION_LEAK');
        await setTimeout(5);
      }
      await admin.query(
        `DROP DATABASE IF EXISTS ${escapeIdentifier(databaseName)}`,
      );
      for (const login of allowedLogins)
        await admin.query(`DROP ROLE IF EXISTS ${escapeIdentifier(login)}`);
    } finally {
      await admin.end();
    }
  };
  // Provisioning and transaction-contained adversarial tests only. Runtime
  // and migration operations use the distinct nonadministrative LOGINs above.
  const withAdministrator = async <T>(
    work: (pool: pg.Pool) => Promise<T>,
  ): Promise<T> => {
    const target = new URL(adminUrl);
    target.pathname = `/${databaseName}`;
    const administrativePool = createPostgresPool({
      connectionString: target.toString(),
      max: 1,
      onIdleError,
    });
    try {
      return await work(administrativePool);
    } finally {
      await administrativePool.end();
    }
  };
  try {
    await admin.query(
      runtimeRolesSql(
        [...Object.values(REGISTRY_ROLES), REGISTRY_BACKUP_ROLE],
        'Template Registry',
      ),
    );
    for (const login of allowedLogins)
      await admin.query(
        `CREATE ROLE ${escapeIdentifier(login)} LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION PASSWORD ${escapeLiteral(password)}`,
      );
    await admin.query(`GRANT ${REGISTRY_ROLES.app} TO ${escapeIdentifier(logins.app)} WITH SET TRUE, INHERIT FALSE;
      GRANT ${REGISTRY_ROLES.operator} TO ${escapeIdentifier(logins.operator)} WITH SET TRUE, INHERIT FALSE;
      GRANT ${REGISTRY_BACKUP_ROLE} TO ${escapeIdentifier(logins.backup)} WITH SET TRUE, INHERIT FALSE`);
    await admin.query(
      `CREATE DATABASE ${escapeIdentifier(databaseName)} OWNER ${escapeIdentifier(logins.owner)} ALLOW_CONNECTIONS false`,
    );
    await admin.query(`BEGIN;
      REVOKE ALL ON DATABASE ${escapeIdentifier(databaseName)} FROM PUBLIC;
      GRANT CONNECT ON DATABASE ${escapeIdentifier(databaseName)} TO ${allowedLogins.map(escapeIdentifier).join(', ')};
      COMMIT`);
    await admin.query(
      `ALTER DATABASE ${escapeIdentifier(databaseName)} ALLOW_CONNECTIONS true`,
    );
    await owner.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
    await withAdministrator((connection) =>
      connection.query(
        revokeLargeObjectPrivilegesSql([
          ...Object.values(REGISTRY_ROLES),
          REGISTRY_BACKUP_ROLE,
          ...allowedLogins,
        ]),
      ),
    );
  } catch (error) {
    await dispose();
    throw error;
  }
  return {
    owner,
    pool,
    operatorPool,
    backupPool,
    logins,
    allowedLogins,
    databaseName,
    roles: REGISTRY_ROLES,
    role: REGISTRY_ROLES.app,
    databaseUrl: url(logins.owner),
    runtimeDatabaseUrl: url(logins.app),
    operatorDatabaseUrl: url(logins.operator),
    backupDatabaseUrl: url(logins.backup),
    withAdministrator,
    dispose,
  };
}
