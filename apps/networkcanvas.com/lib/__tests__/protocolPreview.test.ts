import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { COMPATIBLE_PROTOCOL_SCHEMA_VERSION } from '@codaco/interview/protocol-schema-version';
import { loadProtocolGallery } from '~/lib/protocolGallery';
import {
  createPreviewPayload,
  installPreviewProtocol,
} from '~/lib/protocolPreview';

const assetDirectory = join(
  process.cwd(),
  'public',
  'protocols',
  'protocol-gallery',
);

describe('installPreviewProtocol', () => {
  it('installs every shipped gallery protocol at the Shell schema version', async () => {
    const protocols = await loadProtocolGallery();

    for (const protocol of protocols) {
      for (const download of protocol.downloads) {
        const bytes = new Uint8Array(
          await readFile(join(assetDirectory, download.protocolFilename)),
        );
        const result = await installPreviewProtocol(
          bytes,
          download.protocolFilename,
        );

        expect(result.ok, download.protocolFilename).toBe(true);
        if (!result.ok) continue;

        const { install } = result;
        expect(install.protocol.schemaVersion).toBe(
          COMPATIBLE_PROTOCOL_SCHEMA_VERSION,
        );
        expect(install.protocol.stages.map(({ type }) => type)).toEqual(
          download.stages.map(({ type }) => type),
        );
        expect(install.protocol.hash).toMatch(/\S/);
        expect(install.protocol.assets.map(({ assetId }) => assetId)).toEqual(
          Array.from(install.assets.keys()),
        );
        for (const asset of install.protocol.assets) {
          const data = install.assets.get(asset.assetId);
          if (asset.type === 'apikey') {
            expect(typeof data).toBe('string');
          } else {
            expect(data).toBeInstanceOf(Blob);
          }
        }
      }
    }
  });

  it('starts a fresh session for each preview run', async () => {
    const [protocol] = await loadProtocolGallery();
    const download = protocol?.downloads[0];
    if (!download) throw new Error('gallery has no protocols');

    const result = await installPreviewProtocol(
      new Uint8Array(
        await readFile(join(assetDirectory, download.protocolFilename)),
      ),
      download.protocolFilename,
    );
    if (!result.ok) throw new Error(result.reason);

    const first = createPreviewPayload(result.install);
    const second = createPreviewPayload(result.install);

    expect(first.protocol).toBe(second.protocol);
    expect(first.session.id).not.toBe(second.session.id);
    expect(first.session.finishTime).toBeNull();
    expect(first.session.network.ego).toBeDefined();
  });

  it('reports bytes that are not an archive as unreadable', async () => {
    const result = await installPreviewProtocol(
      new TextEncoder().encode('not a zip'),
      'broken.netcanvas',
    );
    expect(result).toEqual({ ok: false, reason: 'unreadable' });
  });
});
