import { describe, expect, it } from 'vitest';

import { nodeSelectedForToggle } from '../Canvas';

const state = (
  over: Partial<{ highlighted: boolean; isEdgeSource: boolean }> = {},
) => ({
  highlighted: false,
  isEdgeSource: false,
  ...over,
});

describe('nodeSelectedForToggle', () => {
  it('follows the pending edge source for an edge prompt', () => {
    expect(nodeSelectedForToggle('edge', state())).toBe(false);
    expect(nodeSelectedForToggle('edge', state({ isEdgeSource: true }))).toBe(
      true,
    );
  });

  it('follows the highlight attribute for a highlight prompt', () => {
    expect(nodeSelectedForToggle('highlight', state())).toBe(false);
    expect(
      nodeSelectedForToggle('highlight', state({ highlighted: true })),
    ).toBe(true);
  });

  it('reports nothing on for a display-only prompt', () => {
    // A prompt may set highlight.variable purely to colour nodes while leaving
    // allowHighlighting off. Activating such a node does nothing — the canvas
    // also unwires activation entirely, so no toggle is announced.
    expect(nodeSelectedForToggle(null, state({ highlighted: true }))).toBe(
      false,
    );
    expect(nodeSelectedForToggle(null, state({ isEdgeSource: true }))).toBe(
      false,
    );
  });
});
