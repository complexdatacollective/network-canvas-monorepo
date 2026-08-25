import { readFileSync } from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type CurrentProtocol,
  CurrentProtocolSchema,
} from '@codaco/protocol-validation';
import { entityAttributesProperty } from '@codaco/shared-consts';
import { collectSyntheticAssetData } from '~/lib/synthetic/assetData';
import {
  parseStoredProtocol,
  type StoredProtocolAsset,
} from '~/lib/synthetic/storedProtocol';

/**
 * The bundled all-interfaces protocol, which carries both asset-backed stages
 * generation has to resolve for: a `NameGeneratorRoster` reading a `network`
 * asset, and a `Geospatial` stage whose map is a `geojson` asset (plus the
 * apikey token beside it). Driving the real document rather than a hand-built
 * stage means the stages under test are exactly the shapes the schema produces.
 */
const FIXTURE_DIR = path.resolve(
  import.meta.dirname,
  '../../../../../packages/protocols/e2e/all-interfaces',
);

const readFixture = (relativePath: string) =>
  readFileSync(path.join(FIXTURE_DIR, relativePath), 'utf8');

const ROSTER_STAGE = 'name-generator-roster-1';
const GEOSPATIAL_STAGE = 'geospatial-1';

const ROSTER_URL = 'https://storage.test/roster.json';
const GEOJSON_URL = 'https://storage.test/regions.geojson';

/**
 * The rows Fresco's import wrote for this protocol's three manifest entries:
 * the manifest key in `assetId`, a file asset's manifest `source` in `name`,
 * and an apikey carrying its value with no URL at all.
 */
const STORED_ASSETS: StoredProtocolAsset[] = [
  {
    assetId: 'roster_data',
    name: 'roster.json',
    type: 'network',
    url: ROSTER_URL,
    value: null,
  },
  {
    assetId: 'geo_data',
    name: 'regions.geojson',
    type: 'geojson',
    url: GEOJSON_URL,
    value: null,
  },
  {
    assetId: 'mapbox_token',
    name: 'Mapbox Token',
    type: 'apikey',
    url: '',
    value: 'pk.test-token',
  },
];

const storedRecord = (assets: StoredProtocolAsset[]) => {
  // The stored columns, as Fresco's Prisma result extension hands them back:
  // `stages` and `codebook` parsed per field, with no manifest anywhere.
  const document = CurrentProtocolSchema.parse(
    JSON.parse(readFixture('protocol.json')),
  );

  return {
    name: document.name,
    description: document.description ?? null,
    lastModified: new Date('2026-08-01T09:00:00.000Z'),
    stages: document.stages,
    codebook: document.codebook,
    experiments: {},
    assets,
  };
};

const parseFixture = async (
  assets = STORED_ASSETS,
): Promise<CurrentProtocol> => {
  const result = await parseStoredProtocol(storedRecord(assets));
  if (!result.success) {
    throw new Error(`fixture did not parse: ${result.message}`);
  }
  return result.protocol;
};

