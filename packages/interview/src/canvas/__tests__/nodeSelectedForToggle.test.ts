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

  it('reports nothing on when activation toggles nothing', () => {
    // In a layout task activating a node toggles nothing, so the canvas
    // unwires activation entirely and no toggle is announced.
    expect(nodeSelectedForToggle(null, state({ highlighted: true }))).toBe(
      false,
    );
    expect(nodeSelectedForToggle(null, state({ isEdgeSource: true }))).toBe(
      false,
    );
  });
});
