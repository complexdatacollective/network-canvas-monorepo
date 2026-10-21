// fake-indexeddb must be installed before Dexie opens a database.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import { APP_SCHEMA_VERSION } from '~/config';

import { assetDb, clearAllStorage } from '../assetDB';
import { LEGACY_LIBRARIES } from '../storageNames';

const LEGACY_DB_NAME = LEGACY_LIBRARIES[0].dbName;

const request = <T>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

// Architect 8's library, laid out as its Dexie lays it out.
const seedArchitect8Library = async () => {
  const open = indexedDB.open(LEGACY_DB_NAME, 10);
  open.onupgradeneeded = () => {
    open.result
      .createObjectStore('protocols', { keyPath: 'id' })
      .createIndex('updatedAt', 'updatedAt');
    open.result
      .createObjectStore('assets', { keyPath: 'id' })
      .createIndex('protocolId', 'protocolId');
  };
  const db = await request(open);
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction('protocols', 'readwrite');
    transaction
      .objectStore('protocols')
      .put({ id: 'v8-row', name: 'Schema 8 study', schemaVersion: 8 });
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
};

const readArchitect8Rows = async () => {
  const db = await request(indexedDB.open(LEGACY_DB_NAME));
  try {
    return await request(
      db.transaction('protocols').objectStore('protocols').getAll(),
    );
  } finally {
    db.close();
  }
};

const protocol: CurrentProtocol = {
  name: 'Study',
  schemaVersion: APP_SCHEMA_VERSION,
  localization: { defaultLocale: 'en', locales: ['en'] },
  stages: [],
  codebook: {},
};

const reload = vi.fn();
const originalLocation = window.location;

beforeEach(async () => {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...originalLocation, reload },
  });
  reload.mockReset();
  await assetDb.protocols.put({
    id: 'v9-row',
    name: 'Study',
    schemaVersion: APP_SCHEMA_VERSION,
    protocol,
    createdAt: 0,
    updatedAt: 0,
  });
  await assetDb.assets.put({
    id: 'v9-row::a1',
    assetId: 'a1',
    protocolId: 'v9-row',
    name: 'a1.png',
    data: 'data',
  });
  await assetDb.legacyProtocolChoices.put({
    legacyId: 'v8-row',
    choice: 'upgraded',
    upgradedId: 'v9-row',
    updatedAt: 0,
  });
});

afterEach(async () => {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: originalLocation,
  });
  localStorage.clear();
  vi.restoreAllMocks();
  await request(indexedDB.deleteDatabase(LEGACY_DB_NAME));
});

describe('clearAllStorage', () => {
  it('empties this app’s library, then reloads', async () => {
    await clearAllStorage();

    expect(await assetDb.protocols.count()).toBe(0);
    expect(await assetDb.assets.count()).toBe(0);
    expect(await assetDb.legacyProtocolChoices.count()).toBe(0);
    expect(reload).toHaveBeenCalledOnce();
  });

  // Architect 8 at `/v8/` shares this origin: its library and every
  // localStorage key (language, analytics, dismissed notices) are its too.
  it('leaves Architect 8’s library and the shared settings alone', async () => {
    await seedArchitect8Library();
    localStorage.setItem('architect.locale', 'es');

    await clearAllStorage();

    expect(await readArchitect8Rows()).toEqual([
      { id: 'v8-row', name: 'Schema 8 study', schemaVersion: 8 },
    ]);
    expect(localStorage.getItem('architect.locale')).toBe('es');
  });

  it('reports a library it could not clear, and does not reload', async () => {
    vi.spyOn(assetDb.assets, 'clear').mockRejectedValue(
      new Error('clear failed'),
    );

    await expect(clearAllStorage()).rejects.toThrow('clear failed');

    expect(reload).not.toHaveBeenCalled();
    // One transaction: nothing was removed when part of it failed.
    expect(await assetDb.protocols.count()).toBe(1);
    expect(await assetDb.legacyProtocolChoices.count()).toBe(1);
  });
});
