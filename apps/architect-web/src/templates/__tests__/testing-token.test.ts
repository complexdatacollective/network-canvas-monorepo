import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { TESTING_MAPBOX_TOKEN } from '../testingMapboxToken';

const here = dirname(fileURLToPath(import.meta.url));
// src/templates/__tests__ -> repo root
const repoRoot = resolve(here, '../../../../..');
const templateDir = resolve(repoRoot, 'templates', 'transnational-networks');

type ManifestAsset = {
  id: string;
  name: string;
  type: string;
  value?: string;
  source?: string;
};

type MapOptions = {
  tokenAssetId?: string;
  dataSourceAssetId?: string;
  targetFeatureProperty?: string;
};

type Protocol = {
  assetManifest: Record<string, ManifestAsset>;
  stages: { type: string; mapOptions?: MapOptions }[];
};

const readJson = (path: string): unknown =>
  JSON.parse(readFileSync(path, 'utf8'));

// Validate both the canonical source and the Architect-bundled copy so the
// embedded token / asset wiring can't drift between them (bundled-sync keeps
// them byte-identical, but assert it here too so this guard is self-contained).
const cases = [
  {
    name: 'canonical source',
    protocol: readJson(resolve(templateDir, 'protocol.json')) as Protocol,
  },
  {
    name: 'Architect-bundled copy',
    protocol: readJson(
      resolve(
        repoRoot,
        'apps',
        'architect-web',
        'src',
        'templates',
        'transnational-networks.json',
      ),
    ) as Protocol,
  },
];

describe.each(cases)(
  'transnational-networks template embeds working geospatial assets ($name)',
  ({ protocol }) => {
    const geospatialMapOptions = protocol.stages.find(
      (stage) => stage.type === 'Geospatial',
    )?.mapOptions;

    it('contains the testing Mapbox token as an apikey asset, matching the shared constant', () => {
      const usesTestingToken = Object.values(protocol.assetManifest).some(
        (asset) =>
          asset.type === 'apikey' && asset.value === TESTING_MAPBOX_TOKEN,
      );

      expect(usesTestingToken).toBe(true);
    });

    it('points the geospatial stage at manifest entries that exist', () => {
      expect(geospatialMapOptions).toBeDefined();
      if (!geospatialMapOptions) return;

      const { tokenAssetId, dataSourceAssetId } = geospatialMapOptions;
      expect(tokenAssetId).toBeDefined();
      expect(dataSourceAssetId).toBeDefined();
      if (!tokenAssetId || !dataSourceAssetId) return;

      expect(protocol.assetManifest[tokenAssetId]?.type).toBe('apikey');
      expect(protocol.assetManifest[dataSourceAssetId]?.type).toBe('geojson');
    });

    it('bundles a GeoJSON whose features expose the targetFeatureProperty', () => {
      expect(geospatialMapOptions).toBeDefined();
      if (!geospatialMapOptions) return;

      const { dataSourceAssetId, targetFeatureProperty } = geospatialMapOptions;
      expect(dataSourceAssetId).toBeDefined();
      expect(targetFeatureProperty).toBeDefined();
      if (!dataSourceAssetId || !targetFeatureProperty) return;

      const source = protocol.assetManifest[dataSourceAssetId]?.source;
      expect(source).toBeDefined();
      if (!source) return;

      // The asset file physically lives alongside the canonical template; the
      // bundled copy references it by the same `source` filename.
      const geojson = readJson(resolve(templateDir, 'assets', source)) as {
        features: { properties: Record<string, unknown> }[];
      };

      expect(geojson.features.length).toBeGreaterThan(0);
      expect(
        geojson.features.every(
          (feature) => feature.properties[targetFeatureProperty] != null,
        ),
      ).toBe(true);
    });
  },
);
