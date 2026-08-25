import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import { entityAttributesProperty } from '@codaco/shared-consts';

const getAssetById = vi.fn();
vi.mock('~/utils/assetUtils', () => ({
  getAssetById: (...args: unknown[]) => getAssetById(...args),
}));

const {
  collectSyntheticAssetData,
  collectSyntheticGeospatialData,
  collectSyntheticRosterData,
  makeAssetResolver,
} = await import('../syntheticAssetData');

const PROTOCOL_ID = 'protocol-1';
const PEOPLE_CSV = 'Name,Age\nAda,36\nGrace,45\nAlan,41\n';
const REGIONS_GEOJSON = JSON.stringify({
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { region: 'North' }, geometry: null },
    { type: 'Feature', properties: { region: 'South' }, geometry: null },
  ],
});

// One object URL per kind of blob, so the `fetch` stub below can answer with
// the body the caller actually asked for when a protocol carries both.
const createObjectURL = vi.fn((blob: unknown) =>
  blob instanceof Blob && blob.type === 'application/geo+json'
    ? 'blob:geojson'
    : 'blob:roster',
);
const revokeObjectURL = vi.fn();

function csvBlob(): Blob {
  return new Blob([PEOPLE_CSV], { type: 'text/csv' });
}

function geojsonBlob(): Blob {
  return new Blob([REGIONS_GEOJSON], { type: 'application/geo+json' });
}

function makeProtocol(
  overrides: Partial<CurrentProtocol> = {},
): CurrentProtocol {
  return {
    name: 'T',
    description: '',
    schemaVersion: 8,
    stages: [],
    codebook: {
      node: {
        person: {
          variables: {
            'var-name': { name: 'Name', type: 'text' },
            'var-age': { name: 'Age', type: 'number' },
          },
        },
      },
      edge: {},
      ego: {},
    },
    assetManifest: {
      roster: {
        id: 'roster',
        type: 'network',
        name: 'People',
        source: 'people.csv',
      },
    },
    ...overrides,
  } as unknown as CurrentProtocol;
}

const rosterStage = {
  id: 'stage-ngr',
  label: 'Roster',
  type: 'NameGeneratorRoster',
  subject: { entity: 'node', type: 'person' },
  dataSource: 'roster',
  prompts: [{ id: 'p1', text: 'Pick people' }],
};

const geospatialStage = {
  id: 'stage-geo',
  label: 'Where',
  type: 'Geospatial',
  subject: { entity: 'node', type: 'person' },
  mapOptions: {
    dataSourceAssetId: 'regions',
    targetFeatureProperty: 'region',
  },
  prompts: [{ id: 'p2', text: 'Where do they live?' }],
};

const GEOJSON_MANIFEST_ENTRY = {
  id: 'regions',
  type: 'geojson',
  name: 'Regions',
  source: 'regions.geojson',
};

