// fake-indexeddb must be installed before Dexie opens a database.
import 'fake-indexeddb/auto';
import { Blob as NodeBlob } from 'node:buffer';

import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  countLegacyAssets,
  createLegacyProtocolReader,
  getLegacyProtocol,
  legacyReadOnlyMiddleware,
  listLegacyProtocols,
  readLegacyProtocolSnapshot,
} from '../legacyProtocolLibrary';
import { LEGACY_LIBRARIES } from '../storageNames';

const reportError = vi.hoisted(() => vi.fn());
vi.mock('../reportError', () => ({ reportError }));

// Real Dexie over a real (in-memory) IndexedDB, seeded with exactly the layout
// Architect 8's Dexie creates, so every assertion here is about what actually
// happens to Architect 8's database, not about a mock.
const DB_NAME = LEGACY_LIBRARIES[0].dbName;

// jsdom's Blob cannot cross fake-indexeddb's structured clone; Node's can.
const makeBlob = (text: string) => new NodeBlob([text]) as unknown as Blob;

const request = <T>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const databaseNames = async () =>
  (await indexedDB.databases()).map((database) => database.name);

type SeedRow = {
  id: string;
  schemaVersion: number;
  updatedAt: number;
} & Record<string, unknown>;
type SeedAsset = { id: string; protocolId: string } & Record<string, unknown>;

// Architect 8 declares `version(1).stores({ assets: 'id, protocolId',
// protocols: 'id, updatedAt' })`, which Dexie opens as native version 10.
const openArchitect8Library = (
  open: IDBFactory['open'] = (name, version) => indexedDB.open(name, version),
) => {
  const opening = open(DB_NAME, 10);
  opening.onupgradeneeded = () => {
    const db = opening.result;
    db.createObjectStore('protocols', { keyPath: 'id' }).createIndex(
      'updatedAt',
      'updatedAt',
    );
    db.createObjectStore('assets', { keyPath: 'id' }).createIndex(
      'protocolId',
      'protocolId',
    );
  };
  return request(opening).then((db) => {
    // As Architect 8's Dexie does: a version change or delete closes it.
    db.onversionchange = () => db.close();
    return db;
  });
};

const seedArchitect8Library = async (
  rows: SeedRow[],
  assets: SeedAsset[] = [],
) => {
  const db = await openArchitect8Library();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(['protocols', 'assets'], 'readwrite');
    for (const row of rows) transaction.objectStore('protocols').put(row);
    for (const asset of assets) transaction.objectStore('assets').put(asset);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
};

// Everything observable about the database, read without ever creating it.
const fingerprint = async () => {
  if (!(await databaseNames()).includes(DB_NAME)) return { exists: false };
  const db = await request(indexedDB.open(DB_NAME));
  try {
    const storeNames = [...db.objectStoreNames];
    const stores: Record<string, unknown> = {};
    for (const name of storeNames) {
      const store = db.transaction(name).objectStore(name);
      const values = await request(store.getAll());
      stores[name] = {
        keyPath: store.keyPath,
        indexes: [...store.indexNames],
        values: await Promise.all(
          values.map(async (value: Record<string, unknown>) =>
            value.data instanceof NodeBlob
              ? { ...value, data: await value.data.text() }
              : value,
          ),
        ),
      };
    }
    return { exists: true, version: db.version, storeNames, stores };
  } finally {
    db.close();
  }
};

const deleteDatabase = (name: string) =>
  request(indexedDB.deleteDatabase(name));

const protocolRow = (
  id: string,
  schemaVersion: number,
  updatedAt: number,
): SeedRow => ({
  id,
  name: `Study ${id}`,
  schemaVersion,
  protocol: {
    schemaVersion,
    codebook: {},
    stages: [{ id: 'stage-1' }],
    assetManifest: { a1: { id: 'a1', name: 'map.png', source: 'map.png' } },
  },
  validated: true,
  createdAt: 1,
  updatedAt,
});

