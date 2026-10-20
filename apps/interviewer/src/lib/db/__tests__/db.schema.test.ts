// fake-indexeddb must be imported before Dexie opens a database.
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';

import { db, markDatabaseSecured } from '../db';

// Interviewer 9's database is new: Interviewer 8 keeps `interviewer`, and
// nothing of its version history applies here. These literals are an
// independent copy of what the app must install; a store or index dropped
// from db.ts would leave the repos throwing SchemaError, so the full set is
// pinned rather than only the store names.
const EXPECTED_INSTALLED_SCHEMA: Record<
  string,
  { keyPath: string; indexes: string[] }
> = {
  assets: { keyPath: 'id', indexes: ['assetId', 'protocolHash'] },
  legacyUpgrades: { keyPath: 'legacyHash', indexes: [] },
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

afterEach(async () => {
  db.close();
  await db.delete({ disableAutoOpen: false });
});

describe('the interviewer-v9 database', () => {
  it('opens as a fresh version 1 with exactly the stores this app uses', async () => {
    await db.open();
    const idb = db.backendDB();

    expect(idb.name).toBe('interviewer-v9');
    // Dexie maps declared version 1 to native version 10.
    expect(idb.version).toBe(10);
    expect(installedSchema(idb)).toEqual(EXPECTED_INSTALLED_SCHEMA);
  });

  it('has no protocolMigrations store: nothing here is ever migrated in place', async () => {
    await db.open();
    expect(Array.from(db.backendDB().objectStoreNames)).not.toContain(
      'protocolMigrations',
    );
  });

  it('never creates Interviewer 8’s database', async () => {
    await db.open();
    await markDatabaseSecured();

    const names = (await indexedDB.databases()).map(({ name }) => name);
    expect(names).toContain('interviewer-v9');
    expect(names).not.toContain('interviewer');
  });

  it('records an upgraded schema 8 protocol by its hash', async () => {
    const record = {
      legacyHash: 'schema-8-hash',
      upgradedHash: 'schema-9-hash',
      legacyImportedAt: '2026-10-18T00:00:00.000Z',
      upgradedAt: '2026-10-19T00:00:00.000Z',
    };
    await db.legacyUpgrades.put(record);
    expect(await db.legacyUpgrades.get('schema-8-hash')).toEqual(record);
  });
});
