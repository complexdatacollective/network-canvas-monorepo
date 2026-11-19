import { afterEach, describe, expect, it } from 'vitest';

import type { Stage } from '@codaco/protocol-validation';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import {
  closeStageDraft,
  publishStageDraft,
  readStageDraft,
} from '../stageDraftBeacon';

const fields = { label: { en: 'Name some people' } };
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- only the beacon reads it, and it reads nothing of a stage's shape
const stage = {
  id: 'stage-1',
  type: 'NameGenerator',
  ...fields,
} as unknown as Stage;

afterEach(() => {
  closeStageDraft();
});

describe('the stage draft the editor publishes', () => {
  it('is clean while the stage and the codebook are as the protocol holds them', () => {
    publishStageDraft(stage, fields, fields, true);

    expect(readStageDraft().dirty).toBe(false);
  });

  /**
   * The bug this guards: a rule changed under the quick-add picker was a
   * codebook change, and the beacon looked only at the stage's own fields — so
   * "Finished Editing" never appeared and leaving the editor lost nothing it
   * knew about.
   */
  it('is dirty when the only change is to the codebook', () => {
    const person = sectionId({ kind: 'codebookNode', typeId: 'person' });
    const codebook = {
      [person]: {
        base: { name: 'Person', variables: {} },
        edited: {
          name: 'Person',
          variables: { name: { name: 'name', validation: { required: true } } },
        },
      },
    };

    publishStageDraft(stage, fields, fields, true, undefined, codebook);

    expect(readStageDraft().dirty).toBe(true);
    expect(readStageDraft().codebook).toBe(codebook);
  });
});
