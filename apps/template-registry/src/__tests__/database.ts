import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';

import {
  generateDrizzleJson,
  generateMigration,
} from 'drizzle-kit/api-postgres';
import { escapeIdentifier } from 'pg';

import { createPostgresPool } from '@codaco/studio-sync/postgres-pool';

import { setRegistryPoolBounds } from '../db/pool.ts';

// Public disposable PostgreSQL; this test boundary never loads deployment env.
// oxlint-disable-next-line node/no-process-env
const port = Number(process.env.PGPORT ?? 54318);
const databaseUrl = `postgres://postgres:spike@127.0.0.1:${port}/postgres`;

export async function createRegistryTestDatabase(
  schema: Parameters<typeof generateDrizzleJson>[0],
  sidecar: (roles: { app: string; operator: string }) => string,
) {
  const suffix = randomUUID().replaceAll('-', '');
  const database = `registry_test_${suffix}`;
  const roles = {
    app: `registry_app_${suffix}`,
    operator: `registry_operator_${suffix}`,
  };
  const onIdleError = () => {
    throw new Error('REGISTRY_TEST_DATABASE_IDLE_ERROR');
  };
  const admin = createPostgresPool({
    connectionString: databaseUrl,
    max: 2,
    onIdleError,
  });
  const url = new URL(databaseUrl);
  url.pathname = `/${database}`;
  const owner = createPostgresPool({
    connectionString: url.toString(),
    max: 2,
    onIdleError,
  });
  const pool = createPostgresPool({
    connectionString: url.toString(),
    role: roles.app,
    max: 4,
    onIdleError,
    roleMismatchCode: 'REGISTRY_DATABASE_ROLE_MISMATCH',
  });
  const operatorPool = createPostgresPool({
    connectionString: url.toString(),
    role: roles.operator,
    max: 2,
    onIdleError,
    roleMismatchCode: 'REGISTRY_DATABASE_ROLE_MISMATCH',
  });
  setRegistryPoolBounds(pool);
  setRegistryPoolBounds(operatorPool);
  const dispose = async () => {
    await Promise.all([pool.end(), operatorPool.end(), owner.end()]);
    try {
      // pg-pool resolves end() after requesting socket closure. Wait for the
      // server to observe those closes before DROP can terminate an idle socket.
      // A leaked connection fails cleanup rather than being silently killed.
      const deadline = Date.now() + 2000;
      for (;;) {
        const remaining = await admin.query<{ count: number }>(
          'SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname = $1',
          [database],
        );
        if (remaining.rows[0]?.count === 0) break;
        if (Date.now() >= deadline)
          throw new Error('REGISTRY_TEST_DATABASE_CONNECTION_LEAK');
        await setTimeout(5);
      }
      await admin.query(
        `DROP DATABASE IF EXISTS ${escapeIdentifier(database)}`,
      );
      for (const role of Object.values(roles))
        await admin.query(`DROP ROLE IF EXISTS ${escapeIdentifier(role)}`);
    } finally {
      await admin.end();
    }
  };
  try {
    await admin.query(`CREATE DATABASE ${escapeIdentifier(database)}`);
    for (const role of Object.values(roles)) {
      await admin.query(
        `CREATE ROLE ${escapeIdentifier(role)} NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB NOREPLICATION`,
      );
      await admin.query(
        `GRANT ${escapeIdentifier(role)} TO CURRENT_USER WITH SET TRUE`,
      );
    }
    const statements = await generateMigration(
      await generateDrizzleJson({}),
      await generateDrizzleJson(schema),
    );
    await owner.query(statements.join('\n'));
    await owner.query(sidecar(roles));
  } catch (error) {
    await dispose();
    throw error;
  }
  return {
    owner,
    pool,
    operatorPool,
    roles,
    role: roles.app,
    databaseUrl: url.toString(),
    dispose,
  };
}
