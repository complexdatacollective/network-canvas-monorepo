import { describe, expect, it } from 'vitest';

import { clampFrameDelta } from '../frameDelta';

describe('clampFrameDelta', () => {
  it('passes a normal per-frame delta through unchanged', () => {
    expect(clampFrameDelta(1 / 60)).toBe(1 / 60);
  });

  it('leaves a slow but plausible frame delta unchanged', () => {
    expect(clampFrameDelta(1 / 30)).toBe(1 / 30);
  });

  it('caps a multi-minute gap (a backgrounded tab resuming) to a small step', () => {
    const capped = clampFrameDelta(600);
    expect(capped).toBeLessThanOrEqual(1 / 30);
    // Any long gap clamps to the same ceiling, so a resumed frame can never
    // teleport by a wall-clock-proportional distance.
    expect(capped).toBe(clampFrameDelta(10));
  });
});
