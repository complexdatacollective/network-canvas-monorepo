'use client';

import { MotionConfig, MotionGlobalConfig } from 'motion/react';
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
   * Disable both Motion animations, layout animations included, and Base UI's
   * animation bookkeeping. Intended for deterministic automated hosts such as
   * Playwright and Storybook visual tests. Once set it stays set for the life
   * of the page, because Motion's layout animations read a page-wide flag.
   */
  disableAnimations?: boolean;
  /**
   * Detect browser automation and visual-test hosts, then disable animations.
   * Storybooks should prefer this over reimplementing WebDriver/Chromatic
   * detection in each preview.
   */
  disableAnimationsForAutomation?: boolean;
  /** How Motion should respond to the user's reduced-motion preference. */
  reducedMotion?: ReducedMotion;
};

function isAutomatedVisualHost(): boolean {
  if (typeof window === 'undefined') return false;

  return (
    window.navigator.webdriver ||
    /Chromatic/.test(window.navigator.userAgent) ||
    /(?:[?&])chromatic=true(?:[&#]|$)/.test(window.location.href) ||
    /(?:[?&])disableAnimations=1(?:[&#]|$)/.test(window.location.href)
  );
}

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
  disableAnimationsForAutomation = false,
  reducedMotion = 'user',
}: AnimationProviderProps) {
  const animationsDisabled =
    disableAnimations ||
    (disableAnimationsForAutomation && isAutomatedVisualHost());

  // This must happen synchronously, before descendants mount and register Base
  // UI transition callbacks. Automated hosts are long-lived and only move from
  // animations enabled to disabled, so intentionally keep both flags sticky.
  //
  // `MotionConfig`'s `skipAnimations` below is not enough for Motion on its
  // own: layout and `layoutId` animations run in Motion's projection engine,
  // which reads only the global flag. Without it a dialog opened from a row
  // that shares its `layoutId` still crossfades in, at an opacity an a11y
  // check reads as failed contrast.
  if (animationsDisabled) {
    globalThis.BASE_UI_ANIMATIONS_DISABLED = true;
    MotionGlobalConfig.skipAnimations = true;
  }

  return (
    <MotionConfig
      reducedMotion={reducedMotion}
      skipAnimations={animationsDisabled}
    >
      {children}
    </MotionConfig>
  );
}
