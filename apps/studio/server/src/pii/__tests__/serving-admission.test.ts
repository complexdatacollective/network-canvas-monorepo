import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import type pg from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { enrollMigrationTestDatabase } from '../../__tests__/support/migrations.ts';
import {
  createScratchDatabase,
  reachableDb,
  seedTeam,
} from '../../__tests__/support/postgres.ts';
import { SCHEMA_FINGERPRINT } from '../../db/fingerprint.generated.ts';
import { readMigrations } from '../../db/migrations/artifact.ts';
import { migrateDatabase } from '../../db/migrations/migrate.ts';
import { createMaintenancePool, createPool } from '../../db/pool.ts';
import { createReadiness } from '../../observability/readiness.ts';
import { initializeEncryption } from '../initialize.ts';
import {
  classifyLegacyContactIndexBatch,
  RAW_LEGACY_CONTACT_INDEX_ID,
} from '../legacy-indexes.ts';
import { initializeServingEncryption } from '../serving-admission.ts';
import { configuration, rootOne } from './fixtures.ts';

const database = await reachableDb();
const assetStore = {
  checkHealth: async () => {},
  get: async () => null,
  put: async () => {
    throw new Error('unused');
  },
};

type ProvisionedDatabase = Awaited<ReturnType<typeof createScratchDatabase>> & {
  app: pg.Pool;
  maintenance: pg.Pool;
};

async function createProvisionedDatabase(
  beforeLegacyGuardMigration?: (pool: pg.Pool) => Promise<void>,
): Promise<ProvisionedDatabase> {
  if (!database) throw new Error('A local PostgreSQL database is required.');
  const scratch = await createScratchDatabase(database);
  try {
    const allowedLogins = await enrollMigrationTestDatabase(
      scratch.pool,
      database,
    );
    const migrations = await readMigrations(
      fileURLToPath(new URL('../../../migrations', import.meta.url)),
    );
    if (beforeLegacyGuardMigration) {
      const legacyGuard = migrations.findIndex(
        ({ manifest }) => manifest.id === '0007_legacy_index_remediation_guard',
      );
      const prior = migrations.slice(0, legacyGuard);
      const priorFingerprint = prior.at(-1)?.manifest.fingerprint;
      if (legacyGuard < 1 || !priorFingerprint)
        throw new Error('Legacy guard migration boundary missing.');
      await migrateDatabase(
        scratch.pool,
        prior,
        priorFingerprint,
        allowedLogins,
      );
      await beforeLegacyGuardMigration(scratch.pool);
    }
    await migrateDatabase(
      scratch.pool,
      migrations,
      SCHEMA_FINGERPRINT,
      allowedLogins,
    );
    expect(
      (
        await scratch.pool.query(
          'SELECT count(*)::integer AS count FROM studio_migrations.history',
        )
      ).rows,
    ).toEqual([{ count: migrations.length }]);
    return {
      ...scratch,
      app: createPool(scratch.db),
      maintenance: createMaintenancePool(scratch.db),
    };
  } catch (error) {
    await scratch.dispose();
    throw error;
  }
}

async function disposeProvisionedDatabase(
  provisioned: ProvisionedDatabase | undefined,
): Promise<void> {
  if (!provisioned) return;
  await Promise.all([provisioned.app.end(), provisioned.maintenance.end()]);
  await provisioned.dispose();
}

async function initializeProofs(maintenancePool: pg.Pool, root = rootOne) {
  return initializeEncryption({
    maintenancePool,
    configuration: configuration(),
    loadRootKey: async () => root,
  });
}

