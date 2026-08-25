import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { entityAttributesProperty } from '@codaco/shared-consts';

import type { StoredAsset, StoredProtocol } from '../../db/types';

const getProtocolAssets = vi.fn();

vi.mock('../../db/api', () => ({
  getProtocolAssets: (...args: unknown[]) => getProtocolAssets(...args),
}));

const { loadSyntheticAssetData } = await import('../loadAssetData');

const HASH = 'protocol-hash';

const createObjectURL = vi.fn((_blob: unknown) => 'blob:roster');
const revokeObjectURL = vi.fn();

function csvBlob(body: string): Blob {
  return new Blob([body], { type: 'text/csv' });
}

const PEOPLE_CSV = 'Name,Age\nAda,36\nGrace,45\nAlan,41\n';

const REGIONS_GEOJSON = JSON.stringify({
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { area: 'Govan' }, geometry: null },
    { type: 'Feature', properties: { area: 'Partick' }, geometry: null },
  ],
});

function storedAsset(partial: Partial<StoredAsset>): StoredAsset {
  return {
    id: `${HASH}::${partial.assetId ?? 'roster'}`,
    protocolHash: HASH,
    assetId: partial.assetId ?? 'roster',
    name: partial.name ?? 'People',
    type: partial.type ?? 'network',
    data: partial.data ?? csvBlob(PEOPLE_CSV),
  };
}

function storedProtocol(
  stages: unknown[],
  manifest: Record<string, { type: string; name: string; source?: string }>,
): StoredProtocol {
  return {
    id: HASH,
    hash: HASH,
    name: 'Test',
    schemaVersion: 8,
    importedAt: new Date().toISOString(),
    codebook: {
      node: {
        person: {
          variables: {
            'var-name': { name: 'Name', type: 'text' },
            'var-age': { name: 'Age', type: 'number' },
          },
        },
      },
    },
    protocol: { stages, assetManifest: manifest },
  } as unknown as StoredProtocol;
}

function rosterStage(overrides?: Record<string, unknown>) {
  return {
    id: 'stage-ngr',
    label: 'Roster',
    type: 'NameGeneratorRoster',
    subject: { entity: 'node', type: 'person' },
    dataSource: 'roster',
    prompts: [{ id: 'p1', text: 'Pick people' }],
    ...overrides,
  };
}

function geospatialStage(overrides?: Record<string, unknown>) {
  return {
    id: 'stage-geo',
    label: 'Map',
    type: 'Geospatial',
    subject: { entity: 'node', type: 'person' },
    prompts: [{ id: 'p1', text: 'Where?', variable: 'var-area' }],
    mapOptions: {
      dataSourceAssetId: 'regions',
      targetFeatureProperty: 'area',
    },
    ...overrides,
  };
}

const MANIFEST = {
  roster: { type: 'network', name: 'People', source: 'people.csv' },
};

const MAP_MANIFEST = {
  regions: { type: 'geojson', name: 'Regions', source: 'regions.geojson' },
};

beforeEach(() => {
  vi.clearAllMocks();
  createObjectURL.mockReturnValue('blob:roster');
  // Subclass rather than spread so URL stays constructible (jsdom builds
  // `new URL(...)` internally); vi.unstubAllGlobals then restores it.
  class StubURL extends URL {}
  vi.stubGlobal(
    'URL',
    Object.assign(StubURL, { createObjectURL, revokeObjectURL }),
  );
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(PEOPLE_CSV))),
  );
  getProtocolAssets.mockResolvedValue([storedAsset({})]);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// These tests cover only the adapter's own responsibilities — joining stored
