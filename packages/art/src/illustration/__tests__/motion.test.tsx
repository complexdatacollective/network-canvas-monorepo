import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useIllustrationClock } from '../motion';

const display = vi.hoisted(() => ({
  onFrame: undefined as ((time: number, delta: number) => void) | undefined,
  inView: true,
  reducedMotion: false,
}));

vi.mock('motion/react', () => ({
  useAnimationFrame: (callback: (time: number, delta: number) => void) => {
    display.onFrame = callback;
  },
  useInView: () => display.inView,
}));

vi.mock('@codaco/fresco-ui/reducedMotion', () => ({
  usePrefersReducedMotion: () => display.reducedMotion,
}));

/** Runs the display at `refreshRate` for `milliseconds`. */
function run(refreshRate: number, milliseconds: number) {
  const delta = 1000 / refreshRate;
  for (let elapsed = 0; elapsed < milliseconds; elapsed += delta) {
    act(() => display.onFrame?.(elapsed, delta));
  }
}

describe('useIllustrationClock', () => {
  beforeEach(() => {
    display.inView = true;
    display.reducedMotion = false;
  });

  it.each([60, 120, 240])(
    'ticks about 30 times a second on a %i Hz display, and keeps time',
    (refreshRate) => {
      let renders = 0;
      const { result } = renderHook(() => {
        renders += 1;
        return useIllustrationClock(0);
      });
      renders = 0;

      run(refreshRate, 2000);

      expect(renders).toBeGreaterThanOrEqual(55);
      expect(renders).toBeLessThanOrEqual(61);
      expect(result.current.time).toBeGreaterThan(1.9);
      expect(result.current.time).toBeLessThanOrEqual(2.01);
    },
  );

  it('carries on from where it was after time away', () => {
    const { result } = renderHook(() => useIllustrationClock(0));

    act(() => display.onFrame?.(60_000, 60_000));

    expect(result.current.time).toBeCloseTo(0.1);
  });

  it('holds still out of view', () => {
    display.inView = false;
    const { result } = renderHook(() => useIllustrationClock(3));

    run(60, 1000);

    expect(result.current.time).toBe(3);
  });

  it('holds the still time with reduced motion', () => {
    display.reducedMotion = true;
    const { result } = renderHook(() => useIllustrationClock(3, { from: 0 }));

    run(60, 1000);

    expect(result.current.time).toBe(3);
  });
});
