import { readFileSync } from 'node:fs';
import path from 'node:path';

import JSZip from 'jszip';

import type { Protocol } from '@codaco/protocol-validation';

import type { SeedAsset } from './seed.js';

// A protocol as Architect 8 saves it: schema 8, with one image resource, small
// enough to read at a glance and valid enough to upgrade. Its `name` is part of
// the document because schema 8 requires one (the 7→8 migration added it).
//
// The image is an SVG so the seeded resource can travel as text across
// `page.evaluate` (see `SeedAsset.data`).

const IMAGE_ASSET_ID = 'map';
const IMAGE_FILE_NAME = 'map.svg';

const imageSvg = readFileSync(
  path.join(import.meta.dirname, 'files', 'background-image.svg'),
  'utf8',
);

export function legacyProtocol(name: string): Protocol<8> {
  return {
    schemaVersion: 8,
    name,
    description: 'Made in Architect 8',
    codebook: {
      node: {
        person: {
          name: 'Person',
          color: 'node-color-seq-1',
          shape: { default: 'circle' },
          variables: { nickname: { name: 'nickname', type: 'text' } },
        },
      },
    },
    assetManifest: {
      [IMAGE_ASSET_ID]: {
        id: IMAGE_ASSET_ID,
        type: 'image',
        name: 'Map',
        source: IMAGE_FILE_NAME,
      },
    },
    stages: [
      {
        id: 'welcome',
        type: 'Information',
        label: 'Welcome',
        title: 'Welcome',
        items: [
          { id: 'intro', type: 'text', content: 'Hello' },
          { id: 'map', type: 'asset', content: IMAGE_ASSET_ID },
        ],
      },
    ],
  };
}

/** The resource rows Architect 8 keeps beside `legacyProtocol`'s row. */
export const legacyProtocolAssets: SeedAsset[] = [
  { assetId: IMAGE_ASSET_ID, name: IMAGE_FILE_NAME, data: imageSvg },
];

/** `legacyProtocol` packed as a `.netcanvas` file, as Architect 8 exports it. */
export async function legacyNetcanvas(name: string): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('protocol.json', JSON.stringify(legacyProtocol(name)));
  zip.file(`assets/${IMAGE_FILE_NAME}`, imageSvg);
  return await zip.generateAsync({ type: 'nodebuffer' });
}
