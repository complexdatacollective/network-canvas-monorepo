import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createFakeDisplay } from '~/test/fakeDisplay';

import { startFrameLoop } from '../frameLoop';

describe('startFrameLoop', () => {
  let display: ReturnType<typeof createFakeDisplay>;

  beforeEach(() => {
    display = createFakeDisplay();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    { refreshRate: 60, expected: 30 },
    { refreshRate: 120, expected: 30 },
    { refreshRate: 240, expected: 30 },
    // A display slower than the limit is simply followed.
    { refreshRate: 24, expected: 24 },
  ])(
    'draws $expected frames a second on a $refreshRate Hz display when limited to 30',
    ({ refreshRate, expected }) => {
      const onFrame = vi.fn();
      startFrameLoop(onFrame, 30);

      display.run(refreshRate, 2000);

      // The first frame starts the clock, so two seconds hold one more call
      // than two seconds' worth of intervals.
      expect(onFrame.mock.calls.length).toBeGreaterThanOrEqual(
        expected * 2 - 1,
      );
      expect(onFrame.mock.calls.length).toBeLessThanOrEqual(expected * 2 + 1);
    },
  );

  it('reports the time since the frame before', () => {
    const elapsed: number[] = [];
    startFrameLoop((time) => elapsed.push(time), 30);

    display.run(60, 1000);

    expect(elapsed[0]).toBe(0);
    const total = elapsed.reduce((sum, time) => sum + time, 0);
    // Every skipped display frame is counted in the next drawn one.
    expect(total).toBeGreaterThan(950);
    expect(total).toBeLessThanOrEqual(1000);
    for (const time of elapsed.slice(1)) expect(time).toBeCloseTo(1000 / 30, 3);
  });

  it('stops asking for frames once stopped', () => {
    const onFrame = vi.fn();
    const stop = startFrameLoop(onFrame, 30);
    display.run(60, 500);
    const calls = onFrame.mock.calls.length;
    expect(calls).toBeGreaterThan(0);

    stop();
    display.run(60, 500);

    expect(onFrame.mock.calls.length).toBe(calls);
    expect(display.waiting()).toBe(0);
  });
});
