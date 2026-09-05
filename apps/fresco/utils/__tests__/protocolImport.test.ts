import JSZip from 'jszip';
import { describe, expect, it, vi } from 'vitest';

import { getProtocolAssets, getProtocolJson } from '~/utils/protocolImport';

describe('bounded protocol archive read failures', () => {
  it('identifies a protocol entry decompression failure as damaged file contents', async () => {
    const zip = new JSZip();
    zip.file('protocol.json', '{}');
    const entry = zip.file('protocol.json');
    if (!entry) throw new Error('The fixture must contain protocol.json');
    const read = vi
      .spyOn(entry, 'async')
      .mockRejectedValue(new Error('Invalid compressed data'));
    await expect(getProtocolJson(zip)).rejects.toThrow(
      "This protocol's contents are damaged and cannot be read. Try a backup, or the copy you originally downloaded.",
    );
    expect(read).toHaveBeenCalledWith('string');
  });

  it('identifies an asset decompression failure as damaged file contents', async () => {
    const zip = new JSZip();
    zip.file('assets/photo.png', 'fixture');
    const entry = zip.file('assets/photo.png');
    if (!entry) throw new Error('The fixture must contain its asset');
    const read = vi
      .spyOn(entry, 'async')
      .mockRejectedValue(new Error('Invalid compressed data'));
    await expect(
      getProtocolAssets(
        {
          name: 'Archive read fixture',
          schemaVersion: 8,
          codebook: { node: {}, edge: {}, ego: {} },
          stages: [],
          assetManifest: {
            photo: { type: 'image', name: 'Portrait', source: 'photo.png' },
          },
        },
        zip,
      ),
    ).rejects.toThrow(
      "This protocol's contents are damaged and cannot be read. Try a backup, or the copy you originally downloaded.",
    );
    expect(read).toHaveBeenCalledWith('blob');
  });
});
