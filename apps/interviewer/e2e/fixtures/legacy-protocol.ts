import JSZip from 'jszip';

import type { Protocol } from '@codaco/protocol-validation';

import type { LegacySeed } from '../helpers/legacy-database.js';

// A schema 8 protocol as Interviewer 8 keeps it, with one image asset and one
// unfinished interview: small enough to read at a glance and valid enough to
// upgrade. Its `name` is part of the document because schema 8 requires one.

export const LEGACY_PROTOCOL_NAME = 'Legacy Study';
// Interviewer stores a protocol under the sha256 of its content; any
// 64-hex-character value passes the hash checks on both sides.
export const LEGACY_PROTOCOL_HASH = 'c0ffee'.padEnd(64, '0');
const LEGACY_SESSION_ID = '5f0e3c1a-9d2b-4e8f-a6c7-1b2d3e4f5a6b';

const IMAGE_ASSET_ID = 'map';
const IMAGE_FILE_NAME = 'map.png';
// A PNG signature: enough for a Blob that must survive byte for byte.
const PNG_BYTES = [137, 80, 78, 71, 13, 10, 26, 10];

function legacyProtocol(name = LEGACY_PROTOCOL_NAME): Protocol<8> {
  return {
    schemaVersion: 8,
    name,
    description: 'Run in Interviewer 8',
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

/** Interviewer 8's library holding `legacyProtocol` and one interview. */
export function legacyLibrarySeed(): LegacySeed {
  const protocol = legacyProtocol();
  return {
    protocols: [
      {
        id: LEGACY_PROTOCOL_HASH,
        hash: LEGACY_PROTOCOL_HASH,
        name: protocol.name,
        schemaVersion: 8,
        importedAt: '2026-01-01T00:00:00.000Z',
        description: protocol.description,
        codebook: protocol.codebook,
        protocol,
      },
    ],
    sessions: [
      {
        id: LEGACY_SESSION_ID,
        protocolHash: LEGACY_PROTOCOL_HASH,
        protocolName: protocol.name,
        caseId: 'legacy-case',
        startedAt: '2026-01-07T10:00:00.000Z',
        lastUpdatedAt: '2026-01-07T10:30:00.000Z',
        finishedAt: null,
        exportedAt: null,
        currentStep: 0,
        network: { ego: { _uid: 'ego', attributes: {} }, nodes: [], edges: [] },
      },
    ],
    assets: [
      {
        id: `${LEGACY_PROTOCOL_HASH}::${IMAGE_ASSET_ID}`,
        protocolHash: LEGACY_PROTOCOL_HASH,
        assetId: IMAGE_ASSET_ID,
        name: IMAGE_FILE_NAME,
        type: 'image',
        mimeType: 'image/png',
        bytes: PNG_BYTES,
      },
    ],
  };
}

/** `legacyProtocol` packed as a `.netcanvas` file. */
export async function legacyNetcanvas(name?: string): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('protocol.json', JSON.stringify(legacyProtocol(name)));
  zip.file(`assets/${IMAGE_FILE_NAME}`, new Uint8Array(PNG_BYTES));
  return await zip.generateAsync({ type: 'nodebuffer' });
}