const assetRow = (protocolId: string, assetId: string): SeedAsset => ({
  id: `${protocolId}::${assetId}`,
  assetId,
  protocolId,
  name: `${assetId}.png`,
  data: makeBlob(`bytes of ${assetId}`),
});

const seedTypicalLibrary = () =>
  seedArchitect8Library(
    [
      protocolRow('older', 8, 100),
      protocolRow('newer', 8, 300),
      protocolRow('schema-7', 7, 200),
      // Written by a pre-release build of this app: not Architect 8's.
      protocolRow('schema-9', 9, 400),
      // Not a protocol row at all.
      { id: 'broken', schemaVersion: 8, updatedAt: 500 },
    ],
    [assetRow('newer', 'a1'), assetRow('newer', 'a2'), assetRow('older', 'a1')],
  );

let reader: ReturnType<typeof createLegacyProtocolReader>;

beforeEach(() => {
  reader = createLegacyProtocolReader(DB_NAME);
  reportError.mockReset();
});

afterEach(async () => {
  reader.close();
  await deleteDatabase(DB_NAME);
});

describe('legacy protocol reader', () => {
  describe('when Architect 8 has never run here', () => {
    it('reads nothing and never creates its database', async () => {
      await expect(reader.legacyLibraryExists()).resolves.toBe(false);
      await expect(reader.listLegacyProtocols()).resolves.toEqual([]);
      await expect(reader.getLegacyProtocol('older')).resolves.toBeUndefined();
      await expect(reader.countLegacyAssets('older')).resolves.toBe(0);
      await expect(
        reader.readLegacyProtocolSnapshot('older'),
      ).resolves.toBeUndefined();

      expect(await databaseNames()).not.toContain(DB_NAME);
      expect(reportError).not.toHaveBeenCalled();
    });
  });

  describe('when Architect 8’s library exists', () => {
    beforeEach(seedTypicalLibrary);

    it('lists Architect 8’s protocols, newest first, ignoring anything else', async () => {
      await expect(reader.legacyLibraryExists()).resolves.toBe(true);
      const rows = await reader.listLegacyProtocols();

      expect(rows.map((row) => row.id)).toEqual(['newer', 'schema-7', 'older']);
      expect(rows[0]).toMatchObject({
        name: 'Study newer',
        schemaVersion: 8,
        protocol: { schemaVersion: 8, stages: [{ id: 'stage-1' }] },
      });
    });

    it('reads one protocol, but not one written for this schema', async () => {
      await expect(reader.getLegacyProtocol('older')).resolves.toMatchObject({
        id: 'older',
        schemaVersion: 8,
      });
      await expect(
        reader.getLegacyProtocol('schema-9'),
      ).resolves.toBeUndefined();
      await expect(
        reader.getLegacyProtocol('missing'),
      ).resolves.toBeUndefined();
    });

    it('reads and counts a protocol’s assets', async () => {
      const assets = (await reader.readLegacyProtocolSnapshot('newer'))?.assets;

      expect(assets?.map((asset) => asset.assetId).toSorted()).toEqual([
        'a1',
        'a2',
      ]);
      expect(await assets?.[0]?.data).toBeTruthy();
      await expect(reader.countLegacyAssets('newer')).resolves.toBe(2);
      await expect(reader.countLegacyAssets('schema-7')).resolves.toBe(0);
    });

    it('reads a protocol and its assets together', async () => {
      const snapshot = await reader.readLegacyProtocolSnapshot('older');

      expect(snapshot?.row.id).toBe('older');
      expect(snapshot?.assets.map((asset) => asset.id)).toEqual(['older::a1']);
      await expect(
        reader.readLegacyProtocolSnapshot('schema-9'),
      ).resolves.toBeUndefined();
    });

    // The library renders each row's stage count and dates, and Info and
    // Download read its codebook: a row missing any of them would break the
    // whole list, so it is left out, as Architect 8's own reads would fail.
    it('leaves out a row whose protocol has no stages or codebook', async () => {
      const valid = protocolRow('valid', 8, 600);
      const withProtocol = (protocol: Record<string, unknown>) => ({
        ...valid,
        protocol: {
          ...(valid.protocol as Record<string, unknown>),
          ...protocol,
        },
      });
      await seedArchitect8Library([
        valid,
        { ...withProtocol({ stages: undefined }), id: 'no-stages' },
        { ...withProtocol({ stages: {} }), id: 'stages-not-a-list' },
        { ...withProtocol({ codebook: undefined }), id: 'no-codebook' },
        {
          ...withProtocol({ codebook: 'nodes' }),
          id: 'codebook-not-an-object',
        },
      ]);

      const rows = await reader.listLegacyProtocols();

      expect(rows.map((row) => row.id)).toEqual([
        'valid',
        'newer',
        'schema-7',
        'older',
      ]);
      await expect(
        reader.getLegacyProtocol('no-stages'),
      ).resolves.toBeUndefined();
      await expect(
        reader.readLegacyProtocolSnapshot('no-codebook'),
      ).resolves.toBeUndefined();
    });

    it('dates a row with no creation date by its last update', async () => {
      const { createdAt: _createdAt, ...undated } = protocolRow(
        'undated',
        8,
        700,
      );
      await seedArchitect8Library([undated]);

      await expect(reader.getLegacyProtocol('undated')).resolves.toMatchObject({
        createdAt: 700,
        updatedAt: 700,
      });
      const [listed] = await reader.listLegacyProtocols();
      expect(listed).toMatchObject({ id: 'undated', createdAt: 700 });
      await expect(reader.getLegacyProtocol('older')).resolves.toMatchObject({
        createdAt: 1,
      });
    });

    it('leaves the database exactly as it found it', async () => {
      const before = await fingerprint();

      await reader.listLegacyProtocols();
      await reader.getLegacyProtocol('newer');
      await reader.countLegacyAssets('newer');
      await reader.readLegacyProtocolSnapshot('newer');
      reader.close();

      const after = await fingerprint();
      expect(after).toEqual(before);
      // Still the version Architect 8 opens it at: no schema was patched.
      expect(after).toMatchObject({ exists: true, version: 10 });
    });

    // Architect 8 never changes its schema, but if a future one did, an open
    // connection here must not stop it.
    it('gets out of the way of a version change', async () => {
      await reader.listLegacyProtocols();

      const upgrade = indexedDB.open(DB_NAME, 20);
      const blocked = vi.fn();
      upgrade.onblocked = blocked;
      const db = await request(upgrade);
      db.close();

      expect(blocked).not.toHaveBeenCalled();
    });

    it('stops reading, without recreating it, once the library is deleted', async () => {
      await expect(reader.listLegacyProtocols()).resolves.toHaveLength(3);

      await deleteDatabase(DB_NAME);

      await expect(reader.listLegacyProtocols()).resolves.toEqual([]);
      await expect(reader.getLegacyProtocol('older')).resolves.toBeUndefined();
      expect(await databaseNames()).not.toContain(DB_NAME);
    });
  });

  // Architect 8 can delete its library just after `indexedDB.databases()`
  // lists it, and create it again while this reader is still opening it.
  it('neither creates nor deletes the library when it goes before the open', async () => {
    const databases = vi
      .spyOn(indexedDB, 'databases')
      .mockResolvedValueOnce([{ name: DB_NAME, version: 10 }]);
    const deleteDatabaseSpy = vi.spyOn(indexedDB, 'deleteDatabase');
    const realOpen = indexedDB.open.bind(indexedDB);
    let architect8: Promise<IDBDatabase> | undefined;
    const open = vi
      .spyOn(indexedDB, 'open')
      .mockImplementation((name, version) => {
        const opening = realOpen(name, version);
        // Architect 8's own open, queued right behind this reader's.
        if (name === DB_NAME && version === undefined) {
          architect8 ??= openArchitect8Library(realOpen);
        }
        return opening;
      });

    try {
      await expect(reader.listLegacyProtocols()).resolves.toEqual([]);
      (await architect8)?.close();
    } finally {
      open.mockRestore();
      deleteDatabaseSpy.mockRestore();
      databases.mockRestore();
    }

    expect(architect8).toBeDefined();
    expect(deleteDatabaseSpy).not.toHaveBeenCalled();
    expect(await fingerprint()).toMatchObject({
      exists: true,
      version: 10,
      storeNames: ['assets', 'protocols'],
    });
    expect(reportError).not.toHaveBeenCalled();
  });

  it('lists nothing, and reports why, when the library cannot be read', async () => {
    // A database by that name, but not one Architect 8 laid out.
    const open = indexedDB.open(DB_NAME, 10);
    open.onupgradeneeded = () => {
      open.result.createObjectStore('unrelated');
    };
    (await request(open)).close();
    const before = await fingerprint();

    await expect(reader.listLegacyProtocols()).resolves.toEqual([]);
    expect(reportError).toHaveBeenCalledOnce();
    await expect(reader.getLegacyProtocol('older')).rejects.toThrow();

    reader.close();
    expect(await fingerprint()).toEqual(before);
  });

  it('treats a browser that cannot list its databases as having none', async () => {
    await seedTypicalLibrary();
    // Shadow the prototype's method on this instance, as an older browser
    // that lacks it would look.
    Object.defineProperty(indexedDB, 'databases', {
      configurable: true,
      value: undefined,
    });

    try {
      await expect(reader.listLegacyProtocols()).resolves.toEqual([]);
    } finally {
      Reflect.deleteProperty(indexedDB, 'databases');
    }
    await expect(reader.listLegacyProtocols()).resolves.toHaveLength(3);
  });
});

