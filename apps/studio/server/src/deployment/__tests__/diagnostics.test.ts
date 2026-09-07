import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import pg, { escapeIdentifier } from 'pg';
import { describe, expect, it } from 'vitest';

import { enrollMigrationTestDatabase } from '../../__tests__/support/migrations.ts';
import {
  createScratchDatabase,
  reachableDb,
} from '../../__tests__/support/postgres.ts';
import { SCHEMA_FINGERPRINT } from '../../db/fingerprint.generated.ts';
import { readMigrations } from '../../db/migrations/artifact.ts';
import { migrateDatabase } from '../../db/migrations/migrate.ts';
import { readEnv } from '../../env.ts';
import { configuration, rootOne } from '../../pii/__tests__/fixtures.ts';
import { collectDiagnostics } from '../diagnostics.ts';

const db = await reachableDb();
const migrations = await readMigrations(
  fileURLToPath(new URL('../../../migrations', import.meta.url)),
);

describe.skipIf(!db)('read-only operator diagnostics', () => {
  it.each(['web', 'worker'] as const)(
    'reports actual database settings without registering proofs or exposing secrets as %s',
    async (role) => {
      if (!db) throw new Error('A local database is required.');
      const scratch = await createScratchDatabase(db);
      const suffix = randomUUID().replaceAll('-', '');
      const appLogin = `diagnostics_app_${suffix}`;
      const maintenanceLogin = `diagnostics_maintenance_${suffix}`;
      const password = 'diagnostics-runtime-synthetic-only';
      let created = false;
      try {
        await scratch.pool.query(
          `CREATE ROLE ${escapeIdentifier(appLogin)} LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION PASSWORD '${password}';
           CREATE ROLE ${escapeIdentifier(maintenanceLogin)} LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION PASSWORD '${password}';
           GRANT studio_app TO ${escapeIdentifier(appLogin)} WITH ADMIN FALSE, SET TRUE, INHERIT FALSE;
           GRANT studio_maintenance TO ${escapeIdentifier(maintenanceLogin)} WITH ADMIN FALSE, SET TRUE, INHERIT FALSE`,
        );
        created = true;
        const allowedLogins = await enrollMigrationTestDatabase(
          scratch.pool,
          db,
          [appLogin, maintenanceLogin],
        );
        await migrateDatabase(
          scratch.pool,
          migrations,
          SCHEMA_FINGERPRINT,
          allowedLogins,
        );
        const proofs = async () =>
          (
            await scratch.pool.query(
              'SELECT count(*)::integer AS count FROM encryption_key_verifications',
            )
          ).rows;
        expect(await proofs()).toEqual([{ count: 0 }]);
        const runtimeDb = (login: string) => {
          const url = new URL(scratch.db.url);
          url.username = login;
          url.password = password;
          return { url: url.href };
        };
        const settings = {
          ...readEnv(),
          db: runtimeDb(appLogin),
          maintenanceDb: runtimeDb(maintenanceLogin),
          databaseAllowedLogins: allowedLogins,
          s3: undefined,
          role,
          devDefaults: false,
        };
        const result = await collectDiagnostics(settings, () => ({
          configuration: configuration(),
          loadRootKey: async () => rootOne,
        }));
        expect(result.role).toBe(role);
        expect(result.readiness.checks).toEqual({
          database: 'ok',
          schema: 'current',
          object_store: 'unconfigured',
        });
        expect(result.databaseProfile).toMatchObject({ readOnly: true });
        expect(result.databaseProfile!.sharedBuffersBytes).toBeGreaterThan(0);
        expect(result.databaseProfile!.workMemBytes).toBeGreaterThan(0);
        expect(result.encryption).toEqual({
          rootsLoadable: true,
          historicalKeyVerification: 'not_run_read_only',
        });
        expect(await proofs()).toEqual([{ count: 0 }]);
        const serialized = JSON.stringify(result);
        for (const secret of [
          rootOne.toString('base64'),
          settings.db.url,
          settings.maintenanceDb.url,
          settings.auth!.secret,
        ])
          expect(serialized.includes(secret)).toBe(false);
        const missing = await collectDiagnostics(settings, () => {
          throw new Error('secret-key-reference-must-not-escape');
        });
        expect(missing.encryption.rootsLoadable).toBe(false);
        expect(JSON.stringify(missing)).not.toContain(
          'secret-key-reference-must-not-escape',
        );
        expect(await proofs()).toEqual([{ count: 0 }]);
      } finally {
        await scratch.dispose();
        if (created) {
          const cleanup = new pg.Pool({
            connectionString: db.url,
          });
          try {
            await cleanup.query(
              `DROP ROLE IF EXISTS ${escapeIdentifier(appLogin)}, ${escapeIdentifier(maintenanceLogin)}`,
            );
          } finally {
            await cleanup.end();
          }
        }
      }
    },
  );
});
