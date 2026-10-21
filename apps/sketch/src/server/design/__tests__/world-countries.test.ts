// @vitest-environment node
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { worldCountriesGeojson } from '../world-countries.ts';

// The canonical copy, shipped with the transnational-networks template.
const CANONICAL = new URL(
  '../../../../../../packages/protocols/templates/transnational-networks/assets/world-countries.geojson',
  import.meta.url,
);

type FeatureCollection = {
  type: string;
  features: { properties: { name?: unknown } }[];
};

describe('the bundled world-countries GeoJSON', () => {
  it('matches the copy in @codaco/protocols', () => {
    expect(JSON.parse(worldCountriesGeojson())).toEqual(
      JSON.parse(readFileSync(CANONICAL, 'utf8')),
    );
  });

  it('names every country in the property Geospatial stages target', () => {
    const geojson = JSON.parse(worldCountriesGeojson()) as FeatureCollection;
    expect(geojson.type).toBe('FeatureCollection');
    expect(geojson.features.length).toBeGreaterThan(150);
    for (const feature of geojson.features)
      expect(typeof feature.properties.name).toBe('string');
  });
});
