import { randomUUID } from 'node:crypto';

import type pg from 'pg';
import { describe, expect, it } from 'vitest';

import {
  createScratchSchema,
  provisionScratchSchema,
  reachableDb,
  seedTeam,
} from '../../__tests__/support/postgres.ts';
import {
  EncryptionStartupError,
  initializeCredentialMigration,
  initializeEncryption,
  resumeEncryptionMaintenance,
} from '../initialize.ts';
import type { KeysetConfiguration } from '../keys.ts';
import { configuration, rootOne } from './fixtures.ts';

const database = await reachableDb();

async function withDatabase(
  work: (
    scratch: Awaited<ReturnType<typeof createScratchSchema>>,
  ) => Promise<void>,
) {
  if (!database)
    throw new Error(
      'A local Postgres database is required for encryption integration tests.',
    );
  const scratch = await createScratchSchema(database);
  try {
    await provisionScratchSchema(scratch.pool);
    await work(scratch);
  } finally {
    await scratch.dispose();
  }
}

function input(
  maintenancePool: pg.Pool,
  config: KeysetConfiguration = configuration(),
) {
  return {
    maintenancePool,
    configuration: config,
    loadRootKey: async () => rootOne,
  };
}

describe('durable encryption startup verification', () => {
  it('registers non-PII key proofs once and verifies a subsequent startup', async () => {
    await withDatabase(async ({ pool, maintenance }) => {
      const first = await initializeEncryption(input(maintenance));
      expect(first.currentId('pii-enc')).toBe('v1');
      const before = await pool.query(
        'SELECT * FROM encryption_key_verifications ORDER BY purpose, key_id',
      );
      expect(before.rows).toHaveLength(8);
      expect(JSON.stringify(before.rows)).not.toContain(
        rootOne.toString('base64'),
      );
      await initializeEncryption(input(maintenance));
      const after = await pool.query(
        'SELECT * FROM encryption_key_verifications ORDER BY purpose, key_id',
      );
      expect(after.rows).toEqual(before.rows);
    });
  });

  it('refuses unregistered resume keys without registering or retiring any evidence', async () => {
    await withDatabase(async ({ pool, maintenance, app }) => {
      await expect(
        resumeEncryptionMaintenance(input(maintenance)),
      ).rejects.toThrow(EncryptionStartupError);
      expect(
        (await pool.query('SELECT * FROM encryption_key_verifications'))
          .rowCount,
      ).toBe(0);
      await initializeEncryption(input(maintenance));
      const before = (
        await pool.query(
          'SELECT * FROM encryption_key_verifications ORDER BY purpose, key_id',
        )
      ).rows;
      await expect(
        resumeEncryptionMaintenance(input(maintenance)),
      ).resolves.toBeDefined();
      await expect(resumeEncryptionMaintenance(input(app))).rejects.toThrow(
        EncryptionStartupError,
      );
      await expect(
        resumeEncryptionMaintenance({
          ...input(maintenance),
          loadRootKey: async () => Buffer.alloc(32, 199),
        }),
      ).rejects.toThrow(EncryptionStartupError);
      const addition = configuration();
      addition.pii.current = 'v3';
      addition.pii.keys.push({ id: 'v3', rootId: 'root-2' });
      await expect(
        resumeEncryptionMaintenance(input(maintenance, addition)),
      ).rejects.toThrow(EncryptionStartupError);
      const removal = configuration();
      removal.pii.current = 'v2';
      removal.pii.keys = removal.pii.keys.filter(({ id }) => id !== 'v1');
      await expect(
        resumeEncryptionMaintenance(input(maintenance, removal)),
      ).rejects.toThrow(EncryptionStartupError);
      expect(
        (
          await pool.query(
            'SELECT * FROM encryption_key_verifications ORDER BY purpose, key_id',
          )
        ).rows,
      ).toEqual(before);
    });
  });

  it('refuses a wrong root under the same known key IDs', async () => {
    await withDatabase(async ({ maintenance }) => {
      await initializeEncryption(input(maintenance));
      await expect(
        initializeEncryption({
          ...input(maintenance),
          loadRootKey: async () => Buffer.alloc(32, 199),
        }),
      ).rejects.toThrow(EncryptionStartupError);
    });
  });

  it('refuses a dropped historical key even with no live ciphertext left', async () => {
    await withDatabase(async ({ maintenance }) => {
      await initializeEncryption(input(maintenance));
      const config = configuration();
      config.pii.current = 'v2';
      config.pii.keys = config.pii.keys.filter(({ id }) => id !== 'v1');
      await expect(
        initializeEncryption(input(maintenance, config)),
      ).rejects.toThrow(EncryptionStartupError);
    });
  });

  it('registers a new current key without rewriting historical proof evidence', async () => {
    await withDatabase(async ({ pool, maintenance }) => {
      await initializeEncryption(input(maintenance));
      const config = configuration();
      config.pii.current = 'v3';
      config.pii.keys.push({ id: 'v3', rootId: 'root-2' });
      await initializeEncryption(input(maintenance, config));
      expect(
        (await pool.query('SELECT key_id FROM encryption_key_verifications'))
          .rows,
      ).toHaveLength(9);
    });
  });

  it.each(['configured-but-unverified', 'unknown'])(
    'refuses %s stored ciphertext IDs without blessing a new proof',
    async (keyId) => {
      await withDatabase(async ({ pool, maintenance }) => {
        const teamId = randomUUID();
        const protocolId = randomUUID();
        const studyId = randomUUID();
        await seedTeam(pool, teamId);
        await pool.query(
          'INSERT INTO protocols (id, team_id, name) VALUES ($1, $2, $3)',
          [protocolId, teamId, 'Synthetic protocol'],
        );
        await pool.query(
          'INSERT INTO studies (id, team_id, protocol_id, name) VALUES ($1, $2, $3, $4)',
          [studyId, teamId, protocolId, 'Synthetic study'],
        );
        await pool.query(
          `INSERT INTO participants (id, team_id, study_id, participant_code, name_ciphertext, pii_key_id, pii_algorithm) VALUES ($1, $2, $3, 'P-1', $4, $5, 'aes-256-gcm.v1')`,
          [randomUUID(), teamId, studyId, Buffer.alloc(32), keyId],
        );
        const config = configuration();
        config.pii.keys.push({
          id: 'configured-but-unverified',
          rootId: 'root-1',
        });
        await expect(
          initializeEncryption(input(maintenance, config)),
        ).rejects.toThrow(EncryptionStartupError);
        expect(
          (await pool.query('SELECT * FROM encryption_key_verifications')).rows,
        ).toHaveLength(0);
      });
    },
  );

  it('refuses legacy OAuth plaintext at boot while admitting only the offline migration initializer', async () => {
    await withDatabase(async ({ pool, maintenance }) => {
      const userId = randomUUID();
      await pool.query(
        'INSERT INTO "user" (id, name, email, "emailVerified") VALUES ($1, $2, $3, true)',
        [userId, 'Synthetic user', 'legacy@example.org'],
      );
      await pool.query(
        `INSERT INTO account (id, "accountId", "providerId", issuer, "userId", "accessToken", "updatedAt") VALUES ($1, 'external-id', 'google', 'https://accounts.google.com', $2, 'synthetic-legacy-token', now())`,
        [randomUUID(), userId],
      );
      await expect(initializeEncryption(input(maintenance))).rejects.toThrow(
        EncryptionStartupError,
      );
      await expect(
        initializeCredentialMigration(input(maintenance)),
      ).resolves.toBeDefined();
      await expect(initializeEncryption(input(maintenance))).rejects.toThrow(
        EncryptionStartupError,
      );
    });
  });

  it('refuses an application pool even when all tenant tables are empty', async () => {
    await withDatabase(async ({ app }) => {
      await expect(initializeEncryption(input(app))).rejects.toThrow(
        EncryptionStartupError,
      );
    });
  });

  it('makes proof and credential evidence immutable for runtime and owner identities', async () => {
    await withDatabase(async ({ pool, app, maintenance }) => {
      await initializeEncryption(input(maintenance));
      await app.query(
        `INSERT INTO credential_audit_events (id, user_id, account_id, action, outcome, request_id) VALUES ($1, 'user-id', 'account-id', 'read', 'succeeded', $2)`,
        [randomUUID(), randomUUID()],
      );
      for (const runtime of [app, maintenance]) {
        for (const table of [
          'encryption_key_verifications',
          'credential_audit_events',
        ]) {
          for (const statement of [
            `UPDATE ${table} SET ${table === 'encryption_key_verifications' ? 'key_id = key_id' : 'action = action'}`,
            `DELETE FROM ${table}`,
            `TRUNCATE ${table}`,
          ]) {
            await expect(runtime.query(statement)).rejects.toMatchObject({
              code: '42501',
            });
          }
        }
      }
      for (const table of [
        'encryption_key_verifications',
        'credential_audit_events',
      ]) {
        await expect(
          pool.query(
            `UPDATE ${table} SET ${table === 'encryption_key_verifications' ? 'key_id = key_id' : 'action = action'}`,
          ),
        ).rejects.toThrow('encryption evidence is immutable');
        await expect(pool.query(`DELETE FROM ${table}`)).rejects.toThrow(
          'encryption evidence is immutable',
        );
        await expect(pool.query(`TRUNCATE ${table}`)).rejects.toThrow(
          'encryption evidence is immutable',
        );
      }
      await expect(
        app.query('SELECT * FROM credential_audit_events'),
      ).rejects.toMatchObject({ code: '42501' });
    });
  });

  it('keeps suppression global while denying app enumeration', async () => {
    await withDatabase(async ({ app, maintenance }) => {
      const index = Buffer.alloc(32, 42);
      await maintenance.query(
        `INSERT INTO participant_contact_optouts (channel, blind_index_key_id, recipient_blind_index, source) VALUES ('email', 'index-1', $1, 'provider')`,
        [index],
      );
      await expect(
        maintenance.query(
          `INSERT INTO participant_contact_optouts (channel, blind_index_key_id, recipient_blind_index, source) VALUES ('email', 'index-1', $1, 'researcher')`,
          [index],
        ),
      ).rejects.toMatchObject({ code: '23505' });
      await expect(
        app.query('SELECT * FROM participant_contact_optouts'),
      ).rejects.toMatchObject({ code: '42501' });
      expect(
        (await maintenance.query('SELECT * FROM participant_contact_optouts'))
          .rows,
      ).toHaveLength(1);
    });
  });
});
