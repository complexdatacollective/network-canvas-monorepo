import { describe, expect, it } from 'vitest';

import { networkStageEditors } from '../../networkStageEditors.ts';
import { NarrativeStageEditor } from '../NarrativeStageEditor.tsx';
import { NetworkComposerStageEditor } from '../NetworkComposerStageEditor.tsx';
import { SociogramStageEditor } from '../SociogramStageEditor.tsx';

describe('the network and spatial editor family', () => {
  it('claims exactly the interfaces it edits', () => {
    expect(Object.keys(networkStageEditors).toSorted()).toEqual([
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
  });
});
