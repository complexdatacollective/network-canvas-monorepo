'use client';

import { MotionConfig } from 'motion/react';
import type { ComponentProps, ReactNode } from 'react';

declare global {
  // Base UI checks this flag before waiting for CSS animations to finish.
  // eslint-disable-next-line no-var
  var BASE_UI_ANIMATIONS_DISABLED: boolean;
}

type ReducedMotion = ComponentProps<typeof MotionConfig>['reducedMotion'];

export type AnimationProviderProps = {
  children: ReactNode;
  /**
   * Disable both Motion animations and Base UI's animation bookkeeping.
   * Intended for deterministic automated hosts such as Playwright and
   * Storybook visual tests.
   */
  disableAnimations?: boolean;
  /** How Motion should respond to the user's reduced-motion preference. */
  reducedMotion?: ReducedMotion;
};

/**
 * Coordinates the animation controls used by Fresco applications.
 *
 * Motion owns JavaScript-driven animation while Base UI waits for CSS
 * animations before completing popup transitions. Automated hosts need both
 * systems disabled together; setting only one still leaves timing-dependent
 * work behind.
 */
export function AnimationProvider({
  children,
  disableAnimations = false,
  reducedMotion = 'user',
}: AnimationProviderProps) {
  // This must happen synchronously, before descendants mount and register Base
  // UI transition callbacks. Automated hosts are long-lived and only move from
  // animations enabled to disabled, so intentionally keep the flag sticky.
  if (disableAnimations) {
    globalThis.BASE_UI_ANIMATIONS_DISABLED = true;
  }

  return (
    <MotionConfig
      reducedMotion={reducedMotion}
      skipAnimations={disableAnimations}
    >
      {children}
    </MotionConfig>
  );
}
