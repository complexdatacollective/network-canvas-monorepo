import type pg from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createScratchDatabase,
  provisionScratchSchema,
  reachableDb,
} from '../../__tests__/support/postgres.ts';
import { createMaintenancePool, createPool } from '../../db/pool.ts';
import { createReadiness } from '../../observability/readiness.ts';
import { initializeEncryption } from '../initialize.ts';
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
    await provisionScratchSchema(scratch.pool);
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
});
