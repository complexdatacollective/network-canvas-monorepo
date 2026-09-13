import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import pg from 'pg';
import { describe, expect, it } from 'vitest';

import { enrollMigrationTestDatabase } from '../../__tests__/support/migrations.ts';
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
    const suffix = randomUUID().replaceAll('-', '');
    const appLogin = `studio_runtime_app_${suffix}`;
    const maintenanceLogin = `studio_runtime_maintenance_${suffix}`;
    const identifiers = [appLogin, maintenanceLogin].map(pg.escapeIdentifier);
    const administrator = new pg.Pool({ connectionString: database.url });
    const pools: pg.Pool[] = [];
    try {
      await administrator.query(
        `CREATE ROLE ${identifiers[0]} LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION PASSWORD 'runtime-test-only';
         CREATE ROLE ${identifiers[1]} LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION PASSWORD 'runtime-test-only';
         GRANT studio_app TO ${identifiers[0]} WITH ADMIN FALSE, SET TRUE, INHERIT FALSE;
         GRANT studio_maintenance TO ${identifiers[1]} WITH ADMIN FALSE, SET TRUE, INHERIT FALSE`,
      );
      const allowedLogins = await enrollMigrationTestDatabase(
        scratch.pool,
        database,
        [appLogin, maintenanceLogin],
      );
      await migrateDatabase(
        scratch.pool,
        migrations,
        SCHEMA_FINGERPRINT,
        allowedLogins,
      );
      const runtimeDb = (login: string) => {
        const url = new URL(scratch.db.url);
        url.username = login;
        url.password = 'runtime-test-only';
        return { url: url.href };
      };
      const app = createPool(runtimeDb(appLogin));
      const maintenance = createMaintenancePool(runtimeDb(maintenanceLogin));
      pools.push(app, maintenance);
      for (const [pool, expectedRole] of [
        [app, 'studio_app'],
        [maintenance, 'studio_maintenance'],
      ] as const) {
        expect((await pool.query('SELECT current_user AS role')).rows).toEqual([
          { role: expectedRole },
        ]);
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
      for (const readiness of [
        createReadiness({
          pool: app,
          maintenancePool: maintenance,
          allowedLogins,
          cacheMs: 0,
        }),
        createReadiness({
          maintenancePool: maintenance,
          allowedLogins,
          cacheMs: 0,
        }),
      ]) {
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
      }
      // The connecting identity has no owner/DDL privilege to regain, even
      // outside the production constructors that pin the NOLOGIN roles.
      const unpinned = new pg.Pool({
        connectionString: runtimeDb(appLogin).url,
      });
      pools.push(unpinned);
      await expect(
        unpinned.query('CREATE TABLE public.unauthorized_table (id integer)'),
      ).rejects.toMatchObject({ code: '42501' });
    } finally {
      await Promise.all(pools.map((pool) => pool.end()));
      await scratch.dispose();
      await administrator.query(
        `DROP ROLE IF EXISTS ${identifiers.join(', ')}`,
      );
      await administrator.end();
    }
  });
});
