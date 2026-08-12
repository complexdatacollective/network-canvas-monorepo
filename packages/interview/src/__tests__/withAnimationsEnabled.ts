import { MotionGlobalConfig } from 'motion/react';

/**
 * Temporarily restore real Motion timing for tests that explicitly exercise
 * animation-driven behaviour. The shared Vitest setup disables Motion by
 * default, so every opt-out must restore the previous value even when the test
 * fails.
 */
export async function withAnimationsEnabled<T>(
  callback: () => T | Promise<T>,
): Promise<T> {
  const previousValue = MotionGlobalConfig.skipAnimations;
  MotionGlobalConfig.skipAnimations = false;

  try {
    return await callback();
  } finally {
    MotionGlobalConfig.skipAnimations = previousValue;
  }
}
