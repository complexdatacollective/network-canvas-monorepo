import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';

import {
  HANDOFF_DB_NAME,
  HANDOFF_DB_VERSION,
  HANDOFF_STORES,
  HANDOFF_TTL_MS,
  type HandoffRecord,
  pruneStaleHandoffs,
  takeHandoff,
  writeHandoff,
} from '../handoffStore';

// The hand-off store is shared, on one origin, with Architect 9's copy of this
// module on another branch. Neither side can see the other's code, so these
// literals are the contract: change one here and Architect 9 can no longer
// read what this app stages, or the other way round.

const openRaw = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(HANDOFF_DB_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const readAllRaw = async (): Promise<HandoffRecord[]> => {
  const db = await openRaw();
  try {
    return await new Promise((resolve, reject) => {
      const request = db
        .transaction('handoffs', 'readonly')
        .objectStore('handoffs')
        .getAll();
      request.onsuccess = () => resolve(request.result as HandoffRecord[]);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
};

// Through the module rather than raw IndexedDB: a raw open before Dexie's
// would create the database without its store.
afterEach(async () => {
  await pruneStaleHandoffs(Number.POSITIVE_INFINITY);
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe('hand-off store contract', () => {
  it('pins the database name, version and store schema', () => {
    expect(HANDOFF_DB_NAME).toBe('ArchitectHandoffDB');
    expect(HANDOFF_DB_VERSION).toBe(1);
    expect(HANDOFF_STORES).toEqual({ handoffs: 'key, createdAt' });
    expect(HANDOFF_TTL_MS).toBe(60 * 60 * 1000);
  });

  it('creates the store with key as its primary key and a createdAt index', async () => {
    await writeHandoff({
      targetMajor: 9,
      fileName: 'study.netcanvas',
      file: new Blob(['zip']),
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
    const file = new Blob(['zip-bytes']);
    const key = await writeHandoff({
      targetMajor: 9,
      fileName: 'study.netcanvas',
      file,
      now: 1_700_000_000_000,
    });

    expect(key).toMatch(UUID);
    const [record] = await readAllRaw();
    expect(record).toBeDefined();
    expect(Object.keys(record ?? {}).toSorted()).toEqual(
      [
        'createdAt',
        'file',
        'fileName',
        'key',
        'kind',
        'targetMajor',
      ].toSorted(),
    );
    expect(record).toMatchObject({
      key,
      kind: 'import',
      targetMajor: 9,
      fileName: 'study.netcanvas',
      createdAt: 1_700_000_000_000,
    });
  });
});

describe('takeHandoff', () => {
  it('reads and deletes a record staged for this app', async () => {
    const key = await writeHandoff({
      targetMajor: 8,
      fileName: 'study.netcanvas',
      file: new Blob(['zip-bytes']),
    });

    const record = await takeHandoff(key);
    expect(record).toMatchObject({ key, targetMajor: 8 });
    expect(await readAllRaw()).toEqual([]);

    // One consumer only: a reload, or a second tab, finds nothing.
    expect(await takeHandoff(key)).toBeNull();
  });

  it('leaves a record staged for the other app where it is', async () => {
    const key = await writeHandoff({
      targetMajor: 9,
      fileName: 'study.netcanvas',
      file: new Blob(['zip-bytes']),
    });

    expect(await takeHandoff(key, 8)).toBeNull();
    expect((await readAllRaw()).map((record) => record.key)).toEqual([key]);
  });

  it('resolves null for a key that was never staged', async () => {
    expect(
      await takeHandoff('00000000-0000-4000-8000-000000000000'),
    ).toBeNull();
  });
});

describe('pruneStaleHandoffs', () => {
  it('deletes records older than an hour, for either app, and keeps the rest', async () => {
    const now = 1_700_000_000_000;
    const stale8 = await writeHandoff({
      targetMajor: 8,
      fileName: 'a.netcanvas',
      file: new Blob(['a']),
      now: now - HANDOFF_TTL_MS - 1,
    });
    const stale9 = await writeHandoff({
      targetMajor: 9,
      fileName: 'b.netcanvas',
      file: new Blob(['b']),
      now: now - HANDOFF_TTL_MS - 1000,
    });
    const fresh = await writeHandoff({
      targetMajor: 9,
      fileName: 'c.netcanvas',
      file: new Blob(['c']),
      now: now - HANDOFF_TTL_MS + 1000,
    });

    expect(await pruneStaleHandoffs(now)).toBe(2);
    const remaining = (await readAllRaw()).map((record) => record.key);
    expect(remaining).toEqual([fresh]);
    expect(remaining).not.toContain(stale8);
    expect(remaining).not.toContain(stale9);
  });
});
