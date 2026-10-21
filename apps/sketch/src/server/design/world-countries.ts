// The world-countries GeoJSON that Geospatial stages map onto (country level,
// feature property `name`). It is a copy of
// `packages/protocols/templates/transnational-networks/assets/world-countries.geojson`
// (212 KB, minified), stored as `.json` because Netlify's function bundler
// (esbuild) has a loader for JSON but none for `.geojson`.
// `__tests__/world-countries.test.ts` fails if the two copies drift.
import worldCountries from './assets/world-countries.json' with { type: 'json' };

let serialized: string | undefined;

/** The GeoJSON as the text of a `.geojson` asset file, serialised once. */
export const worldCountriesGeojson = (): string => {
  serialized ??= JSON.stringify(worldCountries);
  return serialized;
};
