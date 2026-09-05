import { describe, expect, it } from 'vitest';

import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { attributeValidationIssues } from '../../validationAttribution.ts';
import {
  collectStageResourceReferences,
  findDanglingResourceReferences,
} from '../references.ts';

const geospatialStage: SectionDoc = {
  id: 'stage-1',
  type: 'Geospatial',
  label: 'Where do you meet?',
  subject: { entity: 'node', type: 'person' },
  mapOptions: {
    tokenAssetId: 'map-token',
    style: 'mapbox://styles/mapbox/standard',
    center: [0, 0],
    initialZoom: 8,
    dataSourceAssetId: 'map-layers',
    color: 'node-color-seq-1',
    targetFeatureProperty: 'name',
  },
  prompts: [],
};

const validManifest: SectionDoc = {
  'map-token': {
    type: 'apikey',
    id: 'map-token',
    name: 'Token',
    value: 'pk.1',
  },
  'map-layers': {
    type: 'geojson',
    id: 'map-layers',
    name: 'Layers',
    source: 'layers.geojson',
  },
};

describe('collectStageResourceReferences', () => {
  it('finds every tagged resource reference in a stage draft', () => {
    expect(collectStageResourceReferences(geospatialStage)).toEqual([
      { path: ['mapOptions', 'tokenAssetId'], resourceId: 'map-token' },
      { path: ['mapOptions', 'dataSourceAssetId'], resourceId: 'map-layers' },
    ]);
  });

  it('finds nothing in a stage that uses no resources', () => {
    expect(
      collectStageResourceReferences({
        id: 'stage-2',
        type: 'Information',
        label: 'Welcome',
        title: 'Welcome',
        items: [],
      }),
    ).toEqual([]);
  });
});

describe('findDanglingResourceReferences', () => {
  it('accepts references the committed manifest resolves', () => {
    expect(
      findDanglingResourceReferences({
        stageDocument: geospatialStage,
        manifestSection: validManifest,
      }),
    ).toEqual([]);
  });

  it('accepts a reference to a resource staged in this session', () => {
    const problems = findDanglingResourceReferences({
      stageDocument: geospatialStage,
      manifestSection: { 'map-token': validManifest['map-token'] },
      stagedResourceIds: ['map-layers'],
    });

    expect(problems).toEqual([]);
  });

  it('reports a reference that is neither committed nor staged', () => {
    const problems = findDanglingResourceReferences({
      stageDocument: geospatialStage,
      manifestSection: { 'map-token': validManifest['map-token'] },
    });

    expect(problems).toHaveLength(1);
    expect(problems[0]?.resourceId).toBe('map-layers');
    expect(problems[0]?.path).toEqual(['mapOptions', 'dataSourceAssetId']);
    expect(problems[0]?.message).toBe(
      'This stage uses a resource ("map-layers") that is not in the protocol.',
    );
  });

  it('reports every dangling reference when the manifest is empty', () => {
    const problems = findDanglingResourceReferences({
      stageDocument: geospatialStage,
    });

    expect(problems.map((problem) => problem.resourceId)).toEqual([
      'map-token',
      'map-layers',
    ]);
    expect(problems.map((problem) => problem.message)).toEqual([
      'This stage uses a resource ("map-token") that is not in the protocol.',
      'This stage uses a resource ("map-layers") that is not in the protocol.',
    ]);
  });

  it('reports a committed entry that does not satisfy the asset schema', () => {
    const problems = findDanglingResourceReferences({
      stageDocument: geospatialStage,
      manifestSection: {
        ...validManifest,
        'map-layers': { type: 'geojson', name: 'Layers' },
      },
    });

    expect(problems).toHaveLength(1);
    expect(problems[0]?.resourceId).toBe('map-layers');
    expect(problems[0]?.message).toContain(
      'The resource ("map-layers") this stage uses is not valid',
    );
    expect(problems[0]?.message).not.toContain('not in the protocol');
  });

  it('prefixes paths so the issues attribute to the owning stage section', () => {
    const stageSection = sectionId({ kind: 'stage', stageId: 'stage-1' });
    const sections: Record<string, SectionDoc> = {
      [sectionId({ kind: 'settings' })]: {
        name: 'Resources',
        schemaVersion: 8,
      },
      [sectionId({ kind: 'stageOrder' })]: { stages: ['stage-1'] },
      [stageSection]: geospatialStage,
      [sectionId({ kind: 'assets' })]: {},
    };

    const problems = findDanglingResourceReferences({
      stageDocument: geospatialStage,
      pathPrefix: ['stages', 0],
    });
    const attributed = attributeValidationIssues(
      problems.map((problem) => ({
        code: problem.code,
        path: [...problem.path],
        message: problem.message,
      })),
      sections,
      {},
      { sequence: 1n, hash: 'revision-1' },
    );

    expect(problems[0]?.path).toEqual([
      'stages',
      0,
      'mapOptions',
      'tokenAssetId',
    ]);
    expect(attributed.map((issue) => issue.sectionId)).toEqual([
      stageSection,
      stageSection,
    ]);
  });
});
