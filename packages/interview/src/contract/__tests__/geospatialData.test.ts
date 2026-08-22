import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  asEntityAttributeReference,
  DEFAULT_RESPONSE_BURDEN,
  type Stage,
} from '@codaco/protocol-validation';

import { collectGeospatialPropertyValues } from '../geospatialData';
import type { ResolvedRosterAsset, ResolveRosterAsset } from '../rosterData';

/**
 * What the helper is claimed to do: read a Geospatial stage's GeoJSON and
 * report the values its map can put in a session, with the three-way key
 * contract the roster sibling established (rows present / known empty / source
 * unresolved).
 */

const REGIONS = JSON.stringify({
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { name: 'Downtown', code: 12 } },
    { type: 'Feature', properties: { name: 'Uptown', code: 13 } },
    // A repeat of a name already seen: one selectable area, listed twice.
    { type: 'Feature', properties: { name: 'Downtown', code: 14 } },
  ],
});

const EMPTY_COLLECTION = JSON.stringify({
  type: 'FeatureCollection',
  features: [],
});

function geospatialStage(
  id: string,
  assetId: string,
  targetFeatureProperty = 'name',
): Stage {
  return {
    id,
    label: 'Where?',
    type: 'Geospatial',
    // Schema-injected generation metadata: a parsed stage always carries it,
    // and nothing in this helper reads it.
    synthetic: {
      generatesData: true,
      responseBurden: DEFAULT_RESPONSE_BURDEN.Geospatial,
    },
    subject: { entity: 'node', type: 'venue' },
    mapOptions: {
      tokenAssetId: 'mapbox-token',
      style: 'mapbox://styles/mapbox/standard',
      center: [-74, 40.7],
      initialZoom: 10,
      dataSourceAssetId: assetId,
      color: '#3399ff',
      targetFeatureProperty,
    },
    prompts: [
      {
        id: 'p1',
        text: 'Where is this place?',
        variable: asEntityAttributeReference('var-location'),
      },
    ],
  };
}

function stubFetch(bodiesByUrl: Record<string, string>) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      if (url === 'stub://broken') {
        return Promise.reject(new Error('unreachable'));
      }
      const body = bodiesByUrl[url];
      if (body === undefined) {
        return Promise.reject(new Error(`no stub body for ${url}`));
      }
      return Promise.resolve(new Response(body));
    }),
  );
}

function resolved(
  assetId: string,
  overrides?: Partial<ResolvedRosterAsset>,
): ResolvedRosterAsset {
  return {
    url: `stub://${assetId}`,
    sourceFileName: `${assetId}.geojson`,
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('collectGeospatialPropertyValues', () => {
  it('plucks the map’s target feature property off every feature', async () => {
    stubFetch({ 'stub://regions': REGIONS });
    const cleanup = vi.fn();
    const resolveAsset: ResolveRosterAsset = vi
      .fn()
      .mockResolvedValue(resolved('regions', { cleanup }));

    const result = await collectGeospatialPropertyValues({
      stages: [geospatialStage('geo-1', 'regions')],
      resolveAsset,
    });

    expect(result).toEqual({ 'geo-1': ['Downtown', 'Uptown'] });
    // Cleanup runs after a successful read too, not only on failure.
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('reads whichever property the stage’s map names', async () => {
    stubFetch({ 'stub://regions': REGIONS });
    const resolveAsset: ResolveRosterAsset = vi
      .fn()
      .mockResolvedValue(resolved('regions'));

    const result = await collectGeospatialPropertyValues({
      // `code` is a number on every feature, so it describes no answer this
      // pool can carry.
      stages: [geospatialStage('geo-1', 'regions', 'code')],
      resolveAsset,
    });

    expect(result).toEqual({ 'geo-1': [] });
  });

  it('emits an empty pool for a map with no selectable areas', async () => {
    stubFetch({ 'stub://regions': EMPTY_COLLECTION });
    const resolveAsset: ResolveRosterAsset = vi
      .fn()
      .mockResolvedValue(resolved('regions'));

    const result = await collectGeospatialPropertyValues({
      stages: [geospatialStage('geo-1', 'regions')],
      resolveAsset,
    });

    expect(result).toEqual({ 'geo-1': [] });
    expect(Object.hasOwn(result, 'geo-1')).toBe(true);
  });

  it('omits a stage whose asset the host cannot resolve', async () => {
    stubFetch({});
    const resolveAsset: ResolveRosterAsset = vi.fn().mockResolvedValue(null);

    const result = await collectGeospatialPropertyValues({
      stages: [geospatialStage('geo-1', 'regions')],
      resolveAsset,
    });

    expect(result).toEqual({});
  });

  it('omits a stage whose asset cannot be fetched', async () => {
    stubFetch({});
    const resolveAsset: ResolveRosterAsset = vi
      .fn()
      .mockResolvedValue(resolved('broken'));

    const result = await collectGeospatialPropertyValues({
      stages: [geospatialStage('geo-1', 'regions')],
      resolveAsset,
    });

    expect(result).toEqual({});
  });

  it('fetches one shared map once, for every stage reading it the same way', async () => {
    stubFetch({ 'stub://regions': REGIONS });
    const fetchSpy = vi.fn().mockResolvedValue(resolved('regions'));
    const resolveAsset: ResolveRosterAsset = fetchSpy;

    const result = await collectGeospatialPropertyValues({
      stages: [
        geospatialStage('geo-1', 'regions'),
        geospatialStage('geo-2', 'regions'),
      ],
      resolveAsset,
    });

    expect(result).toEqual({
      'geo-1': ['Downtown', 'Uptown'],
      'geo-2': ['Downtown', 'Uptown'],
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('ignores every stage that is not a map', async () => {
    const resolveAsset: ResolveRosterAsset = vi.fn();

    const result = await collectGeospatialPropertyValues({
      stages: [
        {
          id: 'info',
          label: 'Welcome',
          title: 'Welcome',
          type: 'Information',
          synthetic: {
            generatesData: false,
            responseBurden: DEFAULT_RESPONSE_BURDEN.Information,
          },
          items: [],
        },
      ],
      resolveAsset,
    });

    expect(result).toEqual({});
    expect(resolveAsset).not.toHaveBeenCalled();
  });
});
