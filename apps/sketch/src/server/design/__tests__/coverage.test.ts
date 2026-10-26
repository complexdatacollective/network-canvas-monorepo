// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { coverageDesign } from '../__fixtures__/cases.ts';
import { buildProtocol, preflight } from '../build.ts';
import { GEOJSON_ASSET_ID, MAPBOX_ASSET_ID } from '../compile.ts';
import { buildWordingRequest } from '../feedback.ts';
import { worldCountriesGeojson } from '../world-countries.ts';
import {
  NOW,
  parseDesign,
  readFixture,
  readJsonFixture,
  stageTypes,
} from './helpers.ts';

// Every compiled stage type Sketch can emit.
const EMITTED_TYPES = [
  'AlterEdgeForm',
  'AlterForm',
  'CategoricalBin',
  'DyadCensus',
  'EgoForm',
  'FinishSession',
  'Geospatial',
  'Information',
  'NameGenerator',
  'NameGeneratorQuickAdd',
  'NameGeneratorRoster',
  'Narrative',
  'NetworkComposer',
  'OneToManyDyadCensus',
  'OrdinalBin',
  'Sociogram',
  'TieStrengthCensus',
];

describe('the coverage design', () => {
  const design = parseDesign(coverageDesign);

  it('validates and emits every stage type Sketch supports', async () => {
    const result = await buildProtocol(design, null, { now: NOW });
    expect(
      result.validation.success,
      JSON.stringify(result.validation.error?.issues),
    ).toBe(true);
    expect(result.retry).toBe(false);
    expect([...new Set(stageTypes(result.protocol))].toSorted()).toEqual(
      EMITTED_TYPES,
    );
    expect(result.protocol).toEqual(readJsonFixture('coverage.protocol.json'));
  });

  it('places consent first when the design has no welcome screen', async () => {
    const { protocol, stageMap } = await preflight(design, { now: NOW });
    expect(stageMap[0]).toEqual({ added: 'researcher notes' });
    expect(stageMap[1]).toEqual({ added: 'consent' });
    expect(protocol.stages[1]?.id).toBe('consent');
  });

  it('returns the roster, map token and GeoJSON assets', async () => {
    const { assets, protocol, summary } = await preflight(design, {
      now: NOW,
    });
    expect(assets.map((a) => [a.id, a.name, a.mimeType])).toEqual([
      ['classmates_roster', 'classmates_roster.csv', 'text/csv'],
      [GEOJSON_ASSET_ID, 'world-countries.geojson', 'application/geo+json'],
    ]);
    expect(assets[0]?.content).toBe(
      readFixture('coverage.classmates_roster.csv'),
    );
    expect(assets[1]?.content).toBe(worldCountriesGeojson());
    expect(Object.keys(protocol.assetManifest ?? {}).toSorted()).toEqual(
      ['classmates_roster', GEOJSON_ASSET_ID, MAPBOX_ASSET_ID].toSorted(),
    );
    expect(summary.rosterCount).toBe(1);
    expect(summary.nodeTypes).toEqual(['Classmate', 'Place', 'Mentor']);
    expect(summary.edgeTypes).toEqual([
      'Friends',
      'Study together',
      'In conflict',
      'Mentors know each other',
    ]);
  });

  it('uses a GeoJSON the caller supplies', async () => {
    const worldGeojson = '{"type":"FeatureCollection","features":[]}';
    const { assets } = await preflight(design, { now: NOW, worldGeojson });
    expect(assets.find((a) => a.id === GEOJSON_ASSET_ID)?.content).toBe(
      worldGeojson,
    );
  });

  it('asks the writer for the golden wording request', async () => {
    const { design: normalized } = await preflight(design, { now: NOW });
    expect(buildWordingRequest(normalized)).toEqual(
      readJsonFixture('coverage.wording-request.json'),
    );
  });
});
