// fake-indexeddb must be installed before Dexie opens a database.
import 'fake-indexeddb/auto';
import { Blob as NodeBlob } from 'node:buffer';

import { afterEach, describe, expect, it } from 'vitest';

import {
  discardHandoff,
  HANDOFF_DB_NAME,
  HANDOFF_DB_SCHEMA,
  HANDOFF_TTL_MS,
  pruneExpiredHandoffs,
  stageHandoff,
} from '../handoffStore';

// jsdom's Blob cannot cross fake-indexeddb's structured clone; Node's can, and
// it is what a real browser stores.
const makeFile = (text: string) => new NodeBlob([text]) as unknown as Blob;

const deleteHandoffDb = () =>
  new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(HANDOFF_DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });

const openRaw = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(HANDOFF_DB_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const readAllRaw = async (): Promise<unknown[]> => {
  const db = await openRaw();
  try {
    return await new Promise((resolve, reject) => {
      const request = db
        .transaction('handoffs', 'readonly')
        .objectStore('handoffs')
        .getAll();
      request.onsuccess = () => resolve(request.result as unknown[]);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
};

const putRaw = async (record: Record<string, unknown>): Promise<void> => {
  const db = await openRaw();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('handoffs', 'readwrite');
      transaction.objectStore('handoffs').put(record);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
};

const databaseNames = async () =>
  (await indexedDB.databases()).map((database) => database.name);

afterEach(async () => {
  await deleteHandoffDb();
});

// Architect 8 (on main) declares this same database. Both sides pin the same
// literals, so a change to one side that the other has not made fails here.
describe('hand-off store contract', () => {
  it('pins the database name, store schema and lifetime', () => {
    expect(HANDOFF_DB_NAME).toBe('ArchitectHandoffDB');
    expect(HANDOFF_DB_SCHEMA).toEqual({ handoffs: 'key, createdAt' });
    expect(HANDOFF_TTL_MS).toBe(60 * 60 * 1000);
  });

  it('creates exactly the native layout Dexie gives `version(1)`', async () => {
    await stageHandoff({
      targetMajor: 8,
      file: makeFile('x'),
      fileName: 'x.netcanvas',
    });

    const db = await openRaw();
    try {
      // Dexie opens `version(n)` as native version n * 10.
      expect(db.version).toBe(10);
      expect([...db.objectStoreNames]).toEqual(['handoffs']);
      const store = db.transaction('handoffs').objectStore('handoffs');
      expect(store.keyPath).toBe('key');
      expect(store.autoIncrement).toBe(false);
      expect([...store.indexNames]).toEqual(['createdAt']);
      expect(store.index('createdAt').keyPath).toBe('createdAt');
    } finally {
      db.close();
    }
  });

  it('stores records with exactly the contract’s fields', async () => {
    const before = Date.now();
    const key = await stageHandoff({
      targetMajor: 8,
      file: makeFile('protocol bytes'),
      fileName: 'Study.netcanvas',
    });

    expect(key).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    const [record] = await readAllRaw();
    expect(record).toEqual({
      key,
      kind: 'import',
      targetMajor: 8,
      fileName: 'Study.netcanvas',
      file: expect.anything(),
      createdAt: expect.any(Number),
    });
    const { createdAt, file } = record as { createdAt: number; file: Blob };
    expect(createdAt).toBeGreaterThanOrEqual(before);
    expect(await file.text()).toBe('protocol bytes');
  });
});

describe('pruneExpiredHandoffs', () => {
  it('removes records older than an hour, for either major', async () => {
    const now = Date.now();
    await stageHandoff({
      targetMajor: 9,
      file: makeFile('fresh'),
      fileName: 'Fresh.netcanvas',
    });
    await putRaw({
      key: crypto.randomUUID(),
      kind: 'import',
      targetMajor: 8,
      fileName: 'Old 8.netcanvas',
      file: makeFile('old'),
      createdAt: now - HANDOFF_TTL_MS - 1,
    });
    await putRaw({
      key: crypto.randomUUID(),
      kind: 'import',
      targetMajor: 9,
      fileName: 'Old 9.netcanvas',
      file: makeFile('old'),
      createdAt: now - HANDOFF_TTL_MS - 1,
    });

    await pruneExpiredHandoffs(now);

    const remaining = (await readAllRaw()) as { fileName: string }[];
    expect(remaining.map((record) => record.fileName)).toEqual([
      'Fresh.netcanvas',
    ]);
  });

  it('does not create the database when nothing was ever staged', async () => {
    await pruneExpiredHandoffs();

    expect(await databaseNames()).not.toContain(HANDOFF_DB_NAME);
  });
});

describe('discardHandoff', () => {
  it('withdraws a record this app staged and did not navigate for', async () => {
    const kept = await stageHandoff({
      targetMajor: 8,
      file: makeFile('kept'),
      fileName: 'kept.netcanvas',
    });
    const withdrawn = await stageHandoff({
      targetMajor: 8,
      file: makeFile('withdrawn'),
      fileName: 'withdrawn.netcanvas',
    });

    await discardHandoff(withdrawn);

    expect(
      (await readAllRaw()).map((record) => (record as { key: string }).key),
    ).toEqual([kept]);
  });
});
