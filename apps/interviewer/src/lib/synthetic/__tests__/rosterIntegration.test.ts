import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { AssetData } from '@codaco/protocol-utilities';
import { generateInterviews } from '@codaco/protocol-utilities';
import { CurrentProtocolSchema } from '@codaco/protocol-validation';
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

const { loadSyntheticAssetData } = await import('../loadAssetData');

const ASSET_DIR = resolve(
  import.meta.dirname,
  '../../../../../../packages/protocols/development/assets/',
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

// The generation boundary re-parses the stored document, so everything the
// engine reads here — every stage's `synthetic` descriptor included — comes
// from the schema rather than from this test.
const parsedProtocol = CurrentProtocolSchema.parse(developmentProtocol);

/** One seeded interview over the real protocol, with real asset content. */
function generateOneSession(seed: number, assetData: AssetData) {
  const [result] = generateInterviews(
    parsedProtocol,
    { count: 1, seed, simulateDropOut: false },
    assetData,
  );
  expect(result).toBeDefined();
  return result!.session;
}

beforeAll(() => {
  const manifest = developmentProtocol.assetManifest ?? {};
  const assets: StoredAsset[] = [];

  for (const [assetId, entry] of Object.entries(manifest)) {
    if (entry.type !== 'network' && entry.type !== 'geojson') continue;
    if (!('source' in entry)) continue;
    const bytes = readFileSync(resolve(ASSET_DIR, entry.source));
    const url = `blob:${assetId}`;
    bytesByUrl.set(url, bytes);
    assets.push({
      id: `${HASH}::${assetId}`,
      protocolHash: HASH,
      assetId,
      name: entry.name,
      type: entry.type,
      data: new Blob([new Uint8Array(bytes)]),
    });
  }

  const urlByBlob = new Map<unknown, string>();
  assets.forEach((a, i) => urlByBlob.set(a.data, [...bytesByUrl.keys()][i]!));

  // Subclass rather than spread so URL stays constructible (jsdom builds
  // `new URL(...)` internally); vi.unstubAllGlobals then restores it.
  class StubURL extends URL {}
  vi.stubGlobal(
    'URL',
    Object.assign(StubURL, {
      createObjectURL: (blob: unknown) => urlByBlob.get(blob) ?? 'blob:unknown',
      revokeObjectURL: () => undefined,
    }),
  );
  vi.stubGlobal('fetch', (url: string) => {
    const bytes = bytesByUrl.get(url);
    if (!bytes) return Promise.reject(new Error(`No bytes for ${url}`));
    return Promise.resolve(new Response(bytes.toString('utf8')));
  });

  getProtocolAssets.mockResolvedValue(assets);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe('synthetic generation over the real Development Protocol', () => {
  it('parses every roster-backed stage from the real asset files', async () => {
    const { rosterNodes } = await loadSyntheticAssetData(storedProtocol());

    expect(Object.keys(rosterNodes ?? {}).toSorted()).toEqual([
      'namegen1',
      'namegen1a',
      'namegenroster1',
      'namegenroster2',
      'namegenroster2a',
      'namegenroster3',
    ]);

    expect(rosterNodes!.namegenroster1).toHaveLength(6);
    expect(rosterNodes!.namegenroster2a!.length).toBeGreaterThan(200);

    expect(rosterNodes!.namegen1).toHaveLength(1);
  });

  it('maps roster columns onto real codebook variable ids', async () => {
    const { rosterNodes } = await loadSyntheticAssetData(storedProtocol());

    const person = rosterNodes!.namegenroster1![0]!;
    expect(person.type).toBe('person_node_type');

    const nameVariable = Object.entries(
      developmentProtocol.codebook.node!.person_node_type!.variables!,
    ).find(([, v]) => v.name === 'nickname')![0];

    const attributes = person[entityAttributesProperty];
    expect(Object.keys(attributes)).toContain(nameVariable);
  });

  it('collects the map answers a Geospatial stage can produce', async () => {
    const { geojsonPropertyValues } =
      await loadSyntheticAssetData(storedProtocol());

    // The stage's `targetFeatureProperty` off every feature of its GeoJSON —
    // exactly the values a tap inside a selectable area can store.
    expect(Object.keys(geojsonPropertyValues ?? {})).toEqual([
      'geospatial-dev',
    ]);
    const areas = geojsonPropertyValues!['geospatial-dev']!;
    expect(areas.length).toBeGreaterThan(0);
    expect(areas.every((value) => typeof value === 'string')).toBe(true);
  });

  it('builds sessions whose roster people come from the real rosters', async () => {
    const assetData = await loadSyntheticAssetData(storedProtocol());

    const session = generateOneSession(42, assetData);

    const rosterKeys = new Set(
      Object.values(assetData.rosterNodes ?? {})
        .flat()
        .map((n) => n[entityPrimaryKeyProperty]),
    );

    const venueNodes = session.network.nodes.filter(
      (n) => n.type === 'venue_node_type' && n.stageId === 'namegenroster2a',
    );
    expect(venueNodes.length).toBeGreaterThan(0);
    for (const node of venueNodes) {
      expect(rosterKeys.has(node[entityPrimaryKeyProperty])).toBe(true);
    }
  });

  it('places alters only on areas the real map offers', async () => {
    const assetData = await loadSyntheticAssetData(storedProtocol());
    const stage = parsedProtocol.stages.find((s) => s.id === 'geospatial-dev');
    const areas = new Set(assetData.geojsonPropertyValues!['geospatial-dev']!);

    const session = generateOneSession(42, assetData);

    // The map's `targetFeatureProperty` says which property is read off the
    // tapped feature; the prompt says which variable the answer is stored in.
    const variable = (stage as unknown as { prompts: { variable: string }[] })
      .prompts[0]!.variable;
    const placements = session.network.nodes
      .map((node) => node[entityAttributesProperty][variable])
      .filter((value): value is string => typeof value === 'string');

    expect(placements.length).toBeGreaterThan(0);
    for (const placement of placements) {
      // Either a real area from the researcher's map, or the one word the
      // interface writes for a tap that landed outside them all.
      expect(
        areas.has(placement) || placement === 'outside-selectable-areas',
      ).toBe(true);
    }
  });

  it('never reuses one person across the stages sharing a roster', async () => {
    const assetData = await loadSyntheticAssetData(storedProtocol());

    const session = generateOneSession(7, assetData);

    const shared = new Set(
      assetData.rosterNodes!.namegenroster1!.map(
        (n) => n[entityPrimaryKeyProperty],
      ),
    );
    const drawn = session.network.nodes
      .map((n) => n[entityPrimaryKeyProperty])
      .filter((key) => shared.has(key));

    expect(drawn.length).toBeGreaterThan(0);
    expect(new Set(drawn).size).toBe(drawn.length);
    expect(drawn.length).toBeLessThanOrEqual(6);
  });

  it('refuses when the host resolved none of the protocol’s sources', async () => {
    getProtocolAssets.mockResolvedValueOnce([]);

    const assetData = await loadSyntheticAssetData(storedProtocol());
    // Every stage's source failed to resolve, so no stage contributes a key —
    // an unresolved pool, which the engine distinguishes from an empty one.
    expect(assetData).toEqual({ rosterNodes: {}, geojsonPropertyValues: {} });

    // A participating host whose sources all failed is an unresolved-pool
    // state, and a roster stage carrying a min-nodes floor refuses pre-seed
    // with a conflict naming the stage (D18): the researcher gets an
    // actionable screen instead of a batch that quietly violates the
    // protocol they wrote.
    expect(() => generateOneSession(42, assetData)).toThrow(/NG HIV Services/);
  });
});
