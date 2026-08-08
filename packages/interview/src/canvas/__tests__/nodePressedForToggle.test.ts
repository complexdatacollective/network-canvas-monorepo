import { describe, expect, it } from 'vitest';

import { nodePressedForToggle } from '../Canvas';

const state = (
  over: Partial<{ highlighted: boolean; isEdgeSource: boolean }> = {},
) => ({
  highlighted: false,
  isEdgeSource: false,
  ...over,
});

describe('nodePressedForToggle', () => {
  it('follows the pending edge source for an edge prompt', () => {
    expect(nodePressedForToggle('edge', state())).toBe(false);
    expect(nodePressedForToggle('edge', state({ isEdgeSource: true }))).toBe(
      true,
    );
  });

  it('follows the highlight attribute for a highlight prompt', () => {
    expect(nodePressedForToggle('highlight', state())).toBe(false);
    expect(
      nodePressedForToggle('highlight', state({ highlighted: true })),
    ).toBe(true);
  });

  it('says nothing for a display-only prompt', () => {
    // A prompt may set highlight.variable purely to colour nodes while leaving
    // allowHighlighting off. Activating such a node does nothing, so announcing
    // it as a toggle would promise an action that never happens.
    expect(
      nodePressedForToggle(null, state({ highlighted: true })),
    ).toBeUndefined();
    expect(
      nodePressedForToggle(null, state({ isEdgeSource: true })),
    ).toBeUndefined();
  });
});
