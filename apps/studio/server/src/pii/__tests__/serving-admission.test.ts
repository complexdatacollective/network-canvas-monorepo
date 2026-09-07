import { fileURLToPath } from 'node:url';

import type pg from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';

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
import { initializeEncryption } from '../initialize.ts';
import {
  CLASSIFIED_LEGACY_CONTACT_INDEX_ID,
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

async function createProvisionedDatabase(): Promise<ProvisionedDatabase> {
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

  it('accepts only classified legacy suppression in a read-only readiness transaction', async () => {
    first = await createProvisionedDatabase();
    const keys = await initializeProofs(first.maintenance);
    await first.pool.query(
      `INSERT INTO participant_contact_optouts
        (channel, blind_index_key_id, recipient_blind_index, source)
       VALUES ('email', $1, $2, 'researcher')`,
      [CLASSIFIED_LEGACY_CONTACT_INDEX_ID, Buffer.alloc(32, 41)],
    );
    const proofCount = async () =>
      (
        await first!.pool.query<{ count: number }>(
          'SELECT count(*)::integer AS count FROM encryption_key_verifications',
        )
      ).rows[0]?.count;
    const before = await proofCount();
    const readiness = createReadiness({
      pool: first.app,
      maintenancePool: first.maintenance,
      encryptionKeys: keys,
      allowUnversionedSchema: true,
      assetStore,
      cacheMs: 0,
    });
    try {
      expect(await readiness.check()).toMatchObject({ status: 'ready' });
      expect(await proofCount()).toBe(before);
      await first.pool.query(
        `INSERT INTO participant_contact_optouts
          (channel, blind_index_key_id, recipient_blind_index, source)
         VALUES ('email', $1, $2, 'researcher')`,
        [RAW_LEGACY_CONTACT_INDEX_ID, Buffer.alloc(32, 42)],
      );
      expect(await readiness.check()).toMatchObject({
        status: 'not_ready',
        checks: { database: 'failed' },
      });
      expect(await proofCount()).toBe(before);
    } finally {
      readiness.stop();
    }
  });
});
