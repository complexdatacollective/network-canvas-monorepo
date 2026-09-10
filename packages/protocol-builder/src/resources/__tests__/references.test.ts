import { describe, expect, it } from 'vitest';

import type { SectionDoc } from '@codaco/studio-sync/apply';

import { collectStageResourceReferences } from '../references.ts';

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