// What the app imports: one reader over Architect 8's library.
describe('the app’s legacy reader', () => {
  beforeEach(seedTypicalLibrary);

  it('reads Architect 8’s library, ArchitectProtocolDB', async () => {
    expect(DB_NAME).toBe('ArchitectProtocolDB');
    const before = await fingerprint();

    expect((await listLegacyProtocols()).map((row) => row.id)).toEqual([
      'newer',
      'schema-7',
      'older',
    ]);
    await expect(getLegacyProtocol('older')).resolves.toMatchObject({
      id: 'older',
    });
    await expect(countLegacyAssets('newer')).resolves.toBe(2);
    await expect(readLegacyProtocolSnapshot('older')).resolves.toMatchObject({
      row: { id: 'older' },
    });

    expect(await fingerprint()).toEqual(before);
  });
});

describe('legacyReadOnlyMiddleware', () => {
  beforeEach(seedTypicalLibrary);

  const openGuarded = async () => {
    const db = new Dexie(DB_NAME, { addons: [], autoOpen: false });
    db.use(legacyReadOnlyMiddleware);
    await db.open();
    return db;
  };

  it('refuses every kind of write, and nothing reaches the database', async () => {
    const before = await fingerprint();
    const db = await openGuarded();
    const protocols = db.table('protocols');
    const assets = db.table('assets');

    try {
      const attempts: [string, () => Promise<unknown>][] = [
        ['put', () => protocols.put(protocolRow('injected', 8, 1))],
        ['add', () => protocols.add(protocolRow('injected', 8, 1))],
        ['update', () => protocols.update('older', { name: 'Renamed' })],
        ['delete', () => protocols.delete('older')],
        ['bulkPut', () => assets.bulkPut([assetRow('older', 'x')])],
        ['bulkDelete', () => assets.bulkDelete(['older::a1'])],
        ['clear', () => assets.clear()],
        [
          'collection delete',
          () => assets.where('protocolId').equals('newer').delete(),
        ],
        [
          'read-write transaction',
          () =>
            db.transaction('rw', protocols, async () => {
              await protocols.get('older');
            }),
        ],
      ];

      for (const [label, attempt] of attempts) {
        await expect(attempt(), label).rejects.toMatchObject({
          name: expect.stringMatching(/ReadOnlyError/),
        });
      }
      // Reads still work through the same connection.
      await expect(protocols.get('older')).resolves.toMatchObject({
        id: 'older',
      });
    } finally {
      db.close();
    }

    expect(await fingerprint()).toEqual(before);
  });
});
