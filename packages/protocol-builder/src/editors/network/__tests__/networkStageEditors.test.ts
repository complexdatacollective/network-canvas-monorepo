import { describe, expect, it, vi } from 'vitest';

import { networkStageEditors } from '../../networkStageEditors.ts';
import { GeospatialStageEditor } from '../GeospatialStageEditor.tsx';
import { NarrativeStageEditor } from '../NarrativeStageEditor.tsx';
import { NetworkComposerStageEditor } from '../NetworkComposerStageEditor.tsx';
import { SociogramStageEditor } from '../SociogramStageEditor.tsx';

/**
 * The family's part reaches the geospatial editor, and therefore the map SDK.
 *
 * Nothing here renders a map — the claims below are identity comparisons — but
 * the module graph is what the package's static check reads, and a real
 * `mapbox-gl` anywhere in a test run is a billed request against a live
 * account. So the SDK is replaced here for the same reason it is replaced in
 * every other file that can reach it.
 */
vi.mock('mapbox-gl/esm', async () => {
  const { createMapboxMock } =
    await import('../../../fields/geospatial/__tests__/mapboxMock.ts');
  return createMapboxMock();
});

describe('the network and spatial editor family', () => {
  it('claims exactly the four interfaces it edits', () => {
    expect(Object.keys(networkStageEditors).toSorted()).toEqual([
      'Geospatial',
      'Narrative',
      'NetworkComposer',
      'Sociogram',
    ]);
  });

  /**
   * By identity, not by "is defined". A part holding the wrong editor for an
   * interface would open a sociogram's stage in a narrative's editor, and
   * every other check in this package would go on passing.
   */
  it('registers the editor that belongs to each interface', () => {
    expect(networkStageEditors.Narrative).toBe(NarrativeStageEditor);
    expect(networkStageEditors.Sociogram).toBe(SociogramStageEditor);
    expect(networkStageEditors.NetworkComposer).toBe(
      NetworkComposerStageEditor,
    );
    expect(networkStageEditors.Geospatial).toBe(GeospatialStageEditor);
  });
});
