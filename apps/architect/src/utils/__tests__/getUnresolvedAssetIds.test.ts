import { describe, expect, it, vi } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';

type Row = {
  id: string;
  assetId: string;
  protocolId: string;
  name: string;
  data: Blob | string;
};

const rows: Row[] = [
  {
    id: 'p1::photo',
    assetId: 'photo',
    protocolId: 'p1',
    name: 'photo.png',
    data: new Blob(['bytes']),
  },
  // A file resource whose stored row holds a string rather than bytes. Only
  // apikey entries legitimately carry one, and `bundleProtocol` refuses to
  // write this row — so counting it as stored would show nothing wrong in
  // Resources while the download refuses and names it.
  {
    id: 'p1::stringy',
    assetId: 'stringy',
    protocolId: 'p1',
    name: 'roster.csv',
    data: 'not-a-blob',
  },
  {
    id: 'p2::photo',
    assetId: 'photo',
    protocolId: 'p2',
    name: 'other.png',
    data: new Blob(['bytes']),
  },
];

vi.mock('../assetDB', () => ({
  assetKey: (protocolId: string, assetId: string) =>
    `${protocolId}::${assetId}`,
  assetDb: {
    assets: {
      where: () => ({
        equals: (protocolId: string) => ({
          each: (cb: (row: Row) => void) => {
            rows.filter((row) => row.protocolId === protocolId).forEach(cb);
            return Promise.resolve();
          },
        }),
      }),
    },
  },
}));

vi.mock('../activeProtocolScope', () => ({
  getActiveProtocolScope: () => null,
}));

vi.mock('../inMemoryAssetStore', () => ({
  getMemoryAsset: vi.fn(),
  getMemoryAssetsForScope: () => [],
  putMemoryAsset: vi.fn(),
  deleteMemoryAsset: vi.fn(),
}));

const { getUnresolvedAssetIds } = await import('../assetUtils');

const manifest = (
  entries: Record<string, unknown>,
): CurrentProtocol['assetManifest'] =>
  entries as CurrentProtocol['assetManifest'];

describe('getUnresolvedAssetIds', () => {
  it('reports a file resource with no stored row', async () => {
    const ids = await getUnresolvedAssetIds(
      manifest({
        photo: { type: 'image', name: 'Portrait', source: 'photo.png' },
        gone: { type: 'image', name: 'Absent', source: 'gone.png' },
      }),
      'p1',
    );

    expect(ids).toEqual(['gone']);
  });

  it('reports a file resource whose stored row holds a string, not bytes', async () => {
    const ids = await getUnresolvedAssetIds(
      manifest({
        stringy: { type: 'network', name: 'Roster', source: 'roster.csv' },
      }),
      'p1',
    );

    // `bundleProtocol` refuses this row on the same grounds, so the two have
    // to agree — otherwise Resources shows nothing wrong while the download
    // refuses and names it, and an in-use resource cannot even be re-added.
    expect(ids).toEqual(['stringy']);
  });

  it('never reports an apikey, which carries its value in the manifest', async () => {
    const ids = await getUnresolvedAssetIds(
      manifest({
        token: { type: 'apikey', name: 'Map token', value: 'pk.secret' },
      }),
      'p1',
    );

    expect(ids).toEqual([]);
  });

  it('does not read another protocol’s rows', async () => {
    const ids = await getUnresolvedAssetIds(
      manifest({
        photo: { type: 'image', name: 'Portrait', source: 'photo.png' },
      }),
      'p2',
    );
    expect(ids).toEqual([]);

    const missingHere = await getUnresolvedAssetIds(
      manifest({
        stringy: { type: 'network', name: 'Roster', source: 'roster.csv' },
      }),
      'p2',
    );
    expect(missingHere).toEqual(['stringy']);
  });

  it('reports every file resource when there is no scope to read', async () => {
    const ids = await getUnresolvedAssetIds(
      manifest({
        photo: { type: 'image', name: 'Portrait', source: 'photo.png' },
        token: { type: 'apikey', name: 'Map token', value: 'pk.secret' },
      }),
    );

    // Nothing can be read, so saying "all of them" is the honest answer and is
    // what stops an export writing a manifest with no files behind it.
    expect(ids).toEqual(['photo']);
  });
});