describe.skipIf(!database)('serving encryption database admission', () => {
  let first: ProvisionedDatabase | undefined;
  let second: ProvisionedDatabase | undefined;

  afterEach(async () => {
    await Promise.all([
      disposeProvisionedDatabase(first),
      disposeProvisionedDatabase(second),
    ]);
    first = undefined;
    second = undefined;
  });

  it('keeps the admitted app and maintenance backends pinned through proof verification', async () => {
    first = await createProvisionedDatabase();
    second = await createProvisionedDatabase();
    const keys = await initializeProofs(first.maintenance);
    await initializeProofs(second.maintenance, Buffer.alloc(32, 201));
    expect((await first.app.query('SELECT current_user AS role')).rows).toEqual(
      [{ role: 'studio_app' }],
    );
    expect(
      (await first.maintenance.query('SELECT current_user AS role')).rows,
    ).toEqual([{ role: 'studio_maintenance' }]);
    const firstMaintenanceClient = await first.maintenance.connect();
    const secondMaintenanceClient = await second.maintenance.connect();
    const connect = vi
      .spyOn(first.maintenance, 'connect')
      .mockImplementationOnce(async () => firstMaintenanceClient)
      // If serving admission releases and re-checks out maintenance before
      // proof verification commits, this real client reaches another database.
      .mockImplementationOnce(async () => secondMaintenanceClient);
    try {
      await expect(
        initializeServingEncryption({
          pool: first.app,
          maintenancePool: first.maintenance,
          configuration: configuration(),
          loadRootKey: async () => rootOne,
          allowUnversioned: true,
        }),
      ).resolves.toEqual(keys);
      expect(connect).toHaveBeenCalledTimes(1);
      expect(
        (
          await first.pool.query(
            'SELECT count(*)::integer AS count FROM encryption_key_verifications',
          )
        ).rows,
      ).toEqual([{ count: 8 }]);
    } finally {
      connect.mockRestore();
      secondMaintenanceClient.release();
    }
  });

  it('rejects a real app and maintenance pair from different databases', async () => {
    first = await createProvisionedDatabase();
    second = await createProvisionedDatabase();
    await initializeProofs(first.maintenance);
    await initializeProofs(second.maintenance, Buffer.alloc(32, 202));

    await expect(
      initializeServingEncryption({
        pool: first.app,
        maintenancePool: second.maintenance,
        configuration: configuration(),
        loadRootKey: async () => rootOne,
        allowUnversioned: true,
      }),
    ).rejects.toThrow('Studio database runtime admission failed.');
  });

  it('makes readiness reject restored or unproven database keys without registering proofs', async () => {
    first = await createProvisionedDatabase();
    second = await createProvisionedDatabase();
    const keys = await initializeProofs(first.maintenance);
    await initializeProofs(second.maintenance, Buffer.alloc(32, 203));

    const healthy = createReadiness({
      pool: first.app,
      maintenancePool: first.maintenance,
      encryptionKeys: keys,
      allowUnversionedSchema: true,
      assetStore,
      cacheMs: 0,
    });
    const restored = createReadiness({
      pool: second.app,
      maintenancePool: second.maintenance,
      encryptionKeys: keys,
      allowUnversionedSchema: true,
      assetStore,
      cacheMs: 0,
    });
    try {
      expect(await healthy.check()).toMatchObject({ status: 'ready' });
      expect(await restored.check()).toMatchObject({
        status: 'not_ready',
        checks: { database: 'failed' },
      });
    } finally {
      healthy.stop();
      restored.stop();
    }

    const unproven = await createProvisionedDatabase();
    try {
      const readiness = createReadiness({
        pool: unproven.app,
        maintenancePool: unproven.maintenance,
        encryptionKeys: keys,
        allowUnversionedSchema: true,
        assetStore,
        cacheMs: 0,
      });
      try {
        expect(await readiness.check()).toMatchObject({
          status: 'not_ready',
          checks: { database: 'failed' },
        });
      } finally {
        readiness.stop();
      }
      expect(
        (
          await unproven.pool.query(
            'SELECT count(*)::integer AS count FROM encryption_key_verifications',
          )
        ).rows,
      ).toEqual([{ count: 0 }]);
    } finally {
      await disposeProvisionedDatabase(unproven);
    }
  });

  it('keeps recurring readiness proof-bounded while the database rejects new unverified key references', async () => {
    first = await createProvisionedDatabase();
    const keys = await initializeProofs(first.maintenance);
    const teamId = randomUUID();
    const protocolId = randomUUID();
    const studyId = randomUUID();
    await seedTeam(first.pool, teamId);
    await first.pool.query(
      'INSERT INTO protocols (id, team_id, name) VALUES ($1, $2, $3)',
      [protocolId, teamId, 'Reference guard protocol'],
    );
    await first.pool.query(
      'INSERT INTO studies (id, team_id, protocol_id, name) VALUES ($1, $2, $3, $4)',
      [studyId, teamId, protocolId, 'Reference guard study'],
    );
    const guardedWrites: ReadonlyArray<
      readonly [string, () => Promise<unknown>]
    > = [
      [
        'participant encryption',
        () =>
          first!.pool.query(
            `INSERT INTO participants
              (id, team_id, study_id, participant_code, name_ciphertext, pii_key_id, pii_algorithm)
             VALUES ($1, $2, $3, 'guarded-pii', $4, 'not-proved', 'aes-256-gcm.v1')`,
            [randomUUID(), teamId, studyId, Buffer.alloc(32, 73)],
          ),
      ],
      [
        'participant index',
        () =>
          first!.pool.query(
            `INSERT INTO participants
              (id, team_id, study_id, participant_code, email_ciphertext, email_index, blind_index_key_id, pii_key_id, pii_algorithm)
             VALUES ($1, $2, $3, 'guarded-index', $4, $5, 'not-proved', 'v1', 'aes-256-gcm.v1')`,
            [
              randomUUID(),
              teamId,
              studyId,
              Buffer.alloc(32, 74),
              Buffer.alloc(32, 75),
            ],
          ),
      ],
      [
        'delivery index',
        () =>
          first!.pool.query(
            `INSERT INTO message_deliveries
              (id, team_id, study_id, participant_id, template_id, kind, channel,
               recipient_blind_index, blind_index_key_id, rendered_body_hash)
             VALUES ($1, $2, $3, $4, $5, 'reminder', 'email', $6, 'not-proved', $7)`,
            [
              randomUUID(),
              teamId,
              studyId,
              randomUUID(),
              randomUUID(),
              Buffer.alloc(32, 76),
              'a'.repeat(64),
            ],
          ),
      ],
      [
        'suppression index',
        () =>
          first!.pool.query(
            `INSERT INTO participant_contact_optouts
              (channel, recipient_blind_index, blind_index_key_id, source)
             VALUES ('email', $1, 'not-proved', 'provider')`,
            [Buffer.alloc(32, 77)],
          ),
      ],
      [
        'webhook encryption',
        () =>
          first!.pool.query(
            `INSERT INTO webhook_subscriptions
              (id, team_id, url, event_types, secret_ciphertext, secret_key_id,
               secret_algorithm, created_by_user_id)
             VALUES ($1, $2, 'https://hooks.example.test/studio',
               ARRAY['interview.completed'], $3, 'not-proved', 'aes-256-gcm.v1', 'operator')`,
            [randomUUID(), teamId, Buffer.alloc(32, 78)],
          ),
      ],
      [
        'OAuth encryption',
        () =>
          first!.pool.query(
            `INSERT INTO account
              (id, "accountId", "providerId", issuer, "userId",
               access_token_ciphertext, access_token_key_id,
               access_token_algorithm, "updatedAt")
             VALUES ($1, 'external', 'google', 'https://accounts.google.com',
               'missing-user', $2, 'not-proved', 'aes-256-gcm.v1', now())`,
            [randomUUID(), Buffer.alloc(32, 79)],
          ),
      ],
    ];
    for (const [domain, write] of guardedWrites)
      await expect(write(), domain).rejects.toThrow(
        'encrypted data may reference only a verified key',
      );

    const maintenance = await first.maintenance.connect();
    const queries = vi.spyOn(maintenance, 'query');
    const connect = vi
      .spyOn(first.maintenance, 'connect')
      .mockImplementationOnce(async () => maintenance);
    const readiness = createReadiness({
      maintenancePool: first.maintenance,
      encryptionKeys: keys,
      allowUnversionedSchema: true,
      assetStore,
      cacheMs: 0,
    });
    try {
      expect(await readiness.check()).toMatchObject({ status: 'ready' });
      const sql = queries.mock.calls
        .map(([statement]) => (typeof statement === 'string' ? statement : ''))
        .join('\n');
      expect(sql).toContain('FROM encryption_key_verifications');
      expect(sql).not.toContain("SELECT DISTINCT 'pii-enc'");
      expect(sql).not.toContain('legacy_tokens_present');
      expect(sql).not.toContain('Legacy blind-index remediation');
    } finally {
      readiness.stop();
      connect.mockRestore();
      queries.mockRestore();
    }
  });

  it('accepts classified legacy suppression only after the exhaustive startup gate', async () => {
    const insertLegacyOptOut = (pool: pg.Pool) =>
      pool
        .query(
          `INSERT INTO participant_contact_optouts
          (channel, blind_index_key_id, recipient_blind_index, source)
         VALUES ('email', $1, $2, 'researcher')`,
          [RAW_LEGACY_CONTACT_INDEX_ID, Buffer.alloc(32, 41)],
        )
        .then(() => undefined);
    first = await createProvisionedDatabase(insertLegacyOptOut);
    second = await createProvisionedDatabase(insertLegacyOptOut);
    await expect(
      classifyLegacyContactIndexBatch(first.pool, 100),
    ).resolves.toEqual({ processed: 1, passComplete: true });
    const keys = await initializeProofs(first.maintenance);
    await expect(initializeProofs(second.maintenance)).rejects.toThrow();
    const proofCount = async (provisioned: ProvisionedDatabase) =>
      (
        await provisioned.pool.query<{ count: number }>(
          'SELECT count(*)::integer AS count FROM encryption_key_verifications',
        )
      ).rows[0]?.count;
    const firstBefore = await proofCount(first);
    const classifiedReadiness = createReadiness({
      pool: first.app,
      maintenancePool: first.maintenance,
      encryptionKeys: keys,
      allowUnversionedSchema: true,
      assetStore,
      cacheMs: 0,
    });
    try {
      expect(await classifiedReadiness.check()).toMatchObject({
        status: 'ready',
      });
      expect(await proofCount(first)).toBe(firstBefore);
      expect(await proofCount(second)).toBe(0);
    } finally {
      classifiedReadiness.stop();
    }
  });
});
