'use client';

import {
  type AnimationScope,
  MotionConfigContext,
  MotionGlobalConfig,
  useAnimate,
} from 'motion/react';
import { useContext, useMemo } from 'react';

import { usePrefersReducedMotion } from '../reducedMotion';

type AnimateFn<T extends Element> = ReturnType<typeof useAnimate<T>>[1];

/**
 * Returns true when animations are disabled or motion should be reduced:
 * by Motion's global or `MotionConfig` skip, by the `AnimationProvider`
 * preference, or by a `MotionConfig` that forces `reducedMotion="always"` on
 * a subtree (Motion's components honour that, so their animations would not
 * run either).
 */
export function useShouldSkipAnimations(): boolean {
  const { reducedMotion, skipAnimations } = useContext(MotionConfigContext);
  const shouldReduceMotion = usePrefersReducedMotion();

  return (
    !!MotionGlobalConfig.skipAnimations ||
    !!skipAnimations ||
    reducedMotion === 'always' ||
    !!shouldReduceMotion
  );
}

/**
 * Drop-in replacement for Motion's `useAnimate` that respects
 * Motion's global, provider, and reduced-motion controls. Motion 12.43 applies
 * `skipAnimations` to animation timing, but the imperative API can still
 * create animation bookkeeping before committing the final state. WebKit
 * reports that work via `getAnimations()`, which breaks Playwright's element
 * stability check.
 *
 * When skipping, the final keyframe values are applied directly to the
 * element's inline style so visual state (e.g. selected borders) still
 * renders correctly without creating WAAPI animations.
 */
export function useSafeAnimate<T extends Element = HTMLDivElement>() {
  const [scope, animate] = useAnimate<T>();
  const shouldSkip = useShouldSkipAnimations();

  const safeAnimate = useMemo(() => {
    if (!shouldSkip) return animate;

    // eslint-disable-next-line @typescript-eslint/no-empty-function
    const voidFn = () => {};
    const noop = {
      stop: voidFn,
      cancel: voidFn,
      complete: voidFn,
      pause: voidFn,
      play: voidFn,
      // oxlint-disable-next-line unicorn/no-thenable -- Motion's animation handle is thenable; the noop must match that contract so `await animate(...)` resolves.
      then: (resolve?: () => void) => {
        resolve?.();
        return noop;
      },
      time: 0,
      speed: 1,
      startTime: null,
      state: 'finished' as const,
      duration: 0,
      attachTimeline: () => voidFn,
      flatten: voidFn,
    };

    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the noop stands in for Motion's overloaded animate function and returns a handle with the members callers use, which the overloads cannot be checked against
    return ((...args: Parameters<AnimateFn<T>>) => {
      const [elementOrSelector, keyframes] = args;

      if (
        (elementOrSelector instanceof HTMLElement ||
          elementOrSelector instanceof SVGElement) &&
        keyframes &&
        typeof keyframes === 'object' &&
        !Array.isArray(keyframes)
      ) {
        const el = elementOrSelector;
        for (const [prop, value] of Object.entries(keyframes)) {
          const finalValue = Array.isArray(value)
            ? value[value.length - 1]
            : value;
          if (
            typeof finalValue === 'string' ||
            typeof finalValue === 'number'
          ) {
            el.style.setProperty(
              prop.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`),
              String(finalValue),
            );
          }
        }
      }

      return noop;
    }) as unknown as AnimateFn<T>;
  }, [shouldSkip, animate]);

  return [scope, safeAnimate] as [AnimationScope<T>, AnimateFn<T>];
}
