import { describe, expect, it } from 'vitest';

import {
  isNetworkComposerStageMetadata,
  StageMetadataSchema,
} from '../stage-metadata.ts';

describe('StageMetadataSchema', () => {
  it('accepts DyadCensus tuples and NetworkComposer layout state', () => {
    const parsed = StageMetadataSchema.parse({
      dyad: [[0, 'node-1', 'node-2', true]],
      composer: { automaticLayout: false },
    });

    expect(parsed.dyad).toEqual([[0, 'node-1', 'node-2', true]]);
    expect(parsed.composer).toEqual({ automaticLayout: false });
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
});
