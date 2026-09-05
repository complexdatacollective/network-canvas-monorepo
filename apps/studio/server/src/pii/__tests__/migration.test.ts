import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { expect, it } from 'vitest';

import {
  createScratchDatabase,
  reachableDb,
} from '../../__tests__/support/postgres.ts';
import { SCHEMA_FINGERPRINT } from '../../db/fingerprint.generated.ts';
import { readMigrations } from '../../db/migrations/artifact.ts';
import { migrateDatabase } from '../../db/migrations/migrate.ts';
import { createMaintenancePool } from '../../db/pool.ts';
import { EncryptionStartupError, initializeEncryption } from '../initialize.ts';
import { configuration, rootOne } from './fixtures.ts';

const database = await reachableDb();
const migrations = await readMigrations(
  fileURLToPath(new URL('../../../migrations', import.meta.url)),
);

it('preserves populated legacy credentials and index bytes through migration0002', async () => {
  if (!database) throw new Error('A local database is required.');
  const scratch = await createScratchDatabase(database);
  try {
    const initial = migrations[0];
    if (!initial) throw new Error('Initial migration missing.');
    await migrateDatabase(
      scratch.pool,
      [initial],
      initial.manifest.fingerprint,
    );
    const teamA = randomUUID();
    const teamB = randomUUID();
    const protocolId = randomUUID();
    const studyId = randomUUID();
    const participantId = randomUUID();
    const templateId = randomUUID();
    const deliveryId = randomUUID();
    const webhookId = randomUUID();
    const accountId = randomUUID();
    const userId = randomUUID();
    const index = randomBytes(32);
    const ciphertext = randomBytes(48);
    await scratch.pool.query(
      'INSERT INTO teams (id, name, slug) VALUES ($1, $1, $1), ($2, $2, $2)',
      [teamA, teamB],
    );
    await scratch.pool.query(
      'INSERT INTO "user" (id, name, email, "emailVerified") VALUES ($1, $2, $3, true)',
      [userId, 'Synthetic legacy user', 'legacy@example.org'],
    );
    await scratch.pool.query(
      'INSERT INTO account (id, "userId", "accountId", "providerId", issuer, "accessToken", "updatedAt") VALUES ($1, $2, $1, $3, $4, $5, now())',
      [
        accountId,
        userId,
        'google',
        'https://accounts.google.com',
        'synthetic-legacy-token',
      ],
    );
    await scratch.pool.query(
      'INSERT INTO protocols (id, team_id, name) VALUES ($1, $2, $3)',
      [protocolId, teamA, 'Protocol'],
    );
    await scratch.pool.query(
      'INSERT INTO studies (id, team_id, protocol_id, name) VALUES ($1, $2, $3, $4)',
      [studyId, teamA, protocolId, 'Study'],
    );
    await scratch.pool.query(
      `INSERT INTO participants (id, team_id, study_id, participant_code, email_ciphertext, email_index, pii_key_id, pii_algorithm) VALUES ($1, $2, $3, 'P-legacy', $4, $5, 'legacy-pii', 'aes-256-gcm')`,
      [participantId, teamA, studyId, ciphertext, index],
    );
    await scratch.pool.query(
      `INSERT INTO message_templates (id, team_id, kind, channel, locale, version, state, subject, body) VALUES ($1, $2, 'invitation', 'email', 'en', 1, 'published', 'Invitation', 'Synthetic body')`,
      [templateId, teamA],
    );
    await scratch.pool.query(
      `INSERT INTO message_deliveries (id, team_id, study_id, participant_id, template_id, kind, channel, recipient_blind_index, rendered_body_hash) VALUES ($1, $2, $3, $4, $5, 'invitation', 'email', $6, $7)`,
      [
        deliveryId,
        teamA,
        studyId,
        participantId,
        templateId,
        index.toString('hex'),
        'a'.repeat(64),
      ],
    );
    await scratch.pool.query(
      `INSERT INTO participant_contact_optouts (team_id, channel, recipient_blind_index, source, opted_out_at) VALUES ($1, 'email', $3, 'researcher', '2026-08-02T00:00:00Z'), ($2, 'email', $3, 'provider', '2026-08-01T00:00:00Z')`,
      [teamA, teamB, index.toString('hex')],
    );
    await scratch.pool.query(
      `INSERT INTO webhook_subscriptions (id, team_id, url, event_types, secret_ciphertext, secret_key_id, created_by_user_id) VALUES ($1, $2, 'https://hooks.example.org/legacy', ARRAY['interview.completed'], $3, 'legacy-integration', $4)`,
      [webhookId, teamA, ciphertext, userId],
    );
    await scratch.pool.query(
      "UPDATE studies SET state = 'closed', went_live_at = now(), closed_at = now() WHERE id = $1",
      [studyId],
    );

    await expect(
      migrateDatabase(scratch.pool, migrations, SCHEMA_FINGERPRINT),
    ).resolves.toEqual(
      migrations.slice(1).map((migration) => migration.manifest.id),
    );
    expect(
      (
        await scratch.pool.query(
          'SELECT recipient_blind_index, blind_index_key_id FROM message_deliveries WHERE id = $1',
          [deliveryId],
        )
      ).rows,
    ).toEqual([
      { recipient_blind_index: index, blind_index_key_id: 'legacy-hex-v1' },
    ]);
    expect(
      (
        await scratch.pool.query(
          'SELECT recipient_blind_index, blind_index_key_id, source, opted_out_at FROM participant_contact_optouts',
        )
      ).rows,
    ).toEqual([
      {
        recipient_blind_index: index,
        blind_index_key_id: 'legacy-hex-v1',
        source: 'provider',
        opted_out_at: new Date('2026-08-01T00:00:00Z'),
      },
    ]);
    expect(
      (
        await scratch.pool.query(
          'SELECT email_ciphertext, email_index, blind_index_key_id FROM participants WHERE id = $1',
          [participantId],
        )
      ).rows,
    ).toEqual([
      {
        email_ciphertext: ciphertext,
        email_index: index,
        blind_index_key_id: 'legacy-unverified-v1',
      },
    ]);
    expect(
      (
        await scratch.pool.query(
          'SELECT "accessToken", access_token_ciphertext FROM account WHERE id = $1',
          [accountId],
        )
      ).rows,
    ).toEqual([
      { accessToken: 'synthetic-legacy-token', access_token_ciphertext: null },
    ]);
    expect(
      (
        await scratch.pool.query(
          'SELECT secret_ciphertext, secret_algorithm FROM webhook_subscriptions WHERE id = $1',
          [webhookId],
        )
      ).rows,
    ).toEqual([
      { secret_ciphertext: ciphertext, secret_algorithm: 'aes-256-gcm.v1' },
    ]);
    expect(
      (
        await scratch.pool.query(
          "SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE oid = 'participant_contact_optouts'::regclass",
        )
      ).rows,
    ).toEqual([{ relrowsecurity: false, relforcerowsecurity: false }]);
    const maintenance = createMaintenancePool(scratch.db);
    try {
      await expect(
        initializeEncryption({
          maintenancePool: maintenance,
          configuration: configuration(),
          loadRootKey: async () => rootOne,
        }),
      ).rejects.toThrow(EncryptionStartupError);
    } finally {
      await maintenance.end();
    }
  } finally {
    await scratch.dispose();
  }
});
