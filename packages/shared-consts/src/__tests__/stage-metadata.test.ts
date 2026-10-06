import { describe, expect, it } from 'vitest';

import {
  isFamilyPedigreeStageMetadata,
  isNetworkComposerStageMetadata,
  StageMetadataSchema,
} from '../stage-metadata.ts';

describe('StageMetadataSchema', () => {
  it('accepts DyadCensus tuples, NetworkComposer layout state and a pedigree framing', () => {
    const parsed = StageMetadataSchema.parse({
      dyad: [[0, 'node-1', 'node-2', true]],
      composer: { automaticLayout: false },
      pedigree: { framing: 'gamete' },
    });

    expect(parsed.dyad).toEqual([[0, 'node-1', 'node-2', true]]);
    expect(parsed.composer).toEqual({ automaticLayout: false });
    expect(parsed.pedigree).toEqual({ framing: 'gamete' });
  });

  it('rejects an entry that is neither shape', () => {
    expect(StageMetadataSchema.safeParse({ stage: 'nope' }).success).toBe(
      false,
    );
  });

  it('guards only NetworkComposer metadata', () => {
    expect(isNetworkComposerStageMetadata({ automaticLayout: true })).toBe(
      true,
    );
    expect(isNetworkComposerStageMetadata({ automaticLayout: 'yes' })).toBe(
      false,
    );
    expect(isNetworkComposerStageMetadata([[0, 'a', 'b', true]])).toBe(false);
  });

  it('guards only FamilyPedigree metadata', () => {
    expect(isFamilyPedigreeStageMetadata({ framing: 'gendered' })).toBe(true);
    expect(isFamilyPedigreeStageMetadata({ framing: 'neutral' })).toBe(false);
    expect(isFamilyPedigreeStageMetadata({ automaticLayout: true })).toBe(
      false,
    );
  });
});
