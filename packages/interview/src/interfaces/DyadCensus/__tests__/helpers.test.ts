import { describe, expect, it } from 'vitest';

import {
  getStageMetadataResponse,
  isDyadCensusMetadata,
  matchEntry,
} from '../helpers';

describe('matchEntry', () => {
  it('matches a tuple for the same prompt and pair (either orientation)', () => {
    const matcher = matchEntry(1, ['a', 'b']);
    expect(matcher([1, 'a', 'b', true])).toBe(true);
    expect(matcher([1, 'b', 'a', false])).toBe(true);
  });

  it('does not match a tuple for a different prompt', () => {
    const matcher = matchEntry(1, ['a', 'b']);
    expect(matcher([0, 'a', 'b', true])).toBe(false);
  });
});

describe('getStageMetadataResponse', () => {
  it('reads a per-prompt positive answer back out of metadata', () => {
    const metadata = [[0, 'a', 'b', true]];
    expect(isDyadCensusMetadata(metadata)).toBe(true);
    expect(getStageMetadataResponse(metadata, 0, ['a', 'b'])).toEqual({
      exists: true,
      value: true,
    });
  });

  it('does not return a sibling prompt answer for this prompt', () => {
    const metadata = [[0, 'a', 'b', true]];
    expect(getStageMetadataResponse(metadata, 1, ['a', 'b'])).toEqual({
      exists: false,
      value: undefined,
    });
  });
});
