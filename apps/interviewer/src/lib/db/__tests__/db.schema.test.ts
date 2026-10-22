// fake-indexeddb must be imported before Dexie opens a database.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  FROZEN_ROWS,
  fingerprintDatabase,
  openAsInterviewer8,
  readRawRows,
  seedAsInterviewer8,
} from '~/testUtils/interviewer8Database';

import { db, getSettings, markDatabaseSecured } from '../db';
import { DB_NAME } from '../storageNames';

// The stores and indexes Interviewer 8 declares (its version 3, on main), as
// an independent copy: Interviewer 8 at /v8/ reads and writes every one of
// them, so this app must keep each, under the same key path, with at least
// these indexes. A store or index dropped from db.ts fails here.
const INTERVIEWER_8_SCHEMA: Record<
  string,
  { keyPath: string; indexes: string[] }
> = {
  assets: { keyPath: 'id', indexes: ['assetId', 'protocolHash'] },
  protocolMigrations: { keyPath: 'previousHash', indexes: [] },
  protocols: { keyPath: 'id', indexes: ['hash', 'importedAt', 'name'] },
  sessions: {
    keyPath: 'id',
    indexes: [
      'caseId',
      'exportedAt',
      'finishedAt',
      'isSynthetic',
      'lastUpdatedAt',
      'protocolHash',
      'startedAt',
    ],
  },
  settings: { keyPath: 'id', indexes: [] },
};

/** Interviewer 8's version 3, in Dexie's native numbering. */
const INTERVIEWER_8_NATIVE_VERSION = 30;

function installedSchema(idb: IDBDatabase) {
  const stores = Array.from(idb.objectStoreNames);
  const transaction = idb.transaction(stores, 'readonly');
  return Object.fromEntries(
    stores.map((name) => {
      const store = transaction.objectStore(name);
      return [
        name,
        {
          keyPath: String(store.keyPath),
          indexes: Array.from(store.indexNames).toSorted(),
        },
      ];
    }),
  );
}

const expectInterviewer8Schema = (idb: IDBDatabase) => {
  const installed = installedSchema(idb);
  for (const [name, expected] of Object.entries(INTERVIEWER_8_SCHEMA)) {
    expect(installed[name]?.keyPath).toBe(expected.keyPath);
    expect(installed[name]?.indexes).toEqual(
      expect.arrayContaining(expected.indexes),
    );
  }
};

const resetDatabase = async () => {
  db.close();
  await db.delete({ disableAutoOpen: false });
};

beforeEach(resetDatabase);
afterEach(resetDatabase);

describe('the shared interviewer database', () => {
  it("is Interviewer 8's database, at a version above Interviewer 8's", async () => {
    await db.open();
    const idb = db.backendDB();

    expect(idb.name).toBe('interviewer');
    expect(DB_NAME).toBe('interviewer');
    expect(idb.version).toBeGreaterThan(INTERVIEWER_8_NATIVE_VERSION);
    expectInterviewer8Schema(idb);
  });

  it('is the only database this app makes', async () => {
    await db.open();
    await markDatabaseSecured();

    const names = (await indexedDB.databases()).map(({ name }) => name);
    expect(names).toEqual(['interviewer']);
  });

  it('upgrades an 8.x device in place, keeping every row and its settings', async () => {
    await seedAsInterviewer8({
      protocols: [FROZEN_ROWS.protocol],
      sessions: [FROZEN_ROWS.session],
      assets: [FROZEN_ROWS.apiKeyAsset, FROZEN_ROWS.imageAsset],
      settings: [
        {
          id: 'device',
          idleTimeoutMinutes: 5,
          requireUnlockOnEnter: false,
          requireUnlockOnExit: true,
          exportCSV: false,
        },
      ],
    });
    const tables = ['protocols', 'sessions', 'assets', 'settings'];
    const before = await Promise.all(tables.map(readRawRows));

    await db.open();
    const idb = db.backendDB();
    expect(idb.version).toBeGreaterThan(INTERVIEWER_8_NATIVE_VERSION);
    expectInterviewer8Schema(idb);
    db.close();

    expect(await Promise.all(tables.map(readRawRows))).toEqual(before);

    // The row Interviewer 8 wrote is this app's settings row.
    await db.open();
    expect(await getSettings()).toMatchObject({
      id: 'device',
      idleTimeoutMinutes: 5,
      requireUnlockOnEnter: false,
      requireUnlockOnExit: true,
      exportCSV: false,
    });
  });

  it('still opens in Interviewer 8 after this app has upgraded it, beside this app', async () => {
    await seedAsInterviewer8({ sessions: [FROZEN_ROWS.session] });
    await db.open();
    const upgradedVersion = db.backendDB().version;

    // Interviewer 8 declares only its own version 3. Dexie opens a database
    // installed at a higher version at that version rather than refusing it,
    // and nothing is upgraded or downgraded.
    const interviewer8 = openAsInterviewer8();
    await interviewer8.open();
    try {
      expect(interviewer8.backendDB().version).toBe(upgradedVersion);
      expect(
        await interviewer8.table('sessions').get('frozen-session'),
      ).toEqual(FROZEN_ROWS.session);
      // What Interviewer 8 at /v8/ writes: its interview's session row.
      await interviewer8.table('sessions').put({
        ...FROZEN_ROWS.session,
        currentStep: 2,
        lastUpdatedAt: '2026-01-05T11:00:00.000Z',
      });
      // Its index queries still work on the shared stores.
      expect(
        await interviewer8
          .table('sessions')
          .where('protocolHash')
          .equals('frozen-hash')
          .count(),
      ).toBe(1);
    } finally {
      interviewer8.close();
    }

    // This app's connection stayed open, and sees the write.
    expect(db.isOpen()).toBe(true);
    expect((await db.sessions.get('frozen-session'))?.currentStep).toBe(2);
    db.close();
    expect(
      JSON.parse((await fingerprintDatabase(DB_NAME)) ?? '{}'),
    ).toMatchObject({ version: upgradedVersion });
  });
});
