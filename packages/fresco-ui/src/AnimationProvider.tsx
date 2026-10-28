'use client';

import { MotionConfig, MotionGlobalConfig } from 'motion/react';
import { type ReactNode, useContext, useMemo } from 'react';

import {
  ReducedMotionContext,
  type ReducedMotionSetting,
  useReducedMotionRootAttribute,
} from './reducedMotion';

declare global {
  // Base UI checks this flag before waiting for CSS animations to finish.
  // eslint-disable-next-line no-var
  var BASE_UI_ANIMATIONS_DISABLED: boolean;
}

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
  /**
   * Whether to reduce motion: `user` (the default) follows the operating
   * system's preference, `always` and `never` override it. Motion components,
   * `usePrefersReducedMotion`, `prefersReducedMotion`, the `motion-reduce:` /
   * `motion-safe:` variants and the global reduced-motion CSS all follow it.
   * It applies to the whole document, so only the outermost provider's value
   * counts; a nested provider inherits it and ignores its own.
   */
  reducedMotion?: ReducedMotionSetting;
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
 * animations before completing popup transitions. The provider also owns the
 * reduced-motion decision for everything beneath it, Motion or not (see
 * `./reducedMotion`). Automated hosts need both
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
    // oxlint-disable-next-line react/immutability -- must be set while rendering, before descendants mount (see above); an effect runs too late
    globalThis.BASE_UI_ANIMATIONS_DISABLED = true;
    // oxlint-disable-next-line react/immutability -- must be set while rendering, before descendants mount (see above); an effect runs too late
    MotionGlobalConfig.skipAnimations = true;
  }

  // One reduced-motion policy per document, decided by the outermost provider
  // (see `ReducedMotionContext`): a nested provider inherits it.
  const enclosing = useContext(ReducedMotionContext);
  const setting = enclosing.provided ? enclosing.setting : reducedMotion;
  const scope = useMemo(() => ({ setting, provided: true }), [setting]);
  useReducedMotionRootAttribute(setting, !enclosing.provided);

  return (
    <ReducedMotionContext.Provider value={scope}>
      <MotionConfig reducedMotion={setting} skipAnimations={animationsDisabled}>
        {children}
      </MotionConfig>
    </ReducedMotionContext.Provider>
  );
}
