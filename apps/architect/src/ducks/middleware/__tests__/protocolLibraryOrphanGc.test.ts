import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';

// Regression for #803: the autosave flush GCs orphaned asset blobs via
// putStoredProtocol -> deleteOrphanedAssets, which operates on the `assets`
// table. The flush transaction must therefore include `assets` in its scope;
// if it doesn't, Dexie throws NotFoundError, which the best-effort GC swallows,
// leaving the orphan blob undeleted (an IndexedDB storage leak).
//
// jsdom has no IndexedDB and fake-indexeddb is not a dependency, so this test
// faithfully models Dexie's transaction-scope enforcement instead of running a
// real Dexie: table proxies obtained inside a transaction throw a NotFound
// error ("Table X not part of transaction") when the table was not declared in
// the transaction's table list — exactly as Dexie 4.x does.

type AssetRow = {
  id: string;
  assetId: string;
  protocolId: string;
  name: string;
  data: Blob | string;
};

type ProtocolRow = {
  id: string;
  name: string;
  description?: string;
  schemaVersion: number;
  protocol: CurrentProtocol;
  createdAt: number;
  updatedAt: number;
};

const db = vi.hoisted(() => {
  const assetRows = new Map<string, AssetRow>();
  const protocolRows = new Map<string, ProtocolRow>();

  // Tables in scope for the currently-open transaction. null (non-transaction
  // context) = every table accessible, mirroring Dexie.
  let transactionScope: Set<unknown> | null = null;

  const assertInScope = (table: unknown): void => {
    if (transactionScope && !transactionScope.has(table)) {
      const error = new Error('Table not part of transaction');
      error.name = 'NotFoundError';
      throw error;
    }
  };

  const assetsTable = {
    put: async (row: AssetRow) => {
      assertInScope(assetsTable);
      assetRows.set(row.id, row);
    },
    get: async (id: string) => {
      assertInScope(assetsTable);
      return assetRows.get(id);
    },
    bulkDelete: async (keys: string[]) => {
      assertInScope(assetsTable);
      for (const key of keys) {
        assetRows.delete(key);
      }
    },
    where: (field: keyof AssetRow) => ({
      equals: (value: string) => {
        assertInScope(assetsTable);
        const scoped = [...assetRows.values()].filter(
          (row) => row[field] === value,
        );
        return {
          filter: (predicate: (row: AssetRow) => boolean) => ({
            primaryKeys: async () =>
              scoped.filter(predicate).map((row) => row.id),
          }),
        };
      },
    }),
  };

  const protocolsTable = {
    put: async (row: ProtocolRow) => {
      assertInScope(protocolsTable);
      protocolRows.set(row.id, row);
    },
    get: async (id: string) => {
      assertInScope(protocolsTable);
      return protocolRows.get(id);
    },
  };

  const assetDb = {
    assets: assetsTable,
    protocols: protocolsTable,
    transaction: async (
      _mode: string,
      ...rest: unknown[]
    ): Promise<unknown> => {
      const cb = rest[rest.length - 1] as () => Promise<unknown>;
      const tables = rest.slice(0, -1);
      const previousScope = transactionScope;
      transactionScope = new Set(tables);
      try {
        return await cb();
      } finally {
        transactionScope = previousScope;
      }
    },
  };

  return { assetRows, protocolRows, assetDb };
});

vi.mock('~/utils/assetDB', () => ({
  assetKey: (protocolId: string, assetId: string) =>
    `${protocolId}::${assetId}`,
  assetDb: db.assetDb,
}));

vi.mock('~/utils/activeProtocolScope', () => ({
  getActiveProtocolScope: () => null,
}));

vi.mock('~/utils/inMemoryAssetStore', () => ({
  getMemoryAsset: vi.fn(),
  putMemoryAsset: vi.fn(),
}));

import activeProtocol, {
  setActiveProtocol,
  updateProtocolDescription,
} from '../../modules/activeProtocol';
import app, { setActiveProtocolId } from '../../modules/app';
import { protocolLibraryListenerMiddleware } from '../protocolLibraryListener';
import createTimeline from '../timeline';

const reducer = combineReducers({
  app,
  activeProtocol: createTimeline(activeProtocol, { exclude: () => false }),
});

type TestState = ReturnType<typeof reducer>;

const makeStore = (preloadedState?: Partial<TestState>) =>
  configureStore({
    reducer,
    preloadedState,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }).prepend(
        protocolLibraryListenerMiddleware.middleware,
      ),
  });

const makeProtocol = (manifestKeys: string[]): CurrentProtocol =>
  ({
    name: 'Study',
    schemaVersion: 8,
    stages: [],
    codebook: { node: {}, edge: {}, ego: {} },
    assetManifest: Object.fromEntries(
      manifestKeys.map((key) => [key, { id: key, name: key, type: 'image' }]),
    ),
  }) as unknown as CurrentProtocol;

describe('protocolLibraryListener — orphan asset GC on autosave (#803)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    db.assetRows.clear();
    db.protocolRows.clear();

    db.protocolRows.set('p1', {
      id: 'p1',
      name: 'Study',
      schemaVersion: 8,
      protocol: makeProtocol(['a1', 'a2']),
      createdAt: 0,
      updatedAt: 0,
    });
    db.assetRows.set('p1::a1', {
      id: 'p1::a1',
      assetId: 'a1',
      protocolId: 'p1',
      name: 'a1',
      data: 'blob-a1',
    });
    db.assetRows.set('p1::a2', {
      id: 'p1::a2',
      assetId: 'a2',
      protocolId: 'p1',
      name: 'a2',
      data: 'blob-a2',
    });
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('deletes the orphaned blob when an autosave commits a manifest that dropped it', async () => {
    // Active protocol references only a1 now; a2 was deleted from the manifest.
    const store = makeStore();
    store.dispatch(setActiveProtocolId('p1'));
    store.dispatch(setActiveProtocol(makeProtocol(['a1'])));

    store.dispatch(updateProtocolDescription({ description: 'edited' }));
    await vi.advanceTimersByTimeAsync(700);
    // Let the write-lock promise chain settle.
    await vi.runOnlyPendingTimersAsync();

    // The orphaned blob a2 must have been GC'd inside the flush transaction.
    expect(db.assetRows.has('p1::a2')).toBe(false);
    // The still-referenced blob a1 must remain.
    expect(db.assetRows.has('p1::a1')).toBe(true);
  });
});
