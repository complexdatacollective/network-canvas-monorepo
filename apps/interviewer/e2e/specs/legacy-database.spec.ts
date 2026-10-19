import { createRequire } from 'node:module';

import type { Page } from '@playwright/test';

import { DB_NAME } from '../../src/lib/db/storageNames.js';
import { expect, test } from '../fixtures/test.js';

// Interviewer 8's database, `interviewer`, belongs to Interviewer 8 (served at
// /v8/). Booting Interviewer 9 beside it must leave it byte for byte as it
// was, keep Interviewer 9's data in a database of its own, and carry the
// device's settings over once. These tests seed that database for real, on a
// blank same-origin page before any app code has run, by injecting Dexie's
// own UMD bundle and declaring the schema history Interviewer 8 shipped.
//
// The unit-level counterparts are src/lib/db/__tests__/legacyLibrary.test.ts,
// settingsCarryOver.test.ts and db.schema.test.ts; this spec covers what
// jsdom cannot: the full boot path in a real browser, including plaintext Blob
// assets, which jsdom's fake-indexeddb cannot round-trip.
const DEXIE_UMD_PATH = createRequire(import.meta.url).resolve('dexie');

const LEGACY_DB_NAME = 'interviewer';
const LEGACY_HASH = 'legacy-e2e-protocol-hash';
const PNG_BYTES = [137, 80, 78, 71, 13, 10, 26, 10];

const LEGACY_SEED = {
  protocol: {
    id: LEGACY_HASH,
    hash: LEGACY_HASH,
    name: 'Legacy Study',
    schemaVersion: 8,
    importedAt: '2026-01-01T00:00:00.000Z',
    codebook: { node: {}, edge: {}, ego: {} },
    protocol: {
      schemaVersion: 8,
      codebook: { node: {}, edge: {}, ego: {} },
      stages: [],
    },
  },
  session: {
    id: 'legacy-session',
    protocolHash: LEGACY_HASH,
    protocolName: 'Legacy Study',
    caseId: 'legacy-case',
    startedAt: '2026-01-07T10:00:00.000Z',
    lastUpdatedAt: '2026-01-07T10:30:00.000Z',
    finishedAt: null,
    exportedAt: null,
    currentStep: 0,
    network: { ego: { _uid: 'ego', attributes: {} }, nodes: [], edges: [] },
  },
  imageAsset: {
    id: `${LEGACY_HASH}::legacy-image`,
    protocolHash: LEGACY_HASH,
    assetId: 'legacy-image',
    name: 'Background',
    type: 'image',
  },
  settings: {
    id: 'device',
    exportGraphML: false,
    idleTimeoutMinutes: 30,
    sampleProtocolDismissed: true,
  },
};

type DatabaseDump = {
  version: number;
  stores: Record<
    string,
    { keyPath: unknown; indexes: string[]; rows: unknown[] }
  >;
};

// Seeds the legacy database on a blank same-origin page. Must run before the
// app has ever been navigated to in this context.
async function seedLegacyDatabase(page: Page): Promise<void> {
  await page.route('**/__legacy-seed__', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>legacy seed</title>',
    }),
  );
  await page.goto('/__legacy-seed__');
  await page.addScriptTag({ path: DEXIE_UMD_PATH });

  await page.evaluate(
    async ({ name, seed, pngBytes }) => {
      type LegacyDexie = {
        version(no: number): { stores(schema: Record<string, string>): void };
        open(): Promise<unknown>;
        close(): void;
        backendDB(): IDBDatabase;
        table(table: string): { put(row: unknown): Promise<unknown> };
      };
      const DexieCtor = (
        window as { Dexie?: new (dbName: string) => LegacyDexie }
      ).Dexie;
      if (!DexieCtor) throw new Error('Dexie UMD bundle was not injected');

      const legacy = new DexieCtor(name);
      // Frozen copy of Interviewer 8's released schema history. Never update
      // it to track this app's db.ts.
      legacy.version(1).stores({
        protocols: 'id, hash, name, importedAt',
        sessions:
          'id, protocolHash, caseId, startedAt, lastUpdatedAt, finishedAt, exportedAt',
        assets: 'id, protocolHash, assetId',
        settings: 'id',
      });
      legacy.version(2).stores({
        sessions:
          'id, protocolHash, caseId, startedAt, lastUpdatedAt, finishedAt, exportedAt, isSynthetic',
      });
      legacy.version(3).stores({ protocolMigrations: 'previousHash' });
      await legacy.open();
      if (legacy.backendDB().version !== 30) {
        throw new Error('expected Interviewer 8’s database at native 30');
      }
      await legacy.table('protocols').put(seed.protocol);
      await legacy.table('sessions').put(seed.session);
      await legacy.table('assets').put({
        ...seed.imageAsset,
        data: new Blob([new Uint8Array(pngBytes)], { type: 'image/png' }),
      });
      await legacy.table('settings').put(seed.settings);
      legacy.close();
    },
    { name: LEGACY_DB_NAME, seed: LEGACY_SEED, pngBytes: PNG_BYTES },
  );
}