// assets to roster and map sources, gating on asset type/shape, the object-URL
// create/revoke lifecycle, and the source-filename choice. The parse, merge,
// and panel-filter semantics live in @codaco/interview and are tested there.
describe('loadSyntheticAssetData', () => {
  it('resolves a roster asset to an object URL and revokes it once parsed', async () => {
    const { rosterNodes } = await loadSyntheticAssetData(
      storedProtocol([rosterStage()], MANIFEST),
    );

    expect(rosterNodes!['stage-ngr']).toHaveLength(3);
    const [first] = rosterNodes!['stage-ngr']!;
    expect(first!.type).toBe('person');
    expect(first![entityAttributesProperty]['var-name']).toBe('Ada');
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:roster');
  });

  it('prefers the manifest source over the stored asset name as the parse filename', async () => {
    // The stored asset name would parse as JSON; only the manifest's
    // `people.csv` source yields the CSV parse that produces rows.
    getProtocolAssets.mockResolvedValue([storedAsset({ name: 'roster.json' })]);

    const { rosterNodes } = await loadSyntheticAssetData(
      storedProtocol([rosterStage()], MANIFEST),
    );

    expect(rosterNodes!['stage-ngr']).toHaveLength(3);
  });

  it('falls back to the stored asset name when the manifest has no source', async () => {
    getProtocolAssets.mockResolvedValue([storedAsset({ name: 'people.csv' })]);

    const { rosterNodes } = await loadSyntheticAssetData(
      storedProtocol([rosterStage()], {}),
    );

    expect(rosterNodes!['stage-ngr']).toHaveLength(3);
  });

  it('omits a stage whose roster asset is missing', async () => {
    getProtocolAssets.mockResolvedValue([]);

    const { rosterNodes } = await loadSyntheticAssetData(
      storedProtocol([rosterStage()], MANIFEST),
    );

    expect(rosterNodes).toEqual({});
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('omits a stage whose asset is not a network asset', async () => {
    getProtocolAssets.mockResolvedValue([storedAsset({ type: 'image' })]);

    const { rosterNodes } = await loadSyntheticAssetData(
      storedProtocol([rosterStage()], MANIFEST),
    );

    expect(rosterNodes).toEqual({});
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('omits a stage whose asset data is a string rather than a blob', async () => {
    getProtocolAssets.mockResolvedValue([storedAsset({ data: 'inline-data' })]);

    const { rosterNodes } = await loadSyntheticAssetData(
      storedProtocol([rosterStage()], MANIFEST),
    );

    expect(rosterNodes).toEqual({});
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('revokes the object URL even when parsing the asset fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('unreadable'))),
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const { rosterNodes } = await loadSyntheticAssetData(
      storedProtocol([rosterStage()], MANIFEST),
    );

    expect(rosterNodes).toEqual({});
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:roster');
  });

  it('still resolves to empty pools when the whole asset read fails', async () => {
    getProtocolAssets.mockRejectedValue(new Error('undecryptable asset'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await loadSyntheticAssetData(
      storedProtocol([rosterStage()], MANIFEST),
    );

    expect(result).toEqual({ rosterNodes: {}, geojsonPropertyValues: {} });
  });

  it('never reads protocol assets when no stage needs one', async () => {
    const result = await loadSyntheticAssetData(
      storedProtocol(
        [{ id: 'info', label: 'Info', type: 'Information', items: [] }],
        {},
      ),
    );

    expect(result).toEqual({ rosterNodes: {}, geojsonPropertyValues: {} });
    expect(getProtocolAssets).not.toHaveBeenCalled();
  });

  it("collects a map stage's selectable areas from its GeoJSON asset", async () => {
    getProtocolAssets.mockResolvedValue([
      storedAsset({
        assetId: 'regions',
        name: 'Regions',
        type: 'geojson',
        data: new Blob([REGIONS_GEOJSON], { type: 'application/json' }),
      }),
    ]);
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(REGIONS_GEOJSON))),
    );

    const { geojsonPropertyValues } = await loadSyntheticAssetData(
      storedProtocol([geospatialStage()], MAP_MANIFEST),
    );

    expect(geojsonPropertyValues!['stage-geo']).toEqual(['Govan', 'Partick']);
    expect(revokeObjectURL).toHaveBeenCalled();
  });

  it("collects a map stage's selectable areas from a network-typed asset", async () => {
    // The schema lets `mapOptions.dataSourceAssetId` name a `geojson` OR a
    // `network` asset, so a map backed by a network-typed GeoJSON file must
    // resolve rather than being silently omitted.
    getProtocolAssets.mockResolvedValue([
      storedAsset({
        assetId: 'regions',
        name: 'Regions',
        type: 'network',
        data: new Blob([REGIONS_GEOJSON], { type: 'application/json' }),
      }),
    ]);
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(REGIONS_GEOJSON))),
    );

    const { geojsonPropertyValues } = await loadSyntheticAssetData(
      storedProtocol([geospatialStage()], {
        regions: { type: 'network', name: 'Regions', source: 'regions.json' },
      }),
    );

    expect(geojsonPropertyValues!['stage-geo']).toEqual(['Govan', 'Partick']);
  });

  it('omits a map stage whose asset is neither geojson nor network', async () => {
    // Handing an arbitrary file to the map parser would invent areas nobody
    // drew, so the stored asset's own type gates it.
    getProtocolAssets.mockResolvedValue([
      storedAsset({ assetId: 'regions', name: 'Regions', type: 'image' }),
    ]);

    const { geojsonPropertyValues } = await loadSyntheticAssetData(
      storedProtocol([geospatialStage()], MAP_MANIFEST),
    );

    expect(geojsonPropertyValues).toEqual({});
  });

  it('resolves roster and map sources in one pass over the stored assets', async () => {
    getProtocolAssets.mockResolvedValue([
      storedAsset({}),
      storedAsset({
        assetId: 'regions',
        name: 'Regions',
        type: 'geojson',
        data: new Blob([REGIONS_GEOJSON], { type: 'application/json' }),
      }),
    ]);
    createObjectURL.mockImplementation((blob: unknown) =>
      (blob as Blob).type === 'application/json' ? 'blob:map' : 'blob:roster',
    );
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        Promise.resolve(
          new Response(url === 'blob:map' ? REGIONS_GEOJSON : PEOPLE_CSV),
        ),
      ),
    );

    const result = await loadSyntheticAssetData(
      storedProtocol([rosterStage(), geospatialStage()], {
        ...MANIFEST,
        ...MAP_MANIFEST,
      }),
    );

    expect(result.rosterNodes!['stage-ngr']).toHaveLength(3);
    expect(result.geojsonPropertyValues!['stage-geo']).toEqual([
      'Govan',
      'Partick',
    ]);
    // One read of the (decrypted) asset table, however many sources need it.
    expect(getProtocolAssets).toHaveBeenCalledOnce();
  });
});
