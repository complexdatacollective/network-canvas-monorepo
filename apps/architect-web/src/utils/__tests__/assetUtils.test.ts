import { describe, expect, it, vi } from 'vitest';

// A minimal Dexie-collection stub for the `where(...).equals(...).filter(...)`
// chain used by deleteOrphanedAssets, so the orphan-selection logic can be
// tested without a real IndexedDB.
const bulkDelete = vi.fn(() => Promise.resolve());

type Row = { id: string; assetId: string; protocolId: string };

const makeAssetsTable = (rows: Row[]) => ({
  where: (_field: string) => ({
    equals: (protocolId: string) => {
      const scoped = rows.filter((row) => row.protocolId === protocolId);
      return {
        filter: (predicate: (row: Row) => boolean) => ({
          primaryKeys: () =>
            Promise.resolve(scoped.filter(predicate).map((row) => row.id)),
        }),
      };
    },
  }),
  bulkDelete,
});

vi.mock('../assetDB', () => ({
  assetKey: (protocolId: string, assetId: string) =>
    `${protocolId}::${assetId}`,
  assetDb: {
    assets: makeAssetsTable([
      { id: 'p1::a', assetId: 'a', protocolId: 'p1' },
      { id: 'p1::b', assetId: 'b', protocolId: 'p1' },
      { id: 'p1::c', assetId: 'c', protocolId: 'p1' },
      { id: 'p2::a', assetId: 'a', protocolId: 'p2' },
    ]),
  },
}));

vi.mock('../activeProtocolScope', () => ({
  getActiveProtocolScope: () => null,
}));

vi.mock('../inMemoryAssetStore', () => ({
  getMemoryAsset: vi.fn(),
  putMemoryAsset: vi.fn(),
}));

const { deleteOrphanedAssets } = await import('../assetUtils');

describe('deleteOrphanedAssets', () => {
  it('deletes only the protocol’s blobs no longer referenced by the manifest', async () => {
    await deleteOrphanedAssets('p1', ['a']);
    // b and c are orphaned under p1; a is kept; p2::a belongs to another
    // protocol and must be untouched.
    expect(bulkDelete).toHaveBeenCalledWith(['p1::b', 'p1::c']);
  });

  it('does nothing when every stored blob is still referenced', async () => {
    bulkDelete.mockClear();
    await deleteOrphanedAssets('p1', ['a', 'b', 'c']);
    expect(bulkDelete).not.toHaveBeenCalled();
  });
});