/** Everything in a database through the raw API; null when it is absent. */
function dumpDatabase(page: Page, name: string): Promise<DatabaseDump | null> {
  return page.evaluate(async (dbName) => {
    const listed = await indexedDB.databases();
    if (!listed.some((database) => database.name === dbName)) return null;
    const idb = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(dbName);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('open failed'));
    });
    const serialise = async (value: unknown): Promise<unknown> => {
      if (value instanceof Blob) {
        return {
          blob: value.type,
          bytes: Array.from(new Uint8Array(await value.arrayBuffer())),
        };
      }
      if (Array.isArray(value)) return Promise.all(value.map(serialise));
      if (typeof value === 'object' && value !== null) {
        const entries = await Promise.all(
          Object.entries(value).map(
            async ([key, inner]) => [key, await serialise(inner)] as const,
          ),
        );
        return Object.fromEntries(entries);
      }
      return value;
    };
    try {
      const stores: DatabaseDump['stores'] = {};
      for (const storeName of Array.from(idb.objectStoreNames).toSorted()) {
        const store = idb
          .transaction(storeName, 'readonly')
          .objectStore(storeName);
        const rows = await new Promise<unknown[]>((resolve, reject) => {
          const request = store.getAll();
          request.onsuccess = () => resolve(request.result as unknown[]);
          request.onerror = () =>
            reject(request.error ?? new Error('getAll failed'));
        });
        stores[storeName] = {
          keyPath: store.keyPath,
          indexes: Array.from(store.indexNames).toSorted(),
          rows: (await serialise(rows)) as unknown[],
        };
      }
      return { version: idb.version, stores };
    } finally {
      idb.close();
    }
  }, name);
}

test.describe('booting beside Interviewer 8’s database', () => {
  test('leaves it untouched, keeps its own database and carries the settings over', async ({
    page,
  }) => {
    await seedLegacyDatabase(page);
    const before = await dumpDatabase(page, LEGACY_DB_NAME);
    expect(before?.version).toBe(30);

    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: 'Sample Protocol' }),
    ).toBeVisible();

    // Interviewer 9's own database, at its own first version.
    await expect
      .poll(async () => (await dumpDatabase(page, DB_NAME))?.stores.settings)
      .toBeDefined();
    const own = await dumpDatabase(page, DB_NAME);
    expect(own?.version).toBe(10);
    expect(Object.keys(own?.stores ?? {})).toEqual([
      'assets',
      'legacyUpgrades',
      'protocols',
      'sessions',
      'settings',
    ]);
    // None of Interviewer 8's protocols or interviews were copied in.
    expect(own?.stores.sessions?.rows).toEqual([]);
    expect(
      own?.stores.protocols?.rows.some(
        (row) => (row as { hash?: string }).hash === LEGACY_HASH,
      ),
    ).toBe(false);

    // The device's preferences came across; what names Interviewer 8's own
    // library did not (the sample card above is this app's own).
    const settings = own?.stores.settings?.rows.find(
      (row) => (row as { id?: string }).id === 'device',
    );
    expect(settings).toMatchObject({
      exportGraphML: false,
      idleTimeoutMinutes: 30,
      sampleProtocolDismissed: false,
    });

    // Byte for byte as it was, Blob included.
    expect(await dumpDatabase(page, LEGACY_DB_NAME)).toEqual(before);
  });

  test('creates no Interviewer 8 database on a device that never had one', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: 'Sample Protocol' }),
    ).toBeVisible();
    expect(await dumpDatabase(page, LEGACY_DB_NAME)).toBeNull();
  });
});
