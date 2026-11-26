import { describe, expect, it } from 'vitest';

import type { SectionDoc } from '@codaco/studio-sync/apply';

import { testTypeId } from '../../testing/testId.ts';
import { collectStageResourceReferences } from '../references.ts';

const geospatialStage: SectionDoc = {
  id: 'stage-1',
  type: 'Geospatial',
  label: 'Where do you meet?',
  subject: { entity: 'node', types: [testTypeId('person')] },
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

  it('finds each file an Information page names as a block in its text', () => {
    expect(
      collectStageResourceReferences({
        id: 'stage-3',
        type: 'Information',
        label: 'Welcome',
        content: {
          en: '# Welcome\n\n![A map](asset:map-1)\n\n![](asset:song-1?autoplay=false)',
        },
      }).map(({ resourceId }) => resourceId),
    ).toEqual(['map-1', 'song-1']);
  });

  it('finds a file whose address is written with its colon escaped, which the interview shows all the same', () => {
    expect(
      collectStageResourceReferences({
        id: 'stage-3',
        type: 'Information',
        label: 'Welcome',
        content: {
          en: '![A map](asset\\:map-1)',
          fr: '![Une carte](asset&#58;map-2)',
        },
      }).map(({ resourceId }) => resourceId),
    ).toEqual(['map-1', 'map-2']);
  });

  it('finds nothing in a stage that uses no resources', () => {
    expect(
      collectStageResourceReferences({
        id: 'stage-2',
        type: 'Information',
        label: 'Welcome',
        content: 'Welcome',
      }),
    ).toEqual([]);
  });
});
