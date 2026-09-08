import { fileURLToPath } from 'node:url';

import { expect, it } from 'vitest';

import { readMigrations } from '@codaco/studio-sync/postgres-migration-artifacts';

import {
  createScratchDatabase,
  reachableDb,
  seedTestEncryptionKeyVerifications,
} from '../../__tests__/support/postgres.ts';
import { SCHEMA_FINGERPRINT } from '../../db/fingerprint.generated.ts';
import { migrateDatabase } from '../../db/migrations/migrate.ts';

const database = await reachableDb();
const migrations = await readMigrations(
  fileURLToPath(new URL('../../../migrations', import.meta.url)),
);

it.skipIf(!database)(
  'upgrades a populated 0008 database without admitting users or retrying uncertain webhooks',
  async () => {
    if (!database) throw new Error('Recovery migration requires PostgreSQL.');
    const scratch = await createScratchDatabase(database);
    try {
      const login = (
        await scratch.pool.query<{ login: string }>(
          'SELECT session_user AS login',
        )
      ).rows[0]!.login;
      const through0008 = migrations.slice(0, 8);
      const fingerprint0008 = through0008.at(-1)?.manifest.fingerprint;
      if (!fingerprint0008) throw new Error('Migration 0008 is required.');
      await migrateDatabase(scratch.pool, through0008, fingerprint0008, [
        login,
      ]);
      await seedTestEncryptionKeyVerifications(scratch.pool, [
        { purpose: 'integration-enc', keyId: 'recovery-migration-key' },
      ]);
      await scratch.pool.query(`
        INSERT INTO "user" (id, name, email, "emailVerified", "updatedAt")
          VALUES ('retained-user', 'Retained', 'retained@example.com', true, now());
        INSERT INTO teams (id, name, slug)
          VALUES ('retained-team', 'Retained', 'retained-team');
        INSERT INTO webhook_subscriptions
          (id, team_id, url, event_types, secret_ciphertext, secret_key_id,
           secret_algorithm, created_by_user_id)
          VALUES ('00000000-0000-4000-8000-000000000041', 'retained-team',
            'https://retained.example.invalid/hook', ARRAY['study.updated'],
            decode(repeat('ab', 29), 'hex'), 'recovery-migration-key',
            'aes-256-gcm.v1', 'retained-user');
        INSERT INTO webhook_deliveries
          (id, team_id, subscription_id, webhook_id, event_type, payload)
          VALUES ('00000000-0000-4000-8000-000000000042', 'retained-team',
            '00000000-0000-4000-8000-000000000041', 'retained-webhook',
            'study.updated', '{}'::jsonb);
      `);

      await migrateDatabase(scratch.pool, migrations, SCHEMA_FINGERPRINT, [
        login,
      ]);

      const retained = await scratch.pool.query<{
        id: string;
        recovery_disabled: boolean;
        uncertain_at: Date | null;
      }>(`SELECT u.id, u.recovery_disabled, d.uncertain_at
          FROM "user" u CROSS JOIN webhook_deliveries d
          WHERE u.id = 'retained-user'
            AND d.id = '00000000-0000-4000-8000-000000000042'`);
      expect(retained.rows).toEqual([
        {
          id: 'retained-user',
          recovery_disabled: false,
          uncertain_at: null,
        },
      ]);
      const guard = await scratch.pool.query<{ predicate: string }>(
        `SELECT pg_get_expr(index.indpred, index.indrelid) AS predicate
         FROM pg_index index
         WHERE index.indexrelid = 'webhook_deliveries_dispatch_idx'::regclass`,
      );
      expect(guard.rows[0]?.predicate).toContain('uncertain_at IS NULL');
      await expect(
        scratch.pool.query(
          `UPDATE webhook_deliveries
           SET delivered_at = now(), uncertain_at = now()
           WHERE id = '00000000-0000-4000-8000-000000000042'`,
        ),
      ).rejects.toMatchObject({
        constraint: 'webhook_deliveries_terminal_state_check',
      });
    } finally {
      await scratch.dispose();
    }
  },
);
