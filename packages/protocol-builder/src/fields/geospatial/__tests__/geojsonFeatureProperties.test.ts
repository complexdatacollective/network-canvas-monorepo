import { describe, expect, it } from 'vitest';

import { geoJsonFeatureProperties } from '../geojsonFeatureProperties.ts';

const bytesOf = (value: unknown): Uint8Array =>
  new TextEncoder().encode(
    typeof value === 'string' ? value : JSON.stringify(value),
  );

const read = (value: unknown) => geoJsonFeatureProperties(bytesOf(value));

describe('the properties a map layer offers', () => {
  it('lists every property of a feature collection, in the order it meets them', () => {
    const result = read({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { name: 'Bushwick', tract: '0435' },
          geometry: { type: 'Point', coordinates: [0, 0] },
        },
      ],
    });

    expect(result).toEqual({ unreadable: false, names: ['name', 'tract'] });
  });

  /**
   * A union rather than an intersection: a layer whose features are not
   * uniform is a layer the researcher has to see the whole of, and a property
   * missing from some features is a problem only visible if it is offered.
   */
  it('offers a property some features are missing', () => {
    const result = read({
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: { name: 'Bushwick' } },
        {
          type: 'Feature',
          properties: { name: 'Ridgewood', borough: 'Queens' },
        },
      ],
    });

    expect(result).toEqual({
      unreadable: false,
      names: ['name', 'borough'],
    });
  });

  it('reads a lone feature as well as a collection', () => {
    expect(read({ type: 'Feature', properties: { postcode: 'E8' } })).toEqual({
      unreadable: false,
      names: ['postcode'],
    });
  });

  it('reports a layer whose features carry no properties at all', () => {
    expect(
      read({
        type: 'FeatureCollection',
        features: [{ type: 'Feature', geometry: null }],
      }),
    ).toEqual({ unreadable: false, names: [] });
  });

  it('refuses what it cannot read as GeoJSON', () => {
    expect(read('not json at all')).toEqual({ unreadable: true });
    expect(read([1, 2, 3])).toEqual({ unreadable: true });
    expect(read({ type: 'FeatureCollection' })).toEqual({ unreadable: true });
    expect(read({ nodes: [], edges: [] })).toEqual({ unreadable: true });
    // The placeholder body a host serves for a resource it holds no bytes for.
    expect(read({})).toEqual({ unreadable: true });
  });
});
