import JSZip from 'jszip';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';

import { bundleProtocol } from '../bundleProtocol';

const getAssetById = vi.fn();

vi.mock('../assetUtils', () => ({
  getAssetById: (...args: unknown[]) => getAssetById(...args),
}));

const asset = (
  type: 'image' | 'video' | 'audio' | 'network' | 'geojson',
  source: string,
  name: string,
) => ({
  type,
  source,
  name,
});

const makeProtocol = (
  assetManifest: CurrentProtocol['assetManifest'],
): CurrentProtocol =>
  ({
    name: 'test',
    schemaVersion: 8,
    stages: [],
    codebook: { node: {}, edge: {}, ego: {} },
    assetManifest,
  }) as CurrentProtocol;

describe('bundleProtocol', () => {
  beforeEach(() => {
    getAssetById.mockReset();
  });

  it('gives same-named assets distinct, collision-free zip entries (F09)', async () => {
    const protocol = makeProtocol({
      'id-1': asset('image', 'photo.jpg', 'First photo'),
      'id-2': asset('image', 'photo.jpg', 'Second photo'),
    });

    getAssetById.mockImplementation((id: string) =>
      Promise.resolve({ data: new Blob([`bytes-${id}`]) }),
    );

    const { blob, skippedAssets } = await bundleProtocol(protocol);
    expect(skippedAssets).toEqual([]);

    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const exported = JSON.parse(
      (await zip.file('protocol.json')?.async('string')) ?? '{}',
    ) as CurrentProtocol;

    // Both assets survive with distinct sources pointing at distinct entries.
    const source1 = exported.assetManifest?.['id-1'];
    const source2 = exported.assetManifest?.['id-2'];
    expect(source1).toHaveProperty('source');
    expect(source2).toHaveProperty('source');
    const s1 = (source1 as { source: string }).source;
    const s2 = (source2 as { source: string }).source;
    expect(s1).not.toBe(s2);

    // Each rewritten source resolves to its own bytes in the zip (round-trip).
    expect(await zip.file(`assets/${s1}`)?.async('string')).toBe('bytes-id-1');
    expect(await zip.file(`assets/${s2}`)?.async('string')).toBe('bytes-id-2');
  });

  it('skips unresolvable assets and reports them instead of throwing (F10)', async () => {
    const protocol = makeProtocol({
      'id-ok': asset('image', 'good.jpg', 'Good asset'),
      'id-missing': asset('image', 'gone.jpg', 'Missing asset'),
    });

    getAssetById.mockImplementation((id: string) =>
      id === 'id-ok'
        ? Promise.resolve({ data: new Blob(['ok-bytes']) })
        : Promise.resolve(undefined),
    );

    const { blob, skippedAssets } = await bundleProtocol(protocol);

    expect(skippedAssets).toEqual([
      { id: 'id-missing', name: 'Missing asset' },
    ]);

    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const exported = JSON.parse(
      (await zip.file('protocol.json')?.async('string')) ?? '{}',
    ) as CurrentProtocol;

    // The resolvable asset is exported; the missing one is dropped from the
    // manifest so the file re-imports cleanly.
    expect(exported.assetManifest?.['id-ok']).toBeDefined();
    expect(exported.assetManifest?.['id-missing']).toBeUndefined();
  });

  it('keeps apikey manifest entries without bundling a file', async () => {
    const protocol = makeProtocol({
      'id-key': { type: 'apikey', value: 'secret', name: 'Mapbox' },
    } as CurrentProtocol['assetManifest']);

    const { blob, skippedAssets } = await bundleProtocol(protocol);
    expect(skippedAssets).toEqual([]);
    expect(getAssetById).not.toHaveBeenCalled();

    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const exported = JSON.parse(
      (await zip.file('protocol.json')?.async('string')) ?? '{}',
    ) as CurrentProtocol;
    expect(exported.assetManifest?.['id-key']).toEqual({
      type: 'apikey',
      value: 'secret',
      name: 'Mapbox',
    });
  });
});