beforeEach(() => {
  vi.clearAllMocks();
  // Subclass rather than spread so URL stays constructible (jsdom builds
  // `new URL(...)` internally); vi.unstubAllGlobals then restores it.
  class StubURL extends URL {}
  vi.stubGlobal(
    'URL',
    Object.assign(StubURL, { createObjectURL, revokeObjectURL }),
  );
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      Promise.resolve(
        new Response(url === 'blob:geojson' ? REGIONS_GEOJSON : PEOPLE_CSV),
      ),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('makeAssetResolver', () => {
  it('resolves a network asset to an object URL with the manifest source filename', async () => {
    getAssetById.mockResolvedValue({
      id: 'roster',
      name: 'People',
      data: csvBlob(),
    });

    const resolve = makeAssetResolver(makeProtocol(), PROTOCOL_ID, ['network']);
    const resolved = await resolve('roster');

    expect(resolved).not.toBeNull();
    expect(resolved!.url).toBe('blob:roster');
    expect(resolved!.sourceFileName).toBe('people.csv');
    expect(getAssetById).toHaveBeenCalledWith('roster', PROTOCOL_ID);

    resolved!.cleanup?.();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:roster');
  });

  it('returns null for a non-network manifest entry without touching the store', async () => {
    const protocol = makeProtocol({
      assetManifest: {
        roster: {
          id: 'roster',
          type: 'image',
          name: 'Logo',
          source: 'logo.png',
        },
      },
    } as unknown as Partial<CurrentProtocol>);

    const resolve = makeAssetResolver(protocol, PROTOCOL_ID, ['network']);

    expect(await resolve('roster')).toBeNull();
    expect(getAssetById).not.toHaveBeenCalled();
  });

  it('resolves a geojson asset only for a resolver that allows geojson', async () => {
    const protocol = makeProtocol({
      assetManifest: { regions: GEOJSON_MANIFEST_ENTRY },
    } as unknown as Partial<CurrentProtocol>);
    getAssetById.mockResolvedValue({
      id: 'regions',
      name: 'Regions',
      data: geojsonBlob(),
    });

    // The collectors see nothing but a URL, so a resolver that handed a map to
    // the roster parser would be indistinguishable from a corrupt CSV.
    expect(
      await makeAssetResolver(protocol, PROTOCOL_ID, ['network'])('regions'),
    ).toBeNull();
    expect(getAssetById).not.toHaveBeenCalled();

    const resolved = await makeAssetResolver(protocol, PROTOCOL_ID, [
      'geojson',
      'network',
    ])('regions');
    expect(resolved?.url).toBe('blob:geojson');
    expect(resolved?.sourceFileName).toBe('regions.geojson');
  });

  it('resolves a network manifest entry for the geospatial allow-list', async () => {
    // The schema lets `mapOptions.dataSourceAssetId` name a `geojson` OR a
    // `network` asset, so the geospatial resolver must accept both kinds.
    getAssetById.mockResolvedValue({
      id: 'roster',
      name: 'People',
      data: geojsonBlob(),
    });

    const resolved = await makeAssetResolver(makeProtocol(), PROTOCOL_ID, [
      'geojson',
      'network',
    ])('roster');

    expect(resolved?.url).toBe('blob:geojson');
    expect(resolved?.sourceFileName).toBe('people.csv');
  });

  it('returns null when the manifest has no entry for the asset', async () => {
    const protocol = makeProtocol({
      assetManifest: {},
    } as unknown as Partial<CurrentProtocol>);

    const resolve = makeAssetResolver(protocol, PROTOCOL_ID, ['network']);

    expect(await resolve('roster')).toBeNull();
    expect(getAssetById).not.toHaveBeenCalled();
  });

  it('returns null when the asset is missing from the store', async () => {
    getAssetById.mockResolvedValue(undefined);

    const resolve = makeAssetResolver(makeProtocol(), PROTOCOL_ID, ['network']);

    expect(await resolve('roster')).toBeNull();
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('returns null when the stored asset data is a string rather than a blob', async () => {
    getAssetById.mockResolvedValue({
      id: 'roster',
      name: 'People',
      data: 'inline-data',
    });

    const resolve = makeAssetResolver(makeProtocol(), PROTOCOL_ID, ['network']);

    expect(await resolve('roster')).toBeNull();
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('fails soft to null when the store lookup throws', async () => {
    getAssetById.mockRejectedValue(new Error('storage unavailable'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const resolve = makeAssetResolver(makeProtocol(), PROTOCOL_ID, ['network']);

    expect(await resolve('roster')).toBeNull();
    expect(console.error).toHaveBeenCalled();
  });
});

describe('collectSyntheticRosterData', () => {
  it('builds external data keyed by stage from the protocol rosters', async () => {
    getAssetById.mockResolvedValue({
      id: 'roster',
      name: 'People',
      data: csvBlob(),
    });

    const protocol = makeProtocol({
      stages: [rosterStage],
    } as unknown as Partial<CurrentProtocol>);
    const result = await collectSyntheticRosterData(protocol, PROTOCOL_ID);

    expect(result['stage-ngr']).toHaveLength(3);
    const [first] = result['stage-ngr']!;
    expect(first!.type).toBe('person');
    expect(first![entityAttributesProperty]['var-name']).toBe('Ada');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:roster');
  });

  it('returns {} when a roster asset cannot be resolved', async () => {
    getAssetById.mockResolvedValue(undefined);

    const protocol = makeProtocol({
      stages: [rosterStage],
    } as unknown as Partial<CurrentProtocol>);
    const result = await collectSyntheticRosterData(protocol, PROTOCOL_ID);

    expect(result).toEqual({});
  });

  it('fails soft to {} and logs when collection itself throws', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    // A draft stage engineered to throw the moment collection reads its `type`,
    // standing in for the half-built shapes previews can produce.
    const explodingStage = {
      id: 'boom',
      label: 'Boom',
      get type(): string {
        throw new Error('stage read failed');
      },
    };
    const protocol = makeProtocol({
      stages: [explodingStage],
    } as unknown as Partial<CurrentProtocol>);

    const result = await collectSyntheticRosterData(protocol, PROTOCOL_ID);

    expect(result).toEqual({});
    expect(consoleError).toHaveBeenCalled();
  });
});

describe('collectSyntheticGeospatialData', () => {
  it('builds the answer pool keyed by stage from the protocol GeoJSON', async () => {
    getAssetById.mockResolvedValue({
      id: 'regions',
      name: 'Regions',
      data: geojsonBlob(),
    });

    const protocol = makeProtocol({
      stages: [geospatialStage],
      assetManifest: { regions: GEOJSON_MANIFEST_ENTRY },
    } as unknown as Partial<CurrentProtocol>);
    const result = await collectSyntheticGeospatialData(protocol, PROTOCOL_ID);

    expect(result['stage-geo']).toEqual(['North', 'South']);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:geojson');
  });

  it('omits the stage entirely when its map asset cannot be resolved', async () => {
    getAssetById.mockResolvedValue(undefined);

    const protocol = makeProtocol({
      stages: [geospatialStage],
      assetManifest: { regions: GEOJSON_MANIFEST_ENTRY },
    } as unknown as Partial<CurrentProtocol>);
    const result = await collectSyntheticGeospatialData(protocol, PROTOCOL_ID);

    // An absent key is what generation reads as "no pool was supplied" and
    // fabricates for; an empty array would claim the map has no areas at all.
    expect(result).toEqual({});
  });

  it('builds the answer pool from a map asset manifest-typed network', async () => {
    // `mapOptions.dataSourceAssetId` may reference a `network` asset as well
    // as a `geojson` one (schema allowedTypes), so a preview must resolve it.
    getAssetById.mockResolvedValue({
      id: 'regions',
      name: 'Regions',
      data: geojsonBlob(),
    });

    const protocol = makeProtocol({
      stages: [geospatialStage],
      assetManifest: {
        regions: {
          id: 'regions',
          type: 'network',
          name: 'Regions',
          source: 'regions.json',
        },
      },
    } as unknown as Partial<CurrentProtocol>);
    const result = await collectSyntheticGeospatialData(protocol, PROTOCOL_ID);

    expect(result['stage-geo']).toEqual(['North', 'South']);
  });
});

describe('collectSyntheticAssetData', () => {
  it('resolves roster people and map answers from the same protocol', async () => {
    getAssetById.mockImplementation((assetId: string) =>
      Promise.resolve(
        assetId === 'regions'
          ? { id: 'regions', name: 'Regions', data: geojsonBlob() }
          : { id: 'roster', name: 'People', data: csvBlob() },
      ),
    );

    const protocol = makeProtocol({
      stages: [rosterStage, geospatialStage],
      assetManifest: {
        roster: {
          id: 'roster',
          type: 'network',
          name: 'People',
          source: 'people.csv',
        },
        regions: GEOJSON_MANIFEST_ENTRY,
      },
    } as unknown as Partial<CurrentProtocol>);

    const assetData = await collectSyntheticAssetData(protocol, PROTOCOL_ID);

    expect(assetData.rosterNodes?.['stage-ngr']).toHaveLength(3);
    expect(assetData.geojsonPropertyValues?.['stage-geo']).toEqual([
      'North',
      'South',
    ]);
  });

  it('yields empty pools rather than throwing when a protocol has no assets', async () => {
    const assetData = await collectSyntheticAssetData(
      makeProtocol({
        assetManifest: {},
      } as unknown as Partial<CurrentProtocol>),
      PROTOCOL_ID,
    );

    expect(assetData).toEqual({ rosterNodes: {}, geojsonPropertyValues: {} });
    expect(getAssetById).not.toHaveBeenCalled();
  });
});
