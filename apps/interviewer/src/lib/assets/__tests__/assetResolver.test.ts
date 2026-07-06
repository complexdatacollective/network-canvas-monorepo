import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { StoredAsset, StoredProtocol } from '../../db/types';

const getProtocolAssets = vi.fn();
const getProtocolAsset = vi.fn();
const getProtocolByHash = vi.fn();

vi.mock('../../db/api', () => ({
  getProtocolAssets: (...args: unknown[]) => getProtocolAssets(...args),
  getProtocolAsset: (...args: unknown[]) => getProtocolAsset(...args),
  getProtocolByHash: (...args: unknown[]) => getProtocolByHash(...args),
}));

const { buildResolvedAssets } = await import('../assetResolver');

const HASH = 'protocol-hash';

function storedAsset(partial: Partial<StoredAsset>): StoredAsset {
  return {
    id: `${HASH}::${partial.assetId ?? 'a'}`,
    protocolHash: HASH,
    assetId: partial.assetId ?? 'a',
    name: partial.name ?? 'Asset',
    type: partial.type ?? 'video',
    data: partial.data ?? new Blob(),
  };
}

function storedProtocolWithManifest(
  manifest: Record<string, { type: string; name: string; source?: string }>,
): StoredProtocol {
  return {
    id: HASH,
    hash: HASH,
    name: 'Test',
    schemaVersion: 8,
    importedAt: new Date().toISOString(),
    codebook: {},
    protocol: {
      assetManifest: manifest,
    },
  } as StoredProtocol;
}

describe('buildResolvedAssets carries the asset source filename', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('populates ResolvedAsset.source from the protocol manifest', async () => {
    getProtocolAssets.mockResolvedValue([
      storedAsset({ assetId: 'vid-1', name: 'Intro Clip', type: 'video' }),
    ]);
    getProtocolByHash.mockResolvedValue(
      storedProtocolWithManifest({
        'vid-1': { type: 'video', name: 'Intro Clip', source: 'intro.mov' },
      }),
    );

    const resolved = await buildResolvedAssets(HASH);

    expect(resolved).toHaveLength(1);
    expect(resolved[0]?.source).toBe('intro.mov');
    expect(resolved[0]?.name).toBe('Intro Clip');
  });

  it('leaves source undefined when the manifest entry has none (apikey)', async () => {
    getProtocolAssets.mockResolvedValue([
      storedAsset({ assetId: 'key-1', name: 'Key', type: 'apikey', data: 'k' }),
    ]);
    getProtocolByHash.mockResolvedValue(
      storedProtocolWithManifest({
        'key-1': { type: 'apikey', name: 'Key' },
      }),
    );

    const resolved = await buildResolvedAssets(HASH);

    expect(resolved[0]?.source).toBeUndefined();
    expect(resolved[0]?.value).toBe('k');
  });
});
