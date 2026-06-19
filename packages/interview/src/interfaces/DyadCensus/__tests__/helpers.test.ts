import { describe, expect, it } from 'vitest';

import {
  getDyadHasEdge,
  getStageMetadataResponse,
  isDyadCensusMetadata,
  matchEntry,
} from '../helpers';

describe('getDyadHasEdge', () => {
  it('treats a shared-type edge with no per-prompt record as unanswered', () => {
    // Two DyadCensus prompts share createEdge:'friend'. Prompt 0 answered 'Yes'
    // for (A,B), creating the edge. On prompt 1 the edge exists, but prompt 1
    // has no per-prompt record -> it must read as UNANSWERED so the participant
    // cannot advance without independently answering it.
    expect(getDyadHasEdge({ exists: false, value: undefined })).toBeNull();
  });

  it('treats a per-prompt positive record as answered', () => {
    expect(getDyadHasEdge({ exists: true, value: true })).toBe(true);
  });

  it('treats a per-prompt negative record as answered (false)', () => {
    expect(getDyadHasEdge({ exists: true, value: false })).toBe(false);
  });
});

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
