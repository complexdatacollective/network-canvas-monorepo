import { stagger } from 'motion/react';
import { useEffect, useRef } from 'react';

import { useSafeAnimate } from '../../hooks/useSafeAnimate';

const TOTAL_STAGGER_DURATION = 0.8;
const MAX_STAGGER_DELAY = 0.1;

/**
 * Runs a one-time stagger entrance animation on mount.
 * Targets all `[data-stagger-item]` descendants within the scoped element.
 *
 * The per-item stagger delay is calculated as `TOTAL_STAGGER_DURATION / itemCount`,
 * clamped to a maximum of `MAX_STAGGER_DELAY`.
 *
 * When `animationKey` changes (and a previous value existed), `hasAnimatedRef` is
 * reset so the stagger entrance re-runs on the newly rendered items.
 *
 * @param enabled - Whether animation is enabled
 * @param itemCount - Number of items to animate (used to calculate stagger delay)
 * @param animationKey - When this value changes, the stagger entrance re-runs
 * @returns A ref to attach to the animation scope container
 */
/**
 * The selector the stagger animates. When `animationKey` is defined it is
 * scoped to items carrying the current key, so exiting items still in the DOM
 * (AnimatePresence `popLayout`) are left alone. The key is consumer data — a
 * search query, say — so quotes and backslashes are escaped rather than
 * breaking the attribute selector.
 */
export function staggerSelector(animationKey?: string | number): string {
  if (animationKey === undefined) return '[data-stagger-item]';
  const escaped = String(animationKey).replace(/["\\]/g, '\\$&');
  return `[data-stagger-item][data-stagger-key="${escaped}"]`;
}

export function useStaggerAnimation(
  enabled: boolean,
  itemCount: number,
  animationKey?: string | number,
) {
  const [scope, animate] = useSafeAnimate();
  const hasAnimatedRef = useRef(false);
  const prevAnimationKeyRef = useRef(animationKey);

  // Reset hasAnimatedRef when animationKey changes so the stagger re-runs
  if (
    animationKey !== prevAnimationKeyRef.current &&
    prevAnimationKeyRef.current !== undefined
  ) {
    hasAnimatedRef.current = false;
    prevAnimationKeyRef.current = animationKey;
  }

  useEffect(() => {
    if (!enabled || hasAnimatedRef.current || itemCount === 0) {
      return;
    }

    hasAnimatedRef.current = true;

    const staggerDelay = Math.min(
      TOTAL_STAGGER_DURATION / itemCount,
      MAX_STAGGER_DELAY,
    );

    const selector = staggerSelector(animationKey);

    const runAnimation = async () => {
      await animate(
        selector,
        { opacity: [0, 1], y: ['20%', '0%'], scale: [0.6, 1] },
        {
          type: 'spring',
          stiffness: 500,
          damping: 20,
          delay: stagger(staggerDelay),
        },
      );
    };

    void runAnimation();
  }, [animate, enabled, itemCount, animationKey]);

  return scope;
}
