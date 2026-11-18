import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createFakeDisplay } from '~/test/fakeDisplay';

import { useIllustrationClock } from '../illustrationMotion';

const surroundings = vi.hoisted(() => ({
  inView: true,
  reduceMotion: false as boolean | null,
}));

vi.mock('motion/react', () => ({
  useInView: () => surroundings.inView,
}));

vi.mock('@codaco/fresco-ui/reducedMotion', () => ({
  usePrefersReducedMotion: () => surroundings.reduceMotion,
}));

const STILL_TIME = 4;
function Illustration() {
  const { ref, time } = useIllustrationClock(STILL_TIME);
  return (
    <svg ref={ref} role="img" aria-label="clock">
      <title>{time.toFixed(3)}</title>
    </svg>
  );
}

const shownTime = () =>
  Number(screen.getByRole('img', { name: 'clock' }).textContent);

describe('useIllustrationClock', () => {
  let display: ReturnType<typeof createFakeDisplay>;

  beforeEach(() => {
    surroundings.inView = true;
    surroundings.reduceMotion = false;
    display = createFakeDisplay();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('keeps time with the display while redrawing thirty times a second', () => {
    render(<Illustration />);

    // Two seconds on a 120Hz display, one frame at a time.
    const drawn = new Set<number>();
    for (let frame = 0; frame < 240; frame += 1) {
      act(() => display.run(120, 1000 / 120));
      drawn.add(shownTime());
    }

    expect(shownTime() - STILL_TIME).toBeGreaterThan(1.9);
    expect(shownTime() - STILL_TIME).toBeLessThanOrEqual(2);
    expect(drawn.size).toBeGreaterThan(55);
    expect(drawn.size).toBeLessThan(65);
  });

  it('stops asking for frames while out of view', () => {
    surroundings.inView = false;
    render(<Illustration />);

    act(() => display.run(60, 1000));

    expect(shownTime()).toBe(STILL_TIME);
    expect(display.waiting()).toBe(0);
  });

  it('holds its still time under reduced motion', () => {
    surroundings.reduceMotion = true;
    render(<Illustration />);

    act(() => display.run(60, 1000));

    expect(shownTime()).toBe(STILL_TIME);
    expect(display.waiting()).toBe(0);
  });

  it('carries on from where it was after a long gap between frames', () => {
    render(<Illustration />);
    act(() => display.run(60, 1000));
    const before = shownTime();

    // One frame, a minute after the last: a tab that was in the background.
    act(() => display.run(1 / 60, 60_000));

    expect(shownTime() - before).toBeGreaterThan(0);
    expect(shownTime() - before).toBeLessThan(0.2);
  });
});
