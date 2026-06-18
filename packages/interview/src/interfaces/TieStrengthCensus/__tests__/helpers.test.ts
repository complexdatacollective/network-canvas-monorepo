import { describe, expect, it } from 'vitest';

import { getTieStrengthHasEdge } from '../helpers';

describe('getTieStrengthHasEdge', () => {
  it("treats a shared-type edge as unanswered when this prompt's edgeVariable is unset", () => {
    // Two prompts share the same edge type but collect different edgeVariables
    // (e.g. closeness, trust). Prompt 0 created the edge with closeness set.
    // On prompt 1 (trust), the edge exists but trust is unset -> this prompt
    // must be considered UNANSWERED so the participant cannot advance without
    // selecting a value.
    expect(
      getTieStrengthHasEdge({
        edgeExists: true,
        edgeVariable: 'trust',
        edgeVariableValue: undefined,
        metadataExists: false,
      }),
    ).toBeNull();
  });

  it('treats the prompt as answered when its edgeVariable is set on the edge', () => {
    expect(
      getTieStrengthHasEdge({
        edgeExists: true,
        edgeVariable: 'trust',
        edgeVariableValue: 2,
        metadataExists: false,
      }),
    ).toBe(true);
  });

  it('treats an existing edge as answered when the prompt collects no edgeVariable', () => {
    expect(
      getTieStrengthHasEdge({
        edgeExists: true,
        edgeVariable: undefined,
        edgeVariableValue: undefined,
        metadataExists: false,
      }),
    ).toBe(true);
  });

  it('returns false when a negative answer was recorded in metadata', () => {
    expect(
      getTieStrengthHasEdge({
        edgeExists: false,
        edgeVariable: 'trust',
        edgeVariableValue: undefined,
        metadataExists: true,
      }),
    ).toBe(false);
  });

  it('returns null when the prompt is unanswered and no edge exists', () => {
    expect(
      getTieStrengthHasEdge({
        edgeExists: false,
        edgeVariable: 'trust',
        edgeVariableValue: undefined,
        metadataExists: false,
      }),
    ).toBeNull();
  });
});
