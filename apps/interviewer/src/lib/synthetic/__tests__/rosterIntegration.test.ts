import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { beforeAll, describe, expect, it, vi } from 'vitest';

import { generateNetwork } from '@codaco/protocol-utilities';
import developmentProtocol from '@codaco/protocols/development';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
} from '@codaco/shared-consts';

import type { StoredAsset, StoredProtocol } from '../../db/types';

const getProtocolAssets = vi.fn();

vi.mock('../../db/api', () => ({
  getProtocolAssets: (...args: unknown[]) => getProtocolAssets(...args),
}));

const { loadRosterNodesForStages } = await import('../loadRosterData');

const ASSET_DIR = resolve(
  process.cwd(),
  '../../packages/protocols/development/assets/',
);

const HASH = 'development-hash';

const bytesByUrl = new Map<string, Buffer>();

function storedProtocol(): StoredProtocol {
  return {
    id: HASH,
    hash: HASH,
    name: 'Development Protocol',
    schemaVersion: 8,
    importedAt: new Date().toISOString(),
    codebook: developmentProtocol.codebook,
    protocol: developmentProtocol,
  } as unknown as StoredProtocol;
}

beforeAll(() => {
  const manifest = developmentProtocol.assetManifest ?? {};
  const assets: StoredAsset[] = [];

  for (const [assetId, entry] of Object.entries(manifest)) {
    if (entry.type !== 'network' || !('source' in entry)) continue;
    const bytes = readFileSync(resolve(ASSET_DIR, entry.source));
    const url = `blob:${assetId}`;
    bytesByUrl.set(url, bytes);
    assets.push({
      id: `${HASH}::${assetId}`,
      protocolHash: HASH,
      assetId,
      name: entry.name,
      type: 'network',
      data: new Blob([new Uint8Array(bytes)]),
    });
  }

  const urlByBlob = new Map<unknown, string>();
  assets.forEach((a, i) => urlByBlob.set(a.data, [...bytesByUrl.keys()][i]!));

  Object.assign(URL, {
    createObjectURL: (blob: unknown) => urlByBlob.get(blob) ?? 'blob:unknown',
    revokeObjectURL: () => undefined,
  });
  vi.stubGlobal('fetch', (url: string) => {
    const bytes = bytesByUrl.get(url);
    if (!bytes) return Promise.reject(new Error(`No bytes for ${url}`));
    return Promise.resolve(new Response(bytes.toString('utf8')));
  });

  getProtocolAssets.mockResolvedValue(assets);
});

describe('synthetic generation over the real Development Protocol', () => {
  it('parses every roster-backed stage from the real asset files', async () => {
    const externalData = await loadRosterNodesForStages(storedProtocol());

    expect(Object.keys(externalData).toSorted()).toEqual([
      'namegen1',
      'namegen1a',
      'namegenroster1',
      'namegenroster2',
      'namegenroster2a',
      'namegenroster3',
    ]);

    expect(externalData.namegenroster1).toHaveLength(6);
    expect(externalData.namegenroster2a!.length).toBeGreaterThan(200);

    expect(externalData.namegen1).toHaveLength(1);
  });

  it('maps roster columns onto real codebook variable ids', async () => {
    const externalData = await loadRosterNodesForStages(storedProtocol());

    const person = externalData.namegenroster1![0]!;
    expect(person.type).toBe('person_node_type');

    const nameVariable = Object.entries(
      developmentProtocol.codebook.node!.person_node_type!.variables!,
    ).find(([, v]) => v.name === 'nickname')![0];

    const attributes = person[entityAttributesProperty];
    expect(Object.keys(attributes)).toContain(nameVariable);
  });

  it('builds a network whose roster people come from the real rosters', async () => {
    const protocol = storedProtocol();
    const externalData = await loadRosterNodesForStages(protocol);

    const { network } = generateNetwork(
      protocol.codebook,
      protocol.protocol.stages,
      { seed: 42, externalData },
    );

    const rosterKeys = new Set(
      Object.values(externalData)
        .flat()
        .map((n) => n[entityPrimaryKeyProperty]),
    );

    const venueNodes = network.nodes.filter(
      (n) => n.type === 'venue_node_type' && n.stageId === 'namegenroster2a',
    );
    expect(venueNodes.length).toBeGreaterThan(0);
    for (const node of venueNodes) {
      expect(rosterKeys.has(node[entityPrimaryKeyProperty])).toBe(true);
    }
  });

  it('never reuses one person across the stages sharing a roster', async () => {
    const protocol = storedProtocol();
    const externalData = await loadRosterNodesForStages(protocol);

    const { network } = generateNetwork(
      protocol.codebook,
      protocol.protocol.stages,
      { seed: 7, externalData },
    );

    const shared = new Set(
      externalData.namegenroster1!.map((n) => n[entityPrimaryKeyProperty]),
    );
    const drawn = network.nodes
      .map((n) => n[entityPrimaryKeyProperty])
      .filter((key) => shared.has(key));

    expect(drawn.length).toBeGreaterThan(0);
    expect(new Set(drawn).size).toBe(drawn.length);
    expect(drawn.length).toBeLessThanOrEqual(6);
  });

  it('still generates when the protocol has no rosters at hand', async () => {
    getProtocolAssets.mockResolvedValueOnce([]);
    const protocol = storedProtocol();

    const externalData = await loadRosterNodesForStages(protocol);
    expect(externalData).toEqual({});

    const { network } = generateNetwork(
      protocol.codebook,
      protocol.protocol.stages,
      { seed: 42, externalData },
    );

    expect(network.nodes.length).toBeGreaterThan(0);
  });
});
