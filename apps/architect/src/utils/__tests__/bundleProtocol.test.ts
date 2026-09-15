import JSZip from 'jszip';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';

import { bundleProtocol, UnresolvedAssetsError } from '../bundleProtocol';

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

    const blob = await bundleProtocol(protocol);

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

  it('disambiguates distinct ids that sanitise to the same entry name (F09)', async () => {
    // `photo 1` and `photo/1` both reduce to the safe stem `photo_1`, so a
    // naive per-id sanitiser would emit `photo_1.jpg` twice and lose one
    // asset's bytes to JSZip last-write-wins.
    const protocol = makeProtocol({
      'photo 1': asset('image', 'a.jpg', 'Space id'),
      'photo/1': asset('image', 'b.jpg', 'Slash id'),
    });

    getAssetById.mockImplementation((id: string) =>
      Promise.resolve({ data: new Blob([`bytes-${id}`]) }),
    );

    const blob = await bundleProtocol(protocol);

    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const exported = JSON.parse(
      (await zip.file('protocol.json')?.async('string')) ?? '{}',
    ) as CurrentProtocol;

    const manifest = exported.assetManifest ?? {};
    const s1 = (manifest['photo 1'] as { source: string }).source;
    const s2 = (manifest['photo/1'] as { source: string }).source;

    // Distinct entry names, and each resolves to its own bytes (no overwrite).
    expect(s1).not.toBe(s2);
    expect(await zip.file(`assets/${s1}`)?.async('string')).toBe(
      'bytes-photo 1',
    );
    expect(await zip.file(`assets/${s2}`)?.async('string')).toBe(
      'bytes-photo/1',
    );

    // Exactly two files were written to the assets folder — nothing clobbered.
    const assetEntries = Object.keys(zip.files).filter(
      (path) => path.startsWith('assets/') && !zip.files[path]?.dir,
    );
    expect(assetEntries).toHaveLength(2);
  });

  it('refuses to write a file when an asset cannot be read (F10)', async () => {
    const protocol = makeProtocol({
      'id-ok': asset('image', 'good.jpg', 'Good asset'),
      'id-missing': asset('image', 'gone.jpg', 'Missing asset'),
    });

    getAssetById.mockImplementation((id: string) =>
      id === 'id-ok'
        ? Promise.resolve({ data: new Blob(['ok-bytes']) })
        : Promise.resolve(undefined),
    );

    // Omitting the asset would drop its manifest entry while the stages that
    // reference it keep pointing at the id, and the schema rejects a dangling
    // asset reference — so the "partial" file would not open anywhere.
    await expect(bundleProtocol(protocol)).rejects.toBeInstanceOf(
      UnresolvedAssetsError,
    );
  });

  it('names every unreadable asset, not just the first', async () => {
    const protocol = makeProtocol({
      'id-a': asset('image', 'a.jpg', 'First missing'),
      'id-b': asset('image', 'b.jpg', 'Second missing'),
    });

    getAssetById.mockResolvedValue(undefined);

    await expect(bundleProtocol(protocol)).rejects.toMatchObject({
      assetNames: ['First missing', 'Second missing'],
    });
  });

  it('refuses a non-apikey asset whose stored data is a string', async () => {
    const protocol = makeProtocol({
      'id-str': asset('image', 'weird.jpg', 'Stringy asset'),
    });

    getAssetById.mockImplementation(() =>
      Promise.resolve({ data: 'not-a-blob' }),
    );

    await expect(bundleProtocol(protocol)).rejects.toMatchObject({
      assetNames: ['Stringy asset'],
    });
  });

  it('keeps apikey manifest entries without bundling a file', async () => {
    const protocol = makeProtocol({
      'id-key': { type: 'apikey', value: 'secret', name: 'Mapbox' },
    } as CurrentProtocol['assetManifest']);

    const blob = await bundleProtocol(protocol);
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
