import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';

// Regression for #803: accepted commits eventually GC orphaned asset blobs via
// putStoredProtocol -> deleteOrphanedAssets, which operates on the `assets`
// table. The write transaction must include `assets`, but GC must also retain
// blobs referenced by Undo/Redo history until that history is discarded.
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
} from '../../modules/activeProtocol';
import app, { setActiveProtocolId } from '../../modules/app';
import { deleteAsset } from '../../modules/protocol/assetManifest';
import { protocolCommitAccepted } from '../../protocolCommit';
import { protocolLibraryListenerMiddleware } from '../protocolLibraryListener';
import createTimeline, { timelineActions } from '../timeline';

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

describe('protocolLibraryListener — undo-safe orphan asset GC (#803)', () => {
  beforeEach(() => {
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

  it('retains an orphaned blob while undo can restore its manifest entry', async () => {
    const store = makeStore();
    store.dispatch(setActiveProtocolId('p1'));
    store.dispatch(setActiveProtocol(makeProtocol(['a1', 'a2'])));
    store.dispatch(deleteAsset('a2'));
    store.dispatch(
      protocolCommitAccepted({
        id: 'p1',
        protocol: makeProtocol(['a1']),
        persistenceAllowed: true,
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(db.assetRows.has('p1::a2')).toBe(true);
    expect(db.assetRows.has('p1::a1')).toBe(true);

    // Once history is reset, a later accepted commit may reclaim the blob.
    store.dispatch(timelineActions.reset(makeProtocol(['a1'])));
    store.dispatch(
      protocolCommitAccepted({
        id: 'p1',
        protocol: makeProtocol(['a1']),
        persistenceAllowed: true,
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(db.assetRows.has('p1::a2')).toBe(false);
  });
});
