import JSZip from 'jszip';

import type { Protocol } from '@codaco/protocol-validation';

import type { Interviewer8Seed } from '../helpers/legacy-database.js';

// A schema 8 protocol as Interviewer 8 keeps it in the shared database, with
// one image asset, one unfinished interview and one finished one: small enough
// to read at a glance and valid enough to upgrade. Its `name` is part of the
// document because schema 8 requires one. The rows are in Interviewer 8's own
// format (its `saveProtocol` and `createSession`), unencrypted, as a device
// with no lock has them.

export const LEGACY_PROTOCOL_NAME = 'Legacy Study';
// Interviewer stores a protocol under the sha256 of its content; any
// 64-hex-character value passes the hash checks on both sides.
export const LEGACY_PROTOCOL_HASH = 'c0ffee'.padEnd(64, '0');
/** The unfinished interview. */
export const LEGACY_SESSION_ID = '5f0e3c1a-9d2b-4e8f-a6c7-1b2d3e4f5a6b';
/** The finished interview, whose network holds one person. */
export const LEGACY_FINISHED_SESSION_ID =
  '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
/** The name given to the one person in the finished interview. */
export const LEGACY_NODE_NICKNAME = 'Ada from schema 8';

const IMAGE_ASSET_ID = 'map';
const IMAGE_FILE_NAME = 'map.png';
// A PNG signature: enough for a Blob that must survive byte for byte.
const PNG_BYTES = [137, 80, 78, 71, 13, 10, 26, 10];

function legacyProtocol(name = LEGACY_PROTOCOL_NAME): Protocol<8> {
  return {
    schemaVersion: 8,
    name,
    description: 'A schema 8 study',
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

/** An 8.x device's rows: `legacyProtocol`, its asset and two interviews. */
export function legacyLibrarySeed(): Interviewer8Seed {
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
        isSynthetic: false,
      },
      {
        id: LEGACY_FINISHED_SESSION_ID,
        protocolHash: LEGACY_PROTOCOL_HASH,
        protocolName: protocol.name,
        caseId: 'legacy-finished',
        startedAt: '2026-01-08T10:00:00.000Z',
        lastUpdatedAt: '2026-01-08T10:40:00.000Z',
        finishedAt: '2026-01-08T10:40:00.000Z',
        exportedAt: null,
        currentStep: 0,
        network: {
          ego: { _uid: 'ego', attributes: {} },
          nodes: [
            {
              _uid: 'node-ada',
              type: 'person',
              attributes: { nickname: LEGACY_NODE_NICKNAME },
            },
          ],
          edges: [],
        },
        isSynthetic: false,
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
