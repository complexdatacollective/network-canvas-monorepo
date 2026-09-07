import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { expect, it } from 'vitest';

import { createTenantDb } from '@codaco/studio-sync/tenant';

import { enrollMigrationTestDatabase } from '../../__tests__/support/migrations.ts';
import {
  createScratchDatabase,
  reachableDb,
} from '../../__tests__/support/postgres.ts';
import { SCHEMA_FINGERPRINT } from '../../db/fingerprint.generated.ts';
import { readMigrations } from '../../db/migrations/artifact.ts';
import { migrateDatabase } from '../../db/migrations/migrate.ts';
import { createPool, createMaintenancePool } from '../../db/pool.ts';
import { createContactBlindIndex } from '../contacts.ts';
import {
  EncryptionStartupError,
  initializeCredentialMigration,
  initializeEncryption,
} from '../initialize.ts';
import {
  CLASSIFIED_LEGACY_CONTACT_INDEX_ID,
  classifyLegacyContactIndexBatch,
  createClassifiedLegacyContactIndex,
  RAW_LEGACY_CONTACT_INDEX_ID,
  RAW_LEGACY_PARTICIPANT_INDEX_ID,
} from '../legacy-indexes.ts';
import { migrateLegacyDataBatch } from '../maintenance.ts';
import { createDataProtection } from '../protection.ts';
import { isContactSuppressed } from '../suppression.ts';
import { configuration, loadTestKeys, rootOne } from './fixtures.ts';

const database = await reachableDb();
const migrations = await readMigrations(
  fileURLToPath(new URL('../../../migrations', import.meta.url)),
);

async function createLegacyNoContactUpgrade(
  options: {
    currentKeyId?: 'v1' | 'v2';
    corruptCiphertext?: boolean;
  } = {},
) {
  if (!database) throw new Error('A local database is required.');
  const scratch = await createScratchDatabase(database);
  const maintenance = createMaintenancePool(scratch.db);
  try {
    const allowedLogins = await enrollMigrationTestDatabase(
      scratch.pool,
      database,
    );
    const initial = migrations[0];
    if (!initial) throw new Error('Initial migration missing.');
    await migrateDatabase(
      scratch.pool,
      [initial],
      initial.manifest.fingerprint,
      allowedLogins,
    );
    const teamId = randomUUID();
    const protocolId = randomUUID();
    const studyId = randomUUID();
    const participantId = randomUUID();
    const config = configuration();
    config.pii.current = options.currentKeyId ?? 'v2';
    const keys = await loadTestKeys(config);
    const protection = createDataProtection(keys, {
      participant: async (_target, read) => {
        read();
      },
      integration: async (_target, read) => {
        read();
      },
    });
    const plaintext = Buffer.from('Legacy name only');
    const envelope = protection.encryptParticipant(
      {
        teamId,
        studyId,
        participantId,
        column: 'name_ciphertext',
      },
      plaintext,
      'v1',
    ).envelope;
    await scratch.pool.query(
      "INSERT INTO teams (id, name, slug) VALUES ($1, 'Legacy team', $1)",
      [teamId],
    );
    await scratch.pool.query(
      "INSERT INTO protocols (id, team_id, name) VALUES ($1, $2, 'Legacy protocol')",
      [protocolId, teamId],
    );
    await scratch.pool.query(
      "INSERT INTO studies (id, team_id, protocol_id, name) VALUES ($1, $2, $3, 'Legacy study')",
      [studyId, teamId, protocolId],
    );
    await scratch.pool.query(
      `INSERT INTO participants
        (id, team_id, study_id, participant_code, name_ciphertext,
         pii_key_id, pii_algorithm)
       VALUES ($1, $2, $3, 'P-name-only', $4, 'v1', 'aes-256-gcm.v1')`,
      [
        participantId,
        teamId,
        studyId,
        options.corruptCiphertext ? randomBytes(envelope.length) : envelope,
      ],
    );
    await migrateDatabase(
      scratch.pool,
      migrations,
      SCHEMA_FINGERPRINT,
      allowedLogins,
    );
    return {
      scratch,
      maintenance,
      config,
      participantId,
      plaintext,
      teamId,
      studyId,
    };
  } catch (error) {
    await maintenance.end();
    await scratch.dispose();
    throw error;
  }
}