const jsonResponse = (body: string) =>
  new Response(body, { headers: { 'Content-Type': 'application/json' } });

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockImplementation((input) => {
    const url = String(input);
    if (url === ROSTER_URL) {
      return Promise.resolve(jsonResponse(readFixture('assets/roster.json')));
    }
    if (url === GEOJSON_URL) {
      return Promise.resolve(
        jsonResponse(readFixture('assets/regions.geojson')),
      );
    }
    return Promise.reject(new Error(`unexpected fetch: ${url}`));
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('reassembling a stored protocol', () => {
  it('rebuilds the asset manifest the stored stages reference', async () => {
    const protocol = await parseFixture();

    // Every asset-backed cross-reference resolved, which is the whole point of
    // rebuilding the manifest: without it the roster and map stages below would
    // have failed validation instead of parsing.
    expect(protocol.assetManifest?.roster_data).toStrictEqual({
      id: 'roster_data',
      name: 'roster.json',
      type: 'network',
      source: 'roster.json',
    });
    expect(protocol.assetManifest?.mapbox_token).toStrictEqual({
      id: 'mapbox_token',
      name: 'Mapbox Token',
      type: 'apikey',
      value: 'pk.test-token',
    });
  });

  it('produces the parse output the engine refuses to run without', async () => {
    const protocol = await parseFixture();

    // The reason the boundary re-parses at all: a stage's `synthetic`
    // descriptor exists because parsing put it there, and `generateInterviews`
    // throws on a stage that has none rather than re-defaulting one.
    expect(protocol.stages.length).toBeGreaterThan(0);
    expect(
      protocol.stages.filter(
        (stage) => (stage as { synthetic?: unknown }).synthetic === undefined,
      ),
    ).toStrictEqual([]);
  });

  it('refuses, naming the stage, when a referenced asset was never stored', async () => {
    const result = await parseStoredProtocol(
      storedRecord(
        STORED_ASSETS.filter((asset) => asset.assetId !== 'roster_data'),
      ),
    );

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.message).toContain('roster_data');
    expect(result.message).toContain('does not reference an asset');
  });
});

describe('collecting host-resolved asset data', () => {
  it('resolves each stage a pool from the asset its manifest entry names', async () => {
    const protocol = await parseFixture();

    const assetData = await collectSyntheticAssetData(protocol, STORED_ASSETS);

    const roster = assetData.rosterNodes?.[ROSTER_STAGE];
    expect(roster).toHaveLength(3);
    expect(
      roster?.map((node) => node[entityAttributesProperty].name),
    ).toStrictEqual(['Amara', 'Beto', 'Chidi']);

    // The map's answers are the distinct values of the property the stage's
    // `targetFeatureProperty` names, in document order.
    expect(assetData.geojsonPropertyValues?.[GEOSPATIAL_STAGE]).toStrictEqual([
      'Downtown',
      'Uptown',
    ]);

    // The apikey row has no URL and is never fetched; the two file assets are.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('leaves a stage unresolved — no key — when its asset cannot be fetched', async () => {
    const protocol = await parseFixture();
    fetchMock.mockImplementation((input) =>
      String(input) === ROSTER_URL
        ? Promise.reject(new Error('storage unavailable'))
        : Promise.resolve(jsonResponse(readFixture('assets/regions.geojson'))),
    );

    const assetData = await collectSyntheticAssetData(protocol, STORED_ASSETS);

    // Absent, not empty: an empty pool would claim the researcher's roster has
    // nobody in it, which is a different thing from not having read it.
    expect(assetData.rosterNodes).not.toHaveProperty(ROSTER_STAGE);
    expect(assetData.geojsonPropertyValues?.[GEOSPATIAL_STAGE]).toStrictEqual([
      'Downtown',
      'Uptown',
    ]);
  });

  it('leaves a stage unresolved when no stored asset matches its manifest entry', async () => {
    const protocol = await parseFixture();
    const misnamed = STORED_ASSETS.map((asset) =>
      asset.assetId === 'roster_data'
        ? { ...asset, assetId: 'roster_data_v2', name: 'roster-v2.json' }
        : asset,
    );

    const assetData = await collectSyntheticAssetData(protocol, misnamed);

    expect(assetData.rosterNodes).not.toHaveProperty(ROSTER_STAGE);
    expect(fetchMock).not.toHaveBeenCalledWith(ROSTER_URL);
  });

  it('leaves a stage unresolved when the stored asset is not a kind it can read', async () => {
    const protocol = await parseFixture();
    const wrongType = STORED_ASSETS.map((asset) =>
      asset.assetId === 'roster_data' ? { ...asset, type: 'image' } : asset,
    );

    const assetData = await collectSyntheticAssetData(protocol, wrongType);

    expect(assetData.rosterNodes).not.toHaveProperty(ROSTER_STAGE);
  });

  it('leaves a stage unresolved when the stored asset has no URL to read', async () => {
    const protocol = await parseFixture();
    const notUploaded = STORED_ASSETS.map((asset) =>
      asset.assetId === 'roster_data' ? { ...asset, url: '' } : asset,
    );

    const assetData = await collectSyntheticAssetData(protocol, notUploaded);

    expect(assetData.rosterNodes).not.toHaveProperty(ROSTER_STAGE);
    // Skipped outright rather than fetched: a row with no URL is a stored
    // asset that never landed, not an address worth asking for.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(GEOJSON_URL);
  });
});
