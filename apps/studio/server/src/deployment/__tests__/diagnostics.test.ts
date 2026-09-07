import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { readMigrations } from '@codaco/studio-sync/postgres-migration-artifacts';

import { enrollMigrationTestDatabase } from '../../__tests__/support/migrations.ts';
import {
  createScratchDatabase,
  reachableDb,
} from '../../__tests__/support/postgres.ts';
import { SCHEMA_FINGERPRINT } from '../../db/fingerprint.generated.ts';
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
      try {
        const allowedLogins = await enrollMigrationTestDatabase(
          scratch.pool,
          db,
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
        const settings = {
          ...readEnv(),
          db: scratch.db,
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
          scratch.db.url,
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
      }
    },
  );
});
