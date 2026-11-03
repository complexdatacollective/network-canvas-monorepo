import { act, render } from '@testing-library/react';
import { MotionConfig } from 'motion/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { withAnimationsEnabled } from '@codaco/vitest-config/modern/with-animations-enabled';

import Spinner from './Spinner';

// Every animation the spinner starts takes CYCLE_MS of fake time, so a test
// counts the animations started over a stretch of time.
const CYCLE_MS = 100;
const starts = vi.fn();

vi.mock('motion/react', async (importOriginal) => {
  const original = await importOriginal<typeof import('motion/react')>();
  return {
    ...original,
    useAnimationControls: () => ({
      start: () => {
        starts();
        return new Promise((resolve) => setTimeout(resolve, CYCLE_MS));
      },
      stop: () => undefined,
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
});
