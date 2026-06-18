import { describe, expect, it } from 'vitest';

import { getEffectiveMinPercent } from '../useResizablePanel';

describe('getEffectiveMinPercent', () => {
  it('returns the percentage min when no pixel floor is set', () => {
    expect(getEffectiveMinPercent(10, 90, undefined, 800)).toBe(10);
  });

  it('returns the percentage min when the container is unmeasured', () => {
    expect(getEffectiveMinPercent(10, 90, 400, 0)).toBe(10);
  });

  it('converts the pixel floor to a percentage of the container', () => {
    // 400px of a 500px container = 80%, which exceeds the 10% floor.
    expect(getEffectiveMinPercent(10, 90, 400, 500)).toBe(80);
  });

  it('keeps the percentage min when it is larger than the pixel floor', () => {
    // 400px of a 2000px container = 20%, but min% is 25.
    expect(getEffectiveMinPercent(25, 90, 400, 2000)).toBe(25);
  });

  it('never exceeds max even when the pixel floor is larger than the container', () => {
    expect(getEffectiveMinPercent(10, 90, 1200, 800)).toBe(90);
  });
});