it('preserves populated legacy credentials and index bytes through migration0002', async () => {
  if (!database) throw new Error('A local database is required.');
  const scratch = await createScratchDatabase(database);
  try {
    const allowedLogins = await enrollMigrationTestDatabase(
      scratch.pool,
      database,
    );
    const initial = migrations[0];
    if (!initial) throw new Error('Initial migration missing.');
    await migrateDatabase(
      scratch.pool,
      [initial],
      initial.manifest.fingerprint,
      allowedLogins,
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
    const index = createClassifiedLegacyContactIndex({
      kind: 'email',
      value: 'legacy@example.org',
    }).value;
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
      migrateDatabase(
        scratch.pool,
        migrations,
        SCHEMA_FINGERPRINT,
        allowedLogins,
      ),
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
      {
        recipient_blind_index: index,
        blind_index_key_id: RAW_LEGACY_CONTACT_INDEX_ID,
      },
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
        blind_index_key_id: RAW_LEGACY_CONTACT_INDEX_ID,
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
        blind_index_key_id: RAW_LEGACY_PARTICIPANT_INDEX_ID,
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
    const app = createPool(scratch.db);
    try {
      for (const column of [
        '"accessToken"',
        '"refreshToken"',
        '"idToken"',
        '*',
      ]) {
        for (const runtime of [app, maintenance]) {
          await expect(
            runtime.query(`SELECT ${column} FROM account WHERE id = $1`, [
              accountId,
            ]),
          ).rejects.toMatchObject({ code: '42501' });
        }
      }
      await expect(
        initializeEncryption({
          maintenancePool: maintenance,
          configuration: configuration(),
          loadRootKey: async () => rootOne,
        }),
      ).rejects.toThrow(EncryptionStartupError);
      await expect(
        initializeCredentialMigration({
          maintenancePool: maintenance,
          configuration: configuration(),
          loadRootKey: async () => rootOne,
        }),
      ).rejects.toThrow(EncryptionStartupError);
      await expect(
        classifyLegacyContactIndexBatch(maintenance, 100),
      ).rejects.toThrow('requires the table owner');
      await maintenance.query(
        "SELECT set_config('app.legacy_index_remediation', 'v1', false)",
      );
      await expect(
        maintenance.query(
          `UPDATE participant_contact_optouts SET blind_index_key_id = $1
           WHERE blind_index_key_id = $2`,
          [CLASSIFIED_LEGACY_CONTACT_INDEX_ID, RAW_LEGACY_CONTACT_INDEX_ID],
        ),
      ).rejects.toThrow('legacy blind indexes are written only');
      await maintenance.query('RESET app.legacy_index_remediation');
      await expect(
        classifyLegacyContactIndexBatch(scratch.pool, 100),
      ).resolves.toEqual({ processed: 2, passComplete: true });
      expect(
        (
          await scratch.pool.query(
            `SELECT recipient_blind_index, blind_index_key_id FROM message_deliveries
             UNION ALL SELECT recipient_blind_index, blind_index_key_id FROM participant_contact_optouts`,
          )
        ).rows,
      ).toEqual([
        {
          recipient_blind_index: index,
          blind_index_key_id: CLASSIFIED_LEGACY_CONTACT_INDEX_ID,
        },
        {
          recipient_blind_index: index,
          blind_index_key_id: CLASSIFIED_LEGACY_CONTACT_INDEX_ID,
        },
      ]);
      expect(
        (
          await scratch.pool.query(
            `SELECT action, outcome FROM credential_audit_events
             WHERE user_id = 'system:encryption-maintenance'`,
          )
        ).rows,
      ).toEqual([{ action: 'migrate_legacy', outcome: 'succeeded' }]);
      // Classification cannot make unauthenticated participant ciphertext
      // startable or bless its unknown key ID.
      await expect(
        initializeEncryption({
          maintenancePool: maintenance,
          configuration: configuration(),
          loadRootKey: async () => rootOne,
        }),
      ).rejects.toThrow(EncryptionStartupError);
    } finally {
      await app.end();
      await maintenance.end();
    }
  } finally {
    await scratch.dispose();
  }
});

it('authenticates and re-encrypts legacy participants whose PII has no contact index', async () => {
  if (!database) throw new Error('A local database is required.');
  const scratch = await createScratchDatabase(database);
  const maintenance = createMaintenancePool(scratch.db);
  try {
    const allowedLogins = await enrollMigrationTestDatabase(
      scratch.pool,
      database,
    );
    const initial = migrations[0];
    if (!initial) throw new Error('Initial migration missing.');
    await migrateDatabase(
      scratch.pool,
      [initial],
      initial.manifest.fingerprint,
      allowedLogins,
    );

    const teamId = randomUUID();
    const protocolId = randomUUID();
    const studyId = randomUUID();
    const nameParticipantId = randomUUID();
    const attributesParticipantId = randomUUID();
    const config = configuration();
    config.pii.current = 'v2';
    const preMigrationKeys = await loadTestKeys(config);
    const protection = createDataProtection(preMigrationKeys, {
      participant: async (_target, read) => {
        read();
      },
      integration: async (_target, read) => {
        read();
      },
    });
    const name = Buffer.from('Legacy name only');
    const attributes = Buffer.from('{"cohort":"legacy"}');
    const nameCiphertext = protection.encryptParticipant(
      {
        teamId,
        studyId,
        participantId: nameParticipantId,
        column: 'name_ciphertext',
      },
      name,
      'v1',
    ).envelope;
    const attributesCiphertext = protection.encryptParticipant(
      {
        teamId,
        studyId,
        participantId: attributesParticipantId,
        column: 'attributes_ciphertext',
      },
      attributes,
      'v1',
    ).envelope;
    await scratch.pool.query(
      "INSERT INTO teams (id, name, slug) VALUES ($1, 'Legacy team', $1)",
      [teamId],
    );
    await scratch.pool.query(
      "INSERT INTO protocols (id, team_id, name) VALUES ($1, $2, 'Legacy protocol')",
      [protocolId, teamId],
    );
    await scratch.pool.query(
      "INSERT INTO studies (id, team_id, protocol_id, name) VALUES ($1, $2, $3, 'Legacy study')",
      [studyId, teamId, protocolId],
    );
    await scratch.pool.query(
      `INSERT INTO participants
        (id, team_id, study_id, participant_code, name_ciphertext,
         pii_key_id, pii_algorithm)
       VALUES ($1, $2, $3, 'P-name-only', $4, 'v1', 'aes-256-gcm.v1')`,
      [nameParticipantId, teamId, studyId, nameCiphertext],
    );
    await scratch.pool.query(
      `INSERT INTO participants
        (id, team_id, study_id, participant_code, attributes_ciphertext,
         pii_key_id, pii_algorithm)
       VALUES ($1, $2, $3, 'P-attributes-only', $4, 'v1', 'aes-256-gcm.v1')`,
      [attributesParticipantId, teamId, studyId, attributesCiphertext],
    );

    await migrateDatabase(
      scratch.pool,
      migrations,
      SCHEMA_FINGERPRINT,
      allowedLogins,
    );
    expect(
      (
        await scratch.pool.query(
          'SELECT blind_index_key_id FROM participants ORDER BY participant_code',
        )
      ).rows,
    ).toEqual([{ blind_index_key_id: null }, { blind_index_key_id: null }]);

    const input = {
      maintenancePool: maintenance,
      configuration: config,
      loadRootKey: async (reference: string) => {
        if (reference === 'TEST_ROOT_ONE') return rootOne;
        return Buffer.alloc(32, 93);
      },
    };
    const keys = await initializeCredentialMigration(input);
    await expect(
      migrateLegacyDataBatch(maintenance, scratch.pool, keys, { limit: 100 }),
    ).resolves.toEqual({
      processed: 2,
      scanned: 2,
      afterId: null,
      passComplete: true,
    });
    await expect(initializeEncryption(input)).resolves.toBeDefined();

    const rows = await scratch.pool.query<{
      id: string;
      name_ciphertext: Buffer | null;
      attributes_ciphertext: Buffer | null;
      pii_key_id: string;
      blind_index_key_id: string | null;
    }>(
      `SELECT id, name_ciphertext, attributes_ciphertext, pii_key_id,
         blind_index_key_id FROM participants ORDER BY participant_code`,
    );
    expect(
      rows.rows.map(({ pii_key_id, blind_index_key_id }) => ({
        pii_key_id,
        blind_index_key_id,
      })),
    ).toEqual([
      { pii_key_id: 'v2', blind_index_key_id: null },
      { pii_key_id: 'v2', blind_index_key_id: null },
    ]);
    const read = createDataProtection(keys, {
      participant: async (_target, reveal) => {
        reveal();
      },
      integration: async (_target, reveal) => {
        reveal();
      },
    });
    const attributesRow = rows.rows[0];
    const nameRow = rows.rows[1];
    if (!attributesRow?.attributes_ciphertext || !nameRow?.name_ciphertext)
      throw new Error('Migrated ciphertext is missing.');
    await expect(
      read.readParticipant(
        {
          teamId,
          studyId,
          participantId: attributesParticipantId,
          column: 'attributes_ciphertext',
        },
        {
          keyId: attributesRow.pii_key_id,
          algorithm: 'aes-256-gcm.v1',
          envelope: attributesRow.attributes_ciphertext,
        },
      ),
    ).resolves.toEqual(attributes);
    await expect(
      read.readParticipant(
        {
          teamId,
          studyId,
          participantId: nameParticipantId,
          column: 'name_ciphertext',
        },
        {
          keyId: nameRow.pii_key_id,
          algorithm: 'aes-256-gcm.v1',
          envelope: nameRow.name_ciphertext,
        },
      ),
    ).resolves.toEqual(name);
    expect(
      (
        await scratch.pool.query(
          `SELECT event_type, count(*)::int AS count FROM audit_events
           WHERE resource_id = ANY($1::text[])
           GROUP BY event_type ORDER BY event_type`,
          [[nameParticipantId, attributesParticipantId]],
        )
      ).rows,
    ).toEqual([
      { event_type: 'participant.pii.rotated', count: 2 },
      { event_type: 'participant.pii.rotation_read', count: 2 },
    ]);
  } finally {
    await maintenance.end();
    await scratch.dispose();
  }
});

it('refuses an unproved current key on a legacy no-contact participant', async () => {
  const fixture = await createLegacyNoContactUpgrade({ currentKeyId: 'v1' });
  try {
    await expect(
      initializeCredentialMigration({
        maintenancePool: fixture.maintenance,
        configuration: fixture.config,
        loadRootKey: async (reference) =>
          reference === 'TEST_ROOT_ONE' ? rootOne : Buffer.alloc(32, 93),
      }),
    ).rejects.toThrow(EncryptionStartupError);
    expect(
      (
        await fixture.scratch.pool.query(
          'SELECT pii_key_id, blind_index_key_id FROM participants WHERE id = $1',
          [fixture.participantId],
        )
      ).rows,
    ).toEqual([{ pii_key_id: 'v1', blind_index_key_id: null }]);
    expect(
      (
        await fixture.scratch.pool.query(
          'SELECT * FROM encryption_key_verifications',
        )
      ).rowCount,
    ).toBe(0);
  } finally {
    await fixture.maintenance.end();
    await fixture.scratch.dispose();
  }
});

it('refuses a historical key shared with a nonlegacy contact-index shape', async () => {
  const fixture = await createLegacyNoContactUpgrade();
  try {
    const participantId = randomUUID();
    const keys = await loadTestKeys(fixture.config);
    const protection = createDataProtection(keys, {
      participant: async (_target, read) => {
        read();
      },
      integration: async (_target, read) => {
        read();
      },
    });
    const emailCiphertext = protection.encryptParticipant(
      {
        teamId: fixture.teamId,
        studyId: fixture.studyId,
        participantId,
        column: 'email_ciphertext',
      },
      Buffer.from('mixed@example.org'),
      'v1',
    ).envelope;
    await fixture.scratch.pool.query(
      `INSERT INTO participants
        (id, team_id, study_id, participant_code, email_ciphertext, email_index,
         blind_index_key_id, pii_key_id, pii_algorithm)
       VALUES ($1, $2, $3, 'P-mixed', $4, $5, 'index-1', 'v1', 'aes-256-gcm.v1')`,
      [
        participantId,
        fixture.teamId,
        fixture.studyId,
        emailCiphertext,
        randomBytes(32),
      ],
    );
    await expect(
      initializeCredentialMigration({
        maintenancePool: fixture.maintenance,
        configuration: fixture.config,
        loadRootKey: async (reference) =>
          reference === 'TEST_ROOT_ONE' ? rootOne : Buffer.alloc(32, 93),
      }),
    ).rejects.toThrow(EncryptionStartupError);
    expect(
      (
        await fixture.scratch.pool.query(
          'SELECT * FROM encryption_key_verifications',
        )
      ).rowCount,
    ).toBe(0);
  } finally {
    await fixture.maintenance.end();
    await fixture.scratch.dispose();
  }
});

it.each([
  ['corrupt ciphertext', true, rootOne],
  ['wrong historical root', false, Buffer.alloc(32, 18)],
] as const)(
  'does not prove or replace a no-contact historical key with %s',
  async (_case, corruptCiphertext, historicalRoot) => {
    const fixture = await createLegacyNoContactUpgrade({ corruptCiphertext });
    try {
      const keys = await initializeCredentialMigration({
        maintenancePool: fixture.maintenance,
        configuration: fixture.config,
        loadRootKey: async (reference) =>
          reference === 'TEST_ROOT_ONE'
            ? Buffer.from(historicalRoot)
            : Buffer.alloc(32, 93),
      });
      await expect(
        migrateLegacyDataBatch(
          fixture.maintenance,
          fixture.scratch.pool,
          keys,
          { limit: 100 },
        ),
      ).rejects.toThrow('Stored encrypted data could not be read');
      expect(
        (
          await fixture.scratch.pool.query(
            `SELECT count(*)::int AS count FROM encryption_key_verifications
             WHERE purpose = 'pii-enc' AND key_id = 'v1'`,
          )
        ).rows,
      ).toEqual([{ count: 0 }]);
      expect(
        (
          await fixture.scratch.pool.query(
            'SELECT pii_key_id, blind_index_key_id FROM participants WHERE id = $1',
            [fixture.participantId],
          )
        ).rows,
      ).toEqual([{ pii_key_id: 'v1', blind_index_key_id: null }]);
      expect(
        (
          await fixture.scratch.pool.query(
            `SELECT count(*)::int AS count FROM audit_events
             WHERE resource_id = $1 AND event_type = 'participant.pii.rotated'`,
            [fixture.participantId],
          )
        ).rows,
      ).toEqual([{ count: 0 }]);
    } finally {
      await fixture.maintenance.end();
      await fixture.scratch.dispose();
    }
  },
);

it('refuses a no-contact participant changed after its authenticated read', async () => {
  const fixture = await createLegacyNoContactUpgrade();
  try {
    const keys = await initializeCredentialMigration({
      maintenancePool: fixture.maintenance,
      configuration: fixture.config,
      loadRootKey: async (reference) =>
        reference === 'TEST_ROOT_ONE' ? rootOne : Buffer.alloc(32, 93),
    });
    await fixture.scratch.pool.query(`
      CREATE FUNCTION change_legacy_participant_after_read() RETURNS trigger AS $$
      BEGIN
        IF NEW.event_type = 'participant.pii.rotation_read'
           AND NEW.resource_id = '${fixture.participantId}' THEN
          UPDATE participants SET name_ciphertext = name_ciphertext || '\\x00'::bytea
          WHERE id = '${fixture.participantId}';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql SET search_path = public, pg_catalog;
      CREATE TRIGGER change_legacy_participant_after_read
        AFTER INSERT ON audit_events FOR EACH ROW
        EXECUTE FUNCTION change_legacy_participant_after_read();
    `);
    await expect(
      migrateLegacyDataBatch(fixture.maintenance, fixture.scratch.pool, keys, {
        limit: 100,
      }),
    ).rejects.toThrow('Stored encrypted data could not be read');
    expect(
      (
        await fixture.scratch.pool.query(
          `SELECT count(*)::int AS count FROM encryption_key_verifications
           WHERE purpose = 'pii-enc' AND key_id = 'v1'`,
        )
      ).rows,
    ).toEqual([{ count: 0 }]);
    expect(
      (
        await fixture.scratch.pool.query(
          'SELECT pii_key_id, blind_index_key_id FROM participants WHERE id = $1',
          [fixture.participantId],
        )
      ).rows,
    ).toEqual([{ pii_key_id: 'v1', blind_index_key_id: null }]);
  } finally {
    await fixture.maintenance.end();
    await fixture.scratch.dispose();
  }
});

it('authenticates and resumes every legacy index phase before OAuth and preserves mixed suppression', async () => {
  if (!database) throw new Error('A local database is required.');
  const scratch = await createScratchDatabase(database);
  const maintenance = createMaintenancePool(scratch.db);
  const app = createPool(scratch.db);
  try {
    const allowedLogins = await enrollMigrationTestDatabase(
      scratch.pool,
      database,
    );
    const initial = migrations[0];
    if (!initial) throw new Error('Initial migration missing.');
    await migrateDatabase(
      scratch.pool,
      [initial],
      initial.manifest.fingerprint,
      allowedLogins,
    );
    const teamId = randomUUID();
    const protocolId = randomUUID();
    const studyId = randomUUID();
    const participantId = 'ffffffff-ffff-4fff-bfff-ffffffffffff';
    const corruptParticipantId = '00000000-0000-4000-8000-000000000001';
    const templateId = randomUUID();
    const deliveryId = randomUUID();
    const userId = randomUUID();
    const accountId = randomUUID();
    const email = 'legacy-contact@example.org';
    const currentOnlyEmail = 'current-contact@example.org';
    const config = configuration();
    config.pii.current = 'v2';
    const preMigrationKeys = await loadTestKeys(config);
    const protection = createDataProtection(preMigrationKeys, {
      participant: async (_target, read) => {
        read();
      },
      integration: async (_target, read) => {
        read();
      },
    });
    const encrypted = protection.encryptParticipant(
      {
        teamId,
        studyId,
        participantId,
        column: 'email_ciphertext',
      },
      Buffer.from(email),
      'v1',
    );
    const legacyIndex = createClassifiedLegacyContactIndex({
      kind: 'email',
      value: email,
    }).value;
    await scratch.pool.query(
      "INSERT INTO teams (id, name, slug) VALUES ($1, 'Legacy team', $1)",
      [teamId],
    );
    await scratch.pool.query(
      `INSERT INTO "user" (id, name, email, "emailVerified")
       VALUES ($1, 'Legacy user', 'legacy-user@example.org', true)`,
      [userId],
    );
    await scratch.pool.query(
      `INSERT INTO account (id, "userId", "accountId", "providerId", issuer, "accessToken", "updatedAt")
       VALUES ($1, $2, $1, 'google', 'https://accounts.google.com', 'synthetic-legacy-oauth-token', now())`,
      [accountId, userId],
    );
    await scratch.pool.query(
      "INSERT INTO protocols (id, team_id, name) VALUES ($1, $2, 'Legacy protocol')",
      [protocolId, teamId],
    );
    await scratch.pool.query(
      "INSERT INTO studies (id, team_id, protocol_id, name) VALUES ($1, $2, $3, 'Legacy study')",
      [studyId, teamId, protocolId],
    );
    await scratch.pool.query(
      `INSERT INTO participants (id, team_id, study_id, participant_code, email_ciphertext, email_index, pii_key_id, pii_algorithm)
       VALUES ($1, $2, $3, 'P-legacy-valid', $4, $5, 'v1', 'aes-256-gcm.v1')`,
      [participantId, teamId, studyId, encrypted.envelope, legacyIndex],
    );
    await scratch.pool.query(
      `INSERT INTO participants (id, team_id, study_id, participant_code, email_ciphertext, email_index, pii_key_id, pii_algorithm)
       VALUES ($1, $2, $3, 'P-legacy-corrupt', $4, $5, 'v1', 'aes-256-gcm.v1')`,
      [
        corruptParticipantId,
        teamId,
        studyId,
        randomBytes(encrypted.envelope.length),
        randomBytes(32),
      ],
    );
    await scratch.pool.query(
      `INSERT INTO message_templates (id, team_id, kind, channel, locale, version, state, subject, body)
       VALUES ($1, $2, 'invitation', 'email', 'en', 1, 'published', 'Invitation', 'Body')`,
      [templateId, teamId],
    );
    await scratch.pool.query(
      `INSERT INTO message_deliveries (id, team_id, study_id, participant_id, template_id, kind, channel, recipient_blind_index, rendered_body_hash)
       VALUES ($1, $2, $3, $4, $5, 'invitation', 'email', $6, $7)`,
      [
        deliveryId,
        teamId,
        studyId,
        participantId,
        templateId,
        legacyIndex.toString('hex'),
        'a'.repeat(64),
      ],
    );
    await scratch.pool.query(
      `INSERT INTO participant_contact_optouts (team_id, channel, recipient_blind_index, source)
       VALUES ($1, 'email', $2, 'researcher')`,
      [teamId, legacyIndex.toString('hex')],
    );
    await migrateDatabase(
      scratch.pool,
      migrations,
      SCHEMA_FINGERPRINT,
      allowedLogins,
    );
    expect(
      (
        await scratch.pool.query<{
          proconfig: string[];
          triggers: string[];
        }>(
          `SELECT procedure.proconfig,
             array_agg(trigger.tgname::text ORDER BY trigger.tgname) AS triggers
           FROM pg_catalog.pg_proc AS procedure
           JOIN pg_catalog.pg_namespace AS namespace
             ON namespace.oid = procedure.pronamespace
           JOIN pg_catalog.pg_trigger AS trigger
             ON trigger.tgfoid = procedure.oid AND NOT trigger.tgisinternal
           WHERE namespace.nspname = current_schema()
             AND procedure.proname = 'legacy_blind_index_writes_are_guarded'
           GROUP BY procedure.oid, procedure.proconfig`,
        )
      ).rows,
    ).toEqual([
      {
        proconfig: ['search_path=pg_catalog'],
        triggers: [
          'message_deliveries_legacy_blind_index_guard',
          'participant_contact_optouts_legacy_blind_index_guard',
          'participants_legacy_blind_index_guard',
        ],
      },
    ]);
    const appTenant = createTenantDb(app, teamId);
    for (const runtime of [appTenant, createTenantDb(maintenance, teamId)]) {
      await expect(
        runtime.query(
          `UPDATE participants SET blind_index_key_id = 'index-1'
           WHERE id = $1 AND team_id = $2`,
          [participantId, teamId],
        ),
      ).rejects.toThrow('legacy blind indexes are written only');
      await expect(
        runtime.query(
          `UPDATE participants SET email_index = $1
           WHERE id = $2 AND team_id = $3`,
          [randomBytes(32), participantId, teamId],
        ),
      ).rejects.toThrow('legacy blind indexes are written only');
    }
    const markedMaintenance = await maintenance.connect();
    try {
      await markedMaintenance.query('BEGIN');
      await markedMaintenance.query(
        "SELECT set_config('app.legacy_index_remediation', 'v1', true)",
      );
      await expect(
        markedMaintenance.query(
          `UPDATE participants SET blind_index_key_id = 'index-1'
           WHERE id = $1 AND team_id = $2`,
          [participantId, teamId],
        ),
      ).rejects.toThrow('legacy blind indexes are written only');
    } finally {
      await markedMaintenance.query('ROLLBACK');
      markedMaintenance.release();
    }
    await expect(
      app.query(
        `UPDATE participant_contact_optouts SET blind_index_key_id = 'index-1'
         WHERE blind_index_key_id = $1`,
        [RAW_LEGACY_CONTACT_INDEX_ID],
      ),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      maintenance.query(
        `UPDATE participant_contact_optouts SET blind_index_key_id = 'index-1'
         WHERE blind_index_key_id = $1`,
        [RAW_LEGACY_CONTACT_INDEX_ID],
      ),
    ).rejects.toThrow('legacy blind indexes are written only');
    const owner = await scratch.pool.connect();
    try {
      await owner.query('BEGIN');
      await owner.query(
        "SELECT set_config('app.legacy_index_remediation', 'v1', true)",
      );
      await expect(
        owner.query(
          `UPDATE participant_contact_optouts
           SET blind_index_key_id = $1, recipient_blind_index = $2
           WHERE blind_index_key_id = $3`,
          [
            CLASSIFIED_LEGACY_CONTACT_INDEX_ID,
            randomBytes(32),
            RAW_LEGACY_CONTACT_INDEX_ID,
          ],
        ),
      ).rejects.toThrow('legacy blind indexes are written only');
    } finally {
      await owner.query('ROLLBACK');
      owner.release();
    }
    await expect(
      createTenantDb(app, teamId).query(
        `INSERT INTO message_deliveries
          (id, team_id, study_id, participant_id, template_id, kind, channel,
           recipient_blind_index, blind_index_key_id, rendered_body_hash)
         VALUES ($1, $2, $3, $4, $5, 'invitation', 'email', $6, $7, $8)`,
        [
          randomUUID(),
          teamId,
          studyId,
          participantId,
          templateId,
          legacyIndex,
          CLASSIFIED_LEGACY_CONTACT_INDEX_ID,
          'b'.repeat(64),
        ],
      ),
    ).rejects.toThrow('legacy blind indexes are written only');
    await expect(
      maintenance.query(
        `INSERT INTO participant_contact_optouts
          (channel, blind_index_key_id, recipient_blind_index, source)
         VALUES ('email', $1, $2, 'provider')`,
        [RAW_LEGACY_CONTACT_INDEX_ID, randomBytes(32)],
      ),
    ).rejects.toThrow('legacy blind indexes are written only');
    await expect(
      scratch.pool.query(
        `INSERT INTO participant_contact_optouts
          (channel, blind_index_key_id, recipient_blind_index, source)
         VALUES ('email', $1, $2, 'provider')`,
        [CLASSIFIED_LEGACY_CONTACT_INDEX_ID, randomBytes(32)],
      ),
    ).rejects.toThrow('legacy blind indexes are written only');
    await expect(
      scratch.pool.query(
        `UPDATE participant_contact_optouts SET blind_index_key_id = $1
         WHERE blind_index_key_id = $2`,
        [CLASSIFIED_LEGACY_CONTACT_INDEX_ID, RAW_LEGACY_CONTACT_INDEX_ID],
      ),
    ).rejects.toThrow('legacy blind indexes are written only');
    const keys = await initializeCredentialMigration({
      maintenancePool: maintenance,
      configuration: config,
      loadRootKey: async (reference) => {
        if (reference === 'TEST_ROOT_ONE') return rootOne;
        return Buffer.alloc(32, 93);
      },
    });
    await expect(
      migrateLegacyDataBatch(maintenance, scratch.pool, keys, {
        limit: 1,
      }),
    ).rejects.toThrow('Stored encrypted data could not be read');
    expect(
      (
        await scratch.pool.query(
          `SELECT count(*)::int AS count FROM encryption_key_verifications
           WHERE purpose = 'pii-enc' AND key_id = 'v1'`,
        )
      ).rows,
    ).toEqual([{ count: 0 }]);
    expect(
      (
        await scratch.pool.query(
          'SELECT blind_index_key_id FROM participants WHERE id = $1',
          [corruptParticipantId],
        )
      ).rows,
    ).toEqual([{ blind_index_key_id: RAW_LEGACY_PARTICIPANT_INDEX_ID }]);
    // Keep the failed row intact through the assertion. Removing this isolated
    // fixture with the owner lets the same test continue through the valid row.
    await maintenance.query('DELETE FROM participants WHERE id = $1', [
      corruptParticipantId,
    ]);

    let afterId: string | null = null;
    const first = await migrateLegacyDataBatch(
      maintenance,
      scratch.pool,
      keys,
      { limit: 1, afterId },
    );
    expect(first).toMatchObject({ processed: 1, passComplete: false });
    expect(
      (
        await scratch.pool.query(
          'SELECT blind_index_key_id, pii_key_id FROM participants',
        )
      ).rows,
    ).toEqual([{ blind_index_key_id: 'index-1', pii_key_id: 'v2' }]);
    expect(
      (await scratch.pool.query('SELECT "accessToken" FROM account')).rows,
    ).toEqual([{ accessToken: 'synthetic-legacy-oauth-token' }]);

    const second = await migrateLegacyDataBatch(
      maintenance,
      scratch.pool,
      keys,
      { limit: 1, afterId },
    );
    expect(second).toMatchObject({ processed: 1, passComplete: false });
    expect(
      (
        await scratch.pool.query(
          'SELECT blind_index_key_id FROM message_deliveries',
        )
      ).rows,
    ).toEqual([{ blind_index_key_id: CLASSIFIED_LEGACY_CONTACT_INDEX_ID }]);
    expect(
      (
        await scratch.pool.query(
          'SELECT blind_index_key_id FROM participant_contact_optouts',
        )
      ).rows,
    ).toEqual([{ blind_index_key_id: RAW_LEGACY_CONTACT_INDEX_ID }]);

    const third = await migrateLegacyDataBatch(
      maintenance,
      scratch.pool,
      keys,
      { limit: 1, afterId },
    );
    expect(third).toMatchObject({ processed: 1, passComplete: false });
    for (const runtime of [app, maintenance]) {
      const mutation = runtime.query(
        `UPDATE participant_contact_optouts SET recipient_blind_index = $1
         WHERE blind_index_key_id = $2`,
        [randomBytes(32), CLASSIFIED_LEGACY_CONTACT_INDEX_ID],
      );
      if (runtime === app)
        await expect(mutation).rejects.toMatchObject({ code: '42501' });
      else
        await expect(mutation).rejects.toThrow(
          'legacy blind indexes are written only',
        );
    }
    expect(
      (
        await scratch.pool.query(
          `SELECT recipient_blind_index FROM participant_contact_optouts
           WHERE blind_index_key_id = $1`,
          [CLASSIFIED_LEGACY_CONTACT_INDEX_ID],
        )
      ).rows,
    ).toEqual([{ recipient_blind_index: legacyIndex }]);
    expect(
      (await scratch.pool.query('SELECT "accessToken" FROM account')).rows,
    ).toEqual([{ accessToken: 'synthetic-legacy-oauth-token' }]);

    const fourth = await migrateLegacyDataBatch(
      maintenance,
      scratch.pool,
      keys,
      { limit: 1, afterId },
    );
    expect(fourth).toMatchObject({ processed: 1, passComplete: false });
    afterId = fourth.afterId;
    expect(afterId).toBe(accountId);
    const complete = await migrateLegacyDataBatch(
      maintenance,
      scratch.pool,
      keys,
      { limit: 1, afterId },
    );
    expect(complete).toEqual({
      processed: 0,
      scanned: 0,
      afterId: null,
      passComplete: true,
    });

    const participant = await scratch.pool.query<{
      email_ciphertext: Buffer;
      email_index: Buffer;
      pii_key_id: string;
      blind_index_key_id: string;
    }>(
      'SELECT email_ciphertext, email_index, pii_key_id, blind_index_key_id FROM participants WHERE id = $1',
      [participantId],
    );
    expect(participant.rows[0]?.email_index).toEqual(
      createContactBlindIndex(keys, { kind: 'email', value: email }).value,
    );
    const plaintext = await protection.readParticipant(
      {
        teamId,
        studyId,
        participantId,
        column: 'email_ciphertext',
      },
      {
        envelope: participant.rows[0]!.email_ciphertext,
        keyId: participant.rows[0]!.pii_key_id,
        algorithm: 'aes-256-gcm.v1',
      },
    );
    expect(plaintext.toString()).toBe(email);
    plaintext.fill(0);
    expect(
      (
        await scratch.pool.query(
          `SELECT count(*)::int AS count FROM encryption_key_verifications
           WHERE purpose = 'pii-enc' AND key_id = 'v1'`,
        )
      ).rows,
    ).toEqual([{ count: 1 }]);

    const currentOnlyIndex = createContactBlindIndex(keys, {
      kind: 'email',
      value: currentOnlyEmail,
    });
    await maintenance.query(
      `INSERT INTO participant_contact_optouts
        (channel, blind_index_key_id, recipient_blind_index, source)
       VALUES ('email', $1, $2, 'provider')`,
      [currentOnlyIndex.keyId, currentOnlyIndex.value],
    );
    await expect(
      isContactSuppressed(maintenance, keys, {
        kind: 'email',
        value: email,
      }),
    ).resolves.toBe(true);
    await expect(
      isContactSuppressed(maintenance, keys, {
        kind: 'email',
        value: currentOnlyEmail,
      }),
    ).resolves.toBe(true);
    await expect(
      isContactSuppressed(maintenance, keys, {
        kind: 'email',
        value: 'not-suppressed@example.org',
      }),
    ).resolves.toBe(false);
    await expect(
      initializeEncryption({
        maintenancePool: maintenance,
        configuration: config,
        loadRootKey: async (reference) => {
          if (reference === 'TEST_ROOT_ONE') return rootOne;
          return Buffer.alloc(32, 93);
        },
      }),
    ).resolves.toBeDefined();
    expect(
      (
        await scratch.pool.query(
          `SELECT count(*)::int AS count FROM credential_audit_events
           WHERE action = 'migrate_legacy'`,
        )
      ).rows,
    ).toEqual([{ count: 3 }]);
    expect(
      (
        await scratch.pool.query(
          `SELECT count(*)::int AS count FROM audit_events
           WHERE event_type IN ('participant.pii.rotation_read', 'participant.pii.rotated')`,
        )
      ).rows,
    ).toEqual([{ count: 2 }]);
  } finally {
    await app.end();
    await maintenance.end();
    await scratch.dispose();
  }
});
