import { createRequire } from 'node:module';

import type { Page } from '@playwright/test';

import { DB_NAME } from '../../src/lib/db/storageNames.js';

// The one database, `interviewer`, as an 8.x device has it. Interviewer 8
// (served at /v8/) and this app share it: Interviewer 9 upgrades it in place
// above Interviewer 8's version 3. These helpers seed it for real, on a blank
// same-origin page before any app code has run, by injecting Dexie's own UMD
// bundle and declaring the schema history Interviewer 8 shipped (Dexie's
// native layout: version 3 is IndexedDB version 30), and read it back through
// the raw API so a spec can compare it byte for byte.

const DEXIE_UMD_PATH = createRequire(import.meta.url).resolve('dexie');

/** Interviewer 8's version 3, in IndexedDB's numbering. */
export const INTERVIEWER_8_NATIVE_VERSION = 30;

/** A row of Interviewer 8's `assets` table; `bytes` become its Blob. */
export type Interviewer8SeedAsset = {
  id: string;
  protocolHash: string;
  assetId: string;
  name: string;
  type: string;
  mimeType: string;
  bytes: number[];
};

export type Interviewer8Seed = {
  protocols?: Record<string, unknown>[];
  sessions?: Record<string, unknown>[];
  assets?: Interviewer8SeedAsset[];
  settings?: Record<string, unknown>[];
};

export type DatabaseDump = {
  version: number;
  stores: Record<
    string,
    { keyPath: unknown; indexes: string[]; rows: unknown[] }
  >;
};

// Seeds the database as Interviewer 8 would have, on a blank same-origin page.
// Must run before the app has ever been navigated to in this context.
export async function seedAsInterviewer8(
  page: Page,
  seed: Interviewer8Seed,
): Promise<void> {
  await page.route('**/__interviewer8-seed__', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>Interviewer 8 seed</title>',
    }),
  );
  await page.goto('/__interviewer8-seed__');
  await page.addScriptTag({ path: DEXIE_UMD_PATH });

  await page.evaluate(
    async ({ name, nativeVersion, seed: rows }) => {
      type Interviewer8Dexie = {
        version(no: number): { stores(schema: Record<string, string>): void };
        open(): Promise<unknown>;
        close(): void;
        backendDB(): IDBDatabase;
        table(table: string): { put(row: unknown): Promise<unknown> };
      };
      const DexieCtor = (
        window as { Dexie?: new (dbName: string) => Interviewer8Dexie }
      ).Dexie;
      if (!DexieCtor) throw new Error('Dexie UMD bundle was not injected');

      const interviewer8 = new DexieCtor(name);
      // Frozen copy of Interviewer 8's released schema history. Never update
      // it to track this app's db.ts.
      interviewer8.version(1).stores({
        protocols: 'id, hash, name, importedAt',
        sessions:
          'id, protocolHash, caseId, startedAt, lastUpdatedAt, finishedAt, exportedAt',
        assets: 'id, protocolHash, assetId',
        settings: 'id',
      });
      interviewer8.version(2).stores({
        sessions:
          'id, protocolHash, caseId, startedAt, lastUpdatedAt, finishedAt, exportedAt, isSynthetic',
      });
      interviewer8.version(3).stores({ protocolMigrations: 'previousHash' });
      await interviewer8.open();
      if (interviewer8.backendDB().version !== nativeVersion) {
        throw new Error('expected Interviewer 8’s database at native 30');
      }
      for (const row of rows.protocols ?? []) {
        await interviewer8.table('protocols').put(row);
      }
      for (const row of rows.sessions ?? []) {
        await interviewer8.table('sessions').put(row);
      }
      for (const { bytes, mimeType, ...row } of rows.assets ?? []) {
        await interviewer8.table('assets').put({
          ...row,
          data: new Blob([new Uint8Array(bytes)], { type: mimeType }),
        });
      }
      for (const row of rows.settings ?? []) {
        await interviewer8.table('settings').put(row);
      }
      interviewer8.close();
    },
    { name: DB_NAME, nativeVersion: INTERVIEWER_8_NATIVE_VERSION, seed },
  );
}

/** Everything in the database through the raw API; null when it is absent. */
export function dumpDatabase(page: Page): Promise<DatabaseDump | null> {
  return page.evaluate(async (dbName) => {
    const listed = await indexedDB.databases();
    if (!listed.some((database) => database.name === dbName)) return null;
    // A database deleted since it was listed would be created afresh by this
    // open: abort that creation, so reading never makes a database.
    const idb = await new Promise<IDBDatabase | null>((resolve, reject) => {
      const request = indexedDB.open(dbName);
      let creating = false;
      request.onupgradeneeded = () => {
        creating = true;
        request.transaction?.abort();
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        creating
          ? resolve(null)
          : reject(request.error ?? new Error('open failed'));
    });
    if (!idb) return null;
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
  }, DB_NAME);
}
