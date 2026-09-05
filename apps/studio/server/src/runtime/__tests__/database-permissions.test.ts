import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import pg from 'pg';
import { describe, expect, it } from 'vitest';

import {
  createScratchDatabase,
  reachableDb,
} from '../../__tests__/support/postgres.ts';
import { SCHEMA_FINGERPRINT } from '../../db/fingerprint.generated.ts';
import { readMigrations } from '../../db/migrations/artifact.ts';
import { migrateDatabase } from '../../db/migrations/migrate.ts';
import { createMaintenancePool, createPool } from '../../db/pool.ts';
import { createReadiness } from '../../observability/readiness.ts';

const database = await reachableDb();
const migrations = await readMigrations(
  fileURLToPath(new URL('../../../migrations', import.meta.url)),
);

describe.skipIf(!database)('restricted deployment database login', () => {
  it('can read readiness as both runtime roles but cannot change the schema or its evidence', async () => {
    if (!database) throw new Error('The database is required.');
    const scratch = await createScratchDatabase(database);
    const login = `studio_runtime_test_${randomUUID().replaceAll('-', '')}`;
    const identifier = pg.escapeIdentifier(login);
    const administrator = new pg.Pool({ connectionString: database.url });
    const pools: pg.Pool[] = [];
    try {
      await migrateDatabase(scratch.pool, migrations, SCHEMA_FINGERPRINT);
      await administrator.query(
        `CREATE ROLE ${identifier} LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD 'runtime-test-only'`,
      );
      await administrator.query(
        `GRANT studio_app, studio_maintenance TO ${identifier} WITH SET TRUE, INHERIT FALSE`,
      );
      const url = new URL(scratch.db.url);
      url.username = login;
      url.password = 'runtime-test-only';
      const runtimeDb = { url: url.href };
      for (const [create, expectedRole] of [
        [createPool, 'studio_app'],
        [createMaintenancePool, 'studio_maintenance'],
      ] as const) {
        const pool = create(runtimeDb);
        pools.push(pool);
        expect((await pool.query('SELECT current_user AS role')).rows).toEqual([
          { role: expectedRole },
        ]);
        const readiness = createReadiness({ pool, cacheMs: 0 });
        try {
          expect(await readiness.check()).toEqual({
            status: 'not_ready',
            checks: {
              database: 'ok',
              schema: 'current',
              object_store: 'unconfigured',
            },
          });
        } finally {
          readiness.stop();
        }
        for (const sql of [
          'UPDATE "schemaFingerprint" SET fingerprint = fingerprint',
          'DELETE FROM "schemaFingerprint" WHERE FALSE',
          'INSERT INTO "schemaFingerprint" (fingerprint) VALUES (\'forged\')',
          'TRUNCATE "schemaFingerprint"',
          'SELECT * FROM studio_migrations.history',
          'UPDATE studio_migrations.history SET checksum = checksum',
          'CREATE TABLE public.unauthorized_table (id integer)',
          'ALTER TABLE public.teams ADD COLUMN unauthorized_column text',
        ]) {
          await expect(pool.query(sql)).rejects.toMatchObject({
            code: '42501',
          });
        }
      }
      // The connecting identity has no owner/DDL privilege to regain, even
      // outside the production constructors that pin the NOLOGIN roles.
      const unpinned = new pg.Pool({ connectionString: url.href });
      pools.push(unpinned);
      await expect(
        unpinned.query('CREATE TABLE public.unauthorized_table (id integer)'),
      ).rejects.toMatchObject({ code: '42501' });
    } finally {
      await Promise.all(pools.map((pool) => pool.end()));
      await scratch.dispose();
      await administrator.query(`DROP ROLE IF EXISTS ${identifier}`);
      await administrator.end();
    }
  });
});
