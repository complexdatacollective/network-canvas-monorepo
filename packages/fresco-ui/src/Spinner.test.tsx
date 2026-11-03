import { act, render } from '@testing-library/react';
import { MotionConfig } from 'motion/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { withAnimationsEnabled } from '@codaco/vitest-config/modern/with-animations-enabled';

import Spinner from './Spinner';

// Every animation the spinner starts takes CYCLE_MS of fake time, so a test
// counts the animations started over a stretch of time.
const CYCLE_MS = 100;
const starts = vi.fn();
const stops = vi.fn();

vi.mock('motion/react', async (importOriginal) => {
  const original = await importOriginal<typeof import('motion/react')>();
  return {
    ...original,
    useAnimationControls: () => ({
      start: () => {
        starts();
        return new Promise((resolve) => setTimeout(resolve, CYCLE_MS));
      },
      stop: stops,
      set: () => undefined,
      subscribe: () => () => undefined,
      mount: () => () => undefined,
    }),
  };
});

let focused = true;

beforeEach(() => {
  vi.useFakeTimers();
  starts.mockClear();
  stops.mockClear();
  focused = true;
  vi.spyOn(document, 'hasFocus').mockImplementation(() => focused);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

async function elapse(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function emulateFocus(next: boolean) {
  focused = next;
  window.dispatchEvent(new Event(next ? 'focus' : 'blur'));
  // The blur check runs a task later.
  await elapse(1);
}

describe('Spinner', () => {
  it('stops cycling while its window is not focused, and resumes when it returns', async () => {
    await withAnimationsEnabled(async () => {
      render(
        <MotionConfig reducedMotion="never">
          <Spinner />
        </MotionConfig>,
      );
      await elapse(CYCLE_MS * 3);
      expect(starts).toHaveBeenCalled();

      await emulateFocus(false);
      const whenPaused = starts.mock.calls.length;
      await elapse(CYCLE_MS * 5);
      expect(starts).toHaveBeenCalledTimes(whenPaused);

      await emulateFocus(true);
      await elapse(CYCLE_MS * 3);
      expect(starts.mock.calls.length).toBeGreaterThan(whenPaused);
    });
  });

  // A cycle that ends on its own is left alone: stopping one part-way never
  // settles the promise it awaits, so a hover spinner would stay marked as
  // animating and never play again, and a once spinner would play again.
  it.each(['once', 'hover'] as const)(
    'leaves a %s spinner alone when its window loses and regains focus',
    async (animationMode) => {
      await withAnimationsEnabled(async () => {
        render(
          <MotionConfig reducedMotion="never">
            <Spinner animationMode={animationMode} />
          </MotionConfig>,
        );
        const startedAtMount = starts.mock.calls.length;

        await emulateFocus(false);
        await emulateFocus(true);
        await elapse(CYCLE_MS * 3);

        expect(stops).not.toHaveBeenCalled();
        expect(starts).toHaveBeenCalledTimes(startedAtMount);
      });
    },
  );
});
