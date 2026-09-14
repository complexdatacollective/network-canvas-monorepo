import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';

import {
  createNetcanvasReader,
  type CurrentProtocol,
  describeProtocolFileError,
} from '@codaco/protocol-validation';
import { partitionProtocolAssets } from '~/utils/protocolImport';

const protocolWith = (
  assetManifest: CurrentProtocol['assetManifest'],
): CurrentProtocol =>
  ({
    name: 'Archive read fixture',
    schemaVersion: 8,
    codebook: { node: {}, edge: {}, ego: {} },
    stages: [],
    assetManifest,
  }) as unknown as CurrentProtocol;

const archiveOf = async (protocol: unknown, assets: Record<string, string>) => {
  const zip = new JSZip();
  zip.file('protocol.json', JSON.stringify(protocol));
  for (const [source, contents] of Object.entries(assets)) {
    zip.file(`assets/${source}`, contents);
  }
  return JSZip.loadAsync(await zip.generateAsync({ type: 'uint8array' }));
};

describe('bounded protocol archive read failures', () => {
  it('identifies a decompression failure as damaged file contents', async () => {
    const protocol = protocolWith({
      photo: { type: 'image', name: 'Portrait', source: 'photo.png' },
    });
    const zip = await archiveOf(protocol, { 'photo.png': 'fixture' });

    // Corrupt the stored asset so inflating it fails, rather than mocking the
    // read: the reader inflates through `internalStream`, so a stub on
    // `async` would not be on the path under test and the assertion would
    // pass whether or not the failure is classified.
    const entry = zip.file('assets/photo.png');
    if (!entry) throw new Error('The fixture must contain its asset');
    (
      entry as unknown as { _data: { compressedContent: Uint8Array } }
    )._data.compressedContent = new Uint8Array([0xff, 0xff, 0xff, 0xff]);

    const reader = createNetcanvasReader(zip);

    await expect(reader.readAssets()).rejects.toSatisfy(
      (error: unknown) =>
        describeProtocolFileError(error) ===
        "This protocol's contents are damaged and cannot be read. Try a backup, or the copy you originally downloaded.",
    );
  });

  it('spends one inflation budget across the protocol and its assets', async () => {
    const protocol = protocolWith({
      photo: { type: 'image', name: 'Portrait', source: 'photo.png' },
    });
    const zip = await archiveOf(protocol, { 'photo.png': 'x'.repeat(400) });

    const reader = createNetcanvasReader(zip, 500);
    await reader.readProtocol();

    // The protocol JSON alone fits, and the asset alone fits, but together
    // they do not: a per-read cap would let this archive through.
    await expect(reader.readAssets()).rejects.toThrow(
      /expands to more data than can be opened safely/,
    );
  });
});

describe('partitionProtocolAssets', () => {
  it('names a file asset by the manifest source and keeps apikeys out of the uploads', () => {
    const protocol = protocolWith({
      photo: { type: 'image', name: 'Portrait', source: 'photo.png' },
      token: { type: 'apikey', name: 'Map token', value: 'pk.secret' },
    });

    const { fileAssets, apikeyAssets } = partitionProtocolAssets(protocol, [
      { id: 'photo', name: 'Portrait', data: new Blob(['bytes']) },
      { id: 'token', name: 'Map token', data: 'pk.secret' },
    ]);

    expect(fileAssets).toHaveLength(1);
    expect(fileAssets[0]).toMatchObject({
      assetId: 'photo',
      name: 'photo.png',
      type: 'image',
    });
    expect(fileAssets[0]?.file.name).toBe('photo.png');

    expect(apikeyAssets).toEqual([
      {
        assetId: 'token',
        key: 'token',
        name: 'Map token',
        type: 'apikey',
        url: '',
        size: 0,
        value: 'pk.secret',
      },
    ]);
  });

  it('drops extracted bytes the validated manifest no longer lists', () => {
    const protocol = protocolWith({
      photo: { type: 'image', name: 'Portrait', source: 'photo.png' },
    });

    const { fileAssets } = partitionProtocolAssets(protocol, [
      { id: 'photo', name: 'Portrait', data: new Blob(['bytes']) },
      { id: 'removed-by-upgrade', name: 'Gone', data: new Blob(['bytes']) },
    ]);

    expect(fileAssets.map((asset) => asset.assetId)).toEqual(['photo']);
  });
});
