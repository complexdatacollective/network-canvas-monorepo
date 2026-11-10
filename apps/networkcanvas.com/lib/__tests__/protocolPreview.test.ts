import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import JSZip from 'jszip';
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

/**
 * Gallery protocols schema 9 refuses: each has a stage name longer than a
 * stage name may be. Network Canvas does not shorten a name; the protocol's
 * authors do, in the version of Architect that made it, so these are not
 * edited here and cannot be previewed until they are.
 */
const REFUSED_GALLERY_PROTOCOLS = [
  'GATE_10-22-2025.netcanvas',
  'ROBUST_10-22-2025.netcanvas',
  'SNAAPS_v1.0.netcanvas',
  'Test-to-PrEP_10-22-2025.netcanvas',
];

describe('installPreviewProtocol', () => {
  it('installs every shipped gallery protocol at the Shell schema version', async () => {
    const protocols = await loadProtocolGallery();
    const refused: string[] = [];

    for (const protocol of protocols) {
      for (const download of protocol.downloads) {
        const bytes = new Uint8Array(
          await readFile(join(assetDirectory, download.protocolFilename)),
        );
        const result = await installPreviewProtocol(
          bytes,
          download.protocolFilename,
        );

        if (REFUSED_GALLERY_PROTOCOLS.includes(download.protocolFilename)) {
          expect(result, download.protocolFilename).toEqual({
            ok: false,
            reason: 'invalid',
          });
          refused.push(download.protocolFilename);
          continue;
        }

        expect(result.ok, download.protocolFilename).toBe(true);
        if (!result.ok) continue;

        const { install } = result;
        expect(install.protocol.schemaVersion).toBe(
          COMPATIBLE_PROTOCOL_SCHEMA_VERSION,
        );
        // A gallery protocol older than schema 9 gains the finish stage the
        // v8 → v9 migration appends, and an Information stage before each
        // stage other than an Ego Form that had an introduction panel, named
        // after that stage.
        const downloadTypes = download.stages.map(({ type }) => type);
        const migrated = install.protocol.stages;
        const authored = migrated.filter(
          (stage, index) =>
            !(
              stage.type === 'Information' &&
              stage.id === `${migrated[index + 1]?.id}-introduction`
            ),
        );
        expect(authored.map(({ type }) => type)).toEqual(
          downloadTypes.at(-1) === 'FinishSession'
            ? downloadTypes
            : [...downloadTypes, 'FinishSession'],
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

    // Each listed protocol is still in the gallery, so none is listed stale.
    expect(refused.toSorted()).toEqual(REFUSED_GALLERY_PROTOCOLS.toSorted());
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
    expect(first.session).not.toHaveProperty('localePreference');
    expect(first.session).not.toHaveProperty('locale');
    expect(first.session.localeOptions.map(({ locale }) => locale)).toEqual(
      first.protocol.localization.locales,
    );
  });

  it('reports a protocol from a newer version as an unsupported version', async () => {
    const zip = new JSZip();
    zip.file(
      'protocol.json',
      JSON.stringify({
        schemaVersion: COMPATIBLE_PROTOCOL_SCHEMA_VERSION + 1,
        name: 'From the future',
      }),
    );
    const result = await installPreviewProtocol(
      await zip.generateAsync({ type: 'uint8array' }),
      'future.netcanvas',
    );
    expect(result).toEqual({ ok: false, reason: 'unsupported-version' });
  });

  it('reports bytes that are not an archive as unreadable', async () => {
    const result = await installPreviewProtocol(
      new TextEncoder().encode('not a zip'),
      'broken.netcanvas',
    );
    expect(result).toEqual({ ok: false, reason: 'unreadable' });
  });
});
