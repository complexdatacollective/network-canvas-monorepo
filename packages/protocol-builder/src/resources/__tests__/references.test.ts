import { describe, expect, it } from 'vitest';

import { assetSchema } from '@codaco/protocol-validation';
import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { readMessage } from '../../testing/i18n.ts';
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

/**
 * Entries the asset schema refuses, one per way it can refuse: a key that is
 * not there, a value of the wrong kind, a kind of resource that does not
 * exist, a setting no resource has, a rule of its own about how a source is
 * written, and something that is not an entry at all.
 */
const refusedEntries: readonly (readonly [string, unknown])[] = [
  ['a missing key', { type: 'geojson', name: 'Layers' }],
  [
    'a value of the wrong kind',
    { type: 'geojson', name: 'Layers', source: 42 },
  ],
  [
    'a kind of resource that does not exist',
    { type: 'spreadsheet', name: 'Layers', source: 'layers.csv' },
  ],
  [
    'a setting no resource has',
    {
      type: 'geojson',
      name: 'Layers',
      source: 'layers.geojson',
      projection: 'EPSG:4326',
    },
  ],
  [
    'a source that climbs out of the protocol',
    { type: 'geojson', name: 'Layers', source: '../layers.geojson' },
  ],
  ['nothing that is an entry at all', 'layers.geojson'],
];

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
    expect(readMessage(problems[0]?.message ?? '')).toBe(
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
    expect(problems.map((problem) => readMessage(problem.message))).toEqual([
      'This stage uses a resource ("map-token") that is not in the protocol.',
      'This stage uses a resource ("map-layers") that is not in the protocol.',
    ]);
  });

  it('reports a committed entry that is missing part of itself', () => {
    const problems = findDanglingResourceReferences({
      stageDocument: geospatialStage,
      manifestSection: {
        ...validManifest,
        'map-layers': { type: 'geojson', name: 'Layers' },
      },
    });

    expect(problems).toHaveLength(1);
    expect(problems[0]?.resourceId).toBe('map-layers');
    expect(readMessage(problems[0]?.message ?? '')).toBe(
      'This stage points at a resource ("map-layers") the protocol cannot read: part of its entry is missing.',
    );
    expect(readMessage(problems[0]?.message ?? '')).not.toContain(
      'not in the protocol',
    );
  });

  it('reports a committed entry that holds the wrong kind of value', () => {
    const problems = findDanglingResourceReferences({
      stageDocument: geospatialStage,
      manifestSection: {
        ...validManifest,
        'map-layers': { type: 'geojson', name: 'Layers', source: 42 },
      },
    });

    expect(problems).toHaveLength(1);
    expect(problems[0]?.resourceId).toBe('map-layers');
    expect(readMessage(problems[0]?.message ?? '')).toBe(
      'This stage points at a resource ("map-layers") the protocol cannot read: part of its entry holds the wrong kind of value.',
    );
  });

  /**
   * Whatever the schema refuses about an entry, the researcher reads this
   * package's words about it and never the validator's. Each entry below is
   * put through the same schema the code puts it through, and every sentence
   * the validator would have said about it is asserted absent from the message
   * the researcher sees — so a message built out of one fails here rather than
   * reaching a stage editor.
   */
  it.each(refusedEntries)(
    'never repeats the validator about an entry with %s',
    (_what, entry) => {
      const refusal = assetSchema.safeParse(entry);
      const problems = findDanglingResourceReferences({
        stageDocument: geospatialStage,
        manifestSection: { ...validManifest, 'map-layers': entry },
      });
      // Read the way the render sites read it, so the assertions below are
      // about the sentence a researcher meets rather than about the envelope
      // it travelled in.
      const message = readMessage(problems[0]?.message ?? '');

      // The entry has to be one the schema actually refuses, or the case would
      // pass by saying nothing at all.
      expect(refusal.success).toBe(false);
      expect(problems).toHaveLength(1);
      expect(message).toContain('"map-layers"');
      expect(message).not.toContain('Invalid input');
      expect(message).not.toMatch(/expected .+, received .+/);
      for (const issue of refusal.success ? [] : refusal.error.issues) {
        expect(message).not.toContain(issue.message);
      }
    },
  );

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
