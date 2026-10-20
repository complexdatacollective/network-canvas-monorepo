// fake-indexeddb must be installed before Dexie opens a database.
import 'fake-indexeddb/auto';
import { Blob as NodeBlob } from 'node:buffer';

import { afterEach, describe, expect, it } from 'vitest';

import {
  discardHandoff,
  HANDOFF_DB_NAME,
  HANDOFF_DB_SCHEMA,
  HANDOFF_DB_VERSION,
  HANDOFF_TTL_MS,
  isHandoffKey,
  pruneExpiredHandoffs,
  stageHandoff,
  takeHandoff,
} from '../handoffStore';

// The hand-off store is shared, on one origin, with Interviewer 8's copy of
// this module on main. Neither side can see the other's code, so these
// literals are the contract: change one here and Interviewer 8 can no longer
// read what this app stages, or the other way round.

// jsdom's Blob cannot cross fake-indexeddb's structured clone; Node's can, and
// it is what a real browser stores.
const makeFile = (text: string) => new NodeBlob([text]) as unknown as Blob;

const openRaw = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(HANDOFF_DB_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const readAllRaw = async (): Promise<Record<string, unknown>[]> => {
  const db = await openRaw();
  try {
    return await new Promise((resolve, reject) => {
      const request = db
        .transaction('handoffs', 'readonly')
        .objectStore('handoffs')
        .getAll();
      request.onsuccess = () =>
        resolve(request.result as Record<string, unknown>[]);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
};

/** A record as Interviewer 8 writes it, through the raw API. */
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
  (await indexedDB.databases()).map(({ name }) => name);

// Through the module rather than raw IndexedDB: a raw open before Dexie's
// would create the database without its store.
afterEach(async () => {
  await pruneExpiredHandoffs(Number.POSITIVE_INFINITY);
});

describe('hand-off store contract', () => {
  it('pins the database name, version, store schema and lifetime', () => {
    expect(HANDOFF_DB_NAME).toBe('InterviewerHandoffDB');
    expect(HANDOFF_DB_VERSION).toBe(1);
    expect(HANDOFF_DB_SCHEMA).toEqual({ handoffs: 'key, createdAt' });
    expect(HANDOFF_TTL_MS).toBe(60 * 60 * 1000);
  });

  it('creates the store with key as its primary key and a createdAt index', async () => {
    await stageHandoff({
      targetMajor: 8,
      fileName: 'study.netcanvas',
      file: makeFile('zip'),
    });

    const db = await openRaw();
    try {
      // Dexie stores version(1) as IndexedDB version 10.
      expect(db.version).toBe(HANDOFF_DB_VERSION * 10);
      expect(Array.from(db.objectStoreNames)).toEqual(['handoffs']);
      const store = db.transaction('handoffs').objectStore('handoffs');
      expect(store.keyPath).toBe('key');
      expect(store.autoIncrement).toBe(false);
      expect(Array.from(store.indexNames)).toEqual(['createdAt']);
      expect(store.index('createdAt').keyPath).toBe('createdAt');
    } finally {
      db.close();
    }
  });

  it('writes a record with exactly the agreed fields', async () => {
    const key = await stageHandoff({
      targetMajor: 8,
      fileName: 'study.netcanvas',
      file: makeFile('zip-bytes'),
      now: 1_700_000_000_000,
    });

    expect(isHandoffKey(key)).toBe(true);
    const [record] = await readAllRaw();
    expect(Object.keys(record ?? {}).toSorted()).toEqual([
      'createdAt',
      'file',
      'fileName',
      'key',
      'kind',
      'targetMajor',
    ]);
    expect(record).toMatchObject({
      key,
      kind: 'import',
      targetMajor: 8,
      fileName: 'study.netcanvas',
      createdAt: 1_700_000_000_000,
    });
  });
});

describe('takeHandoff', () => {
  const KEY = '2b1f6a3e-6f0c-4c1e-9d4b-0a6f1e2c3d4e';

  it('reads and deletes a record Interviewer 8 staged for this app', async () => {
    // Create the store first, as either app would.
    await pruneExpiredHandoffs(Number.POSITIVE_INFINITY);
    await stageHandoff({ targetMajor: 8, fileName: 'x', file: makeFile('x') });
    await putRaw({
      key: KEY,
      kind: 'import',
      targetMajor: 9,
      fileName: 'newer.netcanvas',
      file: makeFile('zip-bytes'),
      createdAt: Date.now(),
    });

    expect(await takeHandoff(KEY)).toMatchObject({
      key: KEY,
      targetMajor: 9,
      fileName: 'newer.netcanvas',
    });
    expect((await readAllRaw()).map(({ key }) => key)).not.toContain(KEY);
    // One consumer only: a reload, or a second tab, finds nothing.
    expect(await takeHandoff(KEY)).toBeUndefined();
  });

  it('leaves a record staged for Interviewer 8 where it is', async () => {
    const key = await stageHandoff({
      targetMajor: 8,
      fileName: 'study.netcanvas',
      file: makeFile('zip-bytes'),
    });

    expect(await takeHandoff(key)).toBeUndefined();
    expect((await readAllRaw()).map((record) => record.key)).toEqual([key]);
  });

  it('deletes and refuses a record past its time', async () => {
    const now = 1_700_000_000_000;
    await stageHandoff({ targetMajor: 8, fileName: 'x', file: makeFile('x') });
    await putRaw({
      key: KEY,
      kind: 'import',
      targetMajor: 9,
      fileName: 'old.netcanvas',
      file: makeFile('zip'),
      createdAt: now - HANDOFF_TTL_MS - 1,
    });

    expect(await takeHandoff(KEY, now)).toBeUndefined();
    expect((await readAllRaw()).map(({ key }) => key)).not.toContain(KEY);
  });

  it('ignores malformed keys and creates nothing to look one up', async () => {
    await deleteHandoffDatabase();
    expect(await takeHandoff('not-a-key')).toBeUndefined();
    expect(await takeHandoff(KEY)).toBeUndefined();
    expect(await databaseNames()).not.toContain(HANDOFF_DB_NAME);
  });
});

describe('discardHandoff', () => {
  it('withdraws a record this app staged', async () => {
    const key = await stageHandoff({
      targetMajor: 8,
      fileName: 'study.netcanvas',
      file: makeFile('zip'),
    });
    await discardHandoff(key);
    expect(await readAllRaw()).toEqual([]);
  });
});

describe('pruneExpiredHandoffs', () => {
  it('deletes records older than an hour, for either app, and keeps the rest', async () => {
    const now = 1_700_000_000_000;
    await stageHandoff({
      targetMajor: 8,
      fileName: 'a.netcanvas',
      file: makeFile('a'),
      now: now - HANDOFF_TTL_MS - 1,
    });
    await stageHandoff({
      targetMajor: 9,
      fileName: 'b.netcanvas',
      file: makeFile('b'),
      now: now - HANDOFF_TTL_MS - 1000,
    });
    const fresh = await stageHandoff({
      targetMajor: 9,
      fileName: 'c.netcanvas',
      file: makeFile('c'),
      now: now - HANDOFF_TTL_MS + 1000,
    });

    await pruneExpiredHandoffs(now);
    expect((await readAllRaw()).map((record) => record.key)).toEqual([fresh]);
  });

  it('creates nothing when nothing was ever staged', async () => {
    await deleteHandoffDatabase();
    await pruneExpiredHandoffs();
    expect(await databaseNames()).not.toContain(HANDOFF_DB_NAME);
  });
});

async function deleteHandoffDatabase(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(HANDOFF_DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
