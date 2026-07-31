'use client';

import {
  type AnimationScope,
  MotionConfigContext,
  useAnimate,
  useReducedMotion,
} from 'motion/react';
import { useContext, useMemo } from 'react';

type AnimateFn<T extends Element> = ReturnType<typeof useAnimate<T>>[1];

/**
 * Returns true when Motion should not create animations.
 *
 * Motion's reduced-motion handling makes layout projection instant, but still
 * creates a transient projection transform before clearing it on a later
 * frame. Components that opt into layout projection should use this hook to
 * omit `layout`/`layoutId` entirely when motion is reduced or skipped.
 */
export function useShouldSkipAnimations(): boolean {
  const { reducedMotion, skipAnimations } = useContext(MotionConfigContext);
  const userPrefersReducedMotion = useReducedMotion();
  const shouldReduceMotion =
    reducedMotion === 'always' ||
    (reducedMotion !== 'never' && userPrefersReducedMotion);

  return !!skipAnimations || !!shouldReduceMotion;
}

/**
 * Drop-in replacement for Motion's `useAnimate` that respects
 * `MotionConfig.skipAnimations`. The imperative `useAnimate` API only
 * checks `reducedMotion`, not `skipAnimations`, so WAAPI animations
 * still fire (with instant timing) even when `skipAnimations` is true.
 * WebKit reports these zero-duration WAAPI animations via
 * `getAnimations()`, which breaks Playwright's element stability check.
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
      // biome-ignore lint/suspicious/noThenProperty: Motion's animation handle is thenable; the noop must match that contract so `await animate(...)` resolves.
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

    return ((...args: Parameters<AnimateFn<T>>) => {
      const [elementOrSelector, keyframes] = args;

      if (
        elementOrSelector instanceof Element &&
        keyframes &&
        typeof keyframes === 'object' &&
        !Array.isArray(keyframes)
      ) {
        const el = elementOrSelector as HTMLElement;
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
