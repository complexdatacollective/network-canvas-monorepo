import { Effect } from 'effect';
import { afterAll, describe, expect, it } from 'vitest';

import {
  applySchema,
  MigratedDatabaseRefused,
} from '../../../scripts/apply.ts';
import {
  committedMigrations,
  createOwnedScratchDatabase,
  type OwnedScratchDatabase,
} from '../../__tests__/support/migrations.ts';
import { reachableDb } from '../../__tests__/support/postgres.ts';
import { OwnerDatabase } from '../client.ts';
import { migrateDatabaseEffect } from '../migrate.ts';
import { checkSchema } from '../schema.ts';

// `apply-schema` is the checkout lane's push (#1901 step 6): it reconciles a
// development database in place, and it never touches one that `migrate`
// manages, because a push records no migration and the next `migrate` would
// find history that no longer describes the database.

const db = await reachableDb();

const CASE_TIMEOUT_MS = 180_000;

describe.skipIf(!db)('apply-schema', () => {
  const scratches: OwnedScratchDatabase[] = [];
  afterAll(async () => {
    for (const scratch of scratches) {
      await scratch.dispose().catch(() => undefined);
    }
  }, 120_000);

  async function emptyDatabase(): Promise<OwnedScratchDatabase> {
    if (!db) throw new Error('unreachable: probe guaranteed a database');
    const scratch = await createOwnedScratchDatabase(db);
    scratches.push(scratch);
    return scratch;
  }

  it(
    'refuses a migrated database, naming migrate, and leaves it untouched',
    async () => {
      const scratch = await emptyDatabase();
      await Effect.runPromise(
        migrateDatabaseEffect(committedMigrations()).pipe(
          Effect.provide(OwnerDatabase.layer(scratch.db)),
        ),
      );
      const state = () =>
        scratch.pool.query(
          `select xmin::text, "fingerprint", "appliedAt" from "schemaFingerprint"`,
        );
      const before = (await state()).rows;
      expect(before).toHaveLength(1);

      const refusal: unknown = await applySchema(scratch.pool).then(
        () => 'applied',
        (error: unknown) => error,
      );
      expect(refusal).toBeInstanceOf(MigratedDatabaseRefused);
      const message = refusal instanceof Error ? refusal.message : '';
      expect(message).toMatch(/managed by migrate/);
      expect(message).toMatch(/studio-api migrate/);
      expect(message).toMatch(/docker compose run --rm migrate/);

      expect((await state()).rows).toEqual(before);
      expect(await checkSchema(scratch.pool)).toEqual({ kind: 'current' });
    },
    CASE_TIMEOUT_MS,
  );

  it(
    'still applies to an empty database',
    async () => {
      const scratch = await emptyDatabase();
      const outcome = await applySchema(scratch.pool);
      expect(outcome.statements.length).toBeGreaterThan(0);
      expect(await checkSchema(scratch.pool)).toEqual({ kind: 'current' });
    },
    CASE_TIMEOUT_MS,
  );
});
