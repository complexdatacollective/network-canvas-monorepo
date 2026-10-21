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

  it('accepts a pedigree record of who holds a generated label, with or without a framing', () => {
    // Node ID to a fingerprint of the stored name value.
    const parsed = StageMetadataSchema.parse({
      chosen: {
        framing: 'gendered',
        generatedLabels: { 'node-1': 'K1x0dYhGf8wS2rTq' },
      },
      fixed: { generatedLabels: { 'node-1': 'pQ7v_3mZ-a9bLc0e' } },
      emptied: { generatedLabels: {} },
    });

    expect(parsed.chosen).toEqual({
      framing: 'gendered',
      generatedLabels: { 'node-1': 'K1x0dYhGf8wS2rTq' },
    });
    expect(parsed.fixed).toEqual({
      generatedLabels: { 'node-1': 'pQ7v_3mZ-a9bLc0e' },
    });
    // Everyone named since: the record is kept, empty.
    expect(parsed.emptied).toEqual({ generatedLabels: {} });
  });

  it('guards only FamilyPedigree metadata', () => {
    expect(isFamilyPedigreeStageMetadata({ framing: 'gendered' })).toBe(true);
    expect(
      isFamilyPedigreeStageMetadata({ generatedLabels: { a: 'K1x0dYhGf8w' } }),
    ).toBe(true);
    // The stand-ins the stage generated, alone.
    expect(isFamilyPedigreeStageMetadata({ standIns: ['a'] })).toBe(true);
    expect(isFamilyPedigreeStageMetadata({ standIns: [1] })).toBe(false);
    expect(isFamilyPedigreeStageMetadata({ framing: 'neutral' })).toBe(false);
    expect(isFamilyPedigreeStageMetadata({ generatedLabels: { a: 1 } })).toBe(
      false,
    );
    // A list of node IDs is not the record.
    expect(isFamilyPedigreeStageMetadata({ generatedLabels: ['a'] })).toBe(
      false,
    );
    expect(isFamilyPedigreeStageMetadata([[0, 'a', 'b', true]])).toBe(false);
    expect(isFamilyPedigreeStageMetadata({ automaticLayout: true })).toBe(
      false,
    );
    expect(isFamilyPedigreeStageMetadata({})).toBe(false);
  });
});
