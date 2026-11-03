'use client';

import { useEffect, useSyncExternalStore } from 'react';

/**
 * Whether the page is in front of the user: visible and, for a top-level
 * page, focused.
 *
 * A browser already stops rendering a page it reports hidden (a minimised
 * window, a background tab, another desktop). It renders a page it reports
 * visible at full frame rate, focused or not, so an installed app left open
 * beside the one being used keeps every animation running. Endless animation
 * — decorative loops, spinners, ambient backgrounds — should run only while
 * this answers `true`; an animation that ends on its own may be left to
 * finish.
 *
 * Motion's `usePageInView` reads visibility alone, so it misses exactly that
 * case: a window on screen that is not focused.
 *
 * Only a top-level page consults focus. A frame's document loses focus
 * whenever the page around it has it (a Storybook canvas while its sidebar is
 * used), and the page around it is the one in front of the user. Without a
 * DOM it answers `true`.
 */
export function isPageActive(): boolean {
  if (typeof document === 'undefined') return true;
  if (document.visibilityState === 'hidden') return false;
  return window.top !== window.self || document.hasFocus();
}

/**
 * Calls `onChange` with the new answer each time `isPageActive()` changes.
 * Returns the unsubscribe function. For code outside React; components use
 * `usePageActive`.
 */
export function subscribeToPageActivity(
  onChange: (active: boolean) => void,
): () => void {
  if (typeof document === 'undefined') return () => undefined;

  let active = isPageActive();
  let deferred: ReturnType<typeof setTimeout> | undefined;

  const check = () => {
    const next = isPageActive();
    if (next === active) return;
    active = next;
    onChange(next);
  };
  // Focus moving into a frame on this page blurs the window although the page
  // as a whole keeps focus; `hasFocus()` has caught up by the next task.
  const checkAfterBlur = () => {
    clearTimeout(deferred);
    deferred = setTimeout(check, 0);
  };

  document.addEventListener('visibilitychange', check);
  window.addEventListener('focus', check);
  window.addEventListener('blur', checkAfterBlur);

  return () => {
    clearTimeout(deferred);
    document.removeEventListener('visibilitychange', check);
    window.removeEventListener('focus', check);
    window.removeEventListener('blur', checkAfterBlur);
  };
}

const serverSnapshot = () => true;

/** `isPageActive()`, re-rendering the component when it changes. */
export function usePageActive(): boolean {
  return useSyncExternalStore(
    subscribeToPageActivity,
    isPageActive,
    serverSnapshot,
  );
}

const endsNever = (animation: Animation) =>
  animation.effect?.getComputedTiming().endTime === Infinity;

/**
 * Pauses every endless CSS or Web Animations API animation in the document
 * while the page is inactive, and resumes the ones it paused when the page
 * returns. Animations that end on their own are left to finish. Mounted once
 * per document by the outermost `AnimationProvider`.
 *
 * JavaScript-driven loops (a `requestAnimationFrame` loop, or a Motion
 * animation Motion runs on its own frame loop) are invisible to the document's
 * animation list and gate themselves with `usePageActive`.
 */
export function usePauseEndlessAnimationsWhileInactive(enabled: boolean) {
  useEffect(() => {
    if (!enabled || typeof document.getAnimations !== 'function') {
      return undefined;
    }

    const paused = new Set<Animation>();
    const pauseEndless = () => {
      for (const animation of document.getAnimations()) {
        if (animation.playState === 'running' && endsNever(animation)) {
          animation.pause();
          paused.add(animation);
        }
      }
    };
    const resume = () => {
      for (const animation of paused) {
        if (animation.playState === 'paused') animation.play();
      }
      paused.clear();
    };
    // A CSS animation that starts while the page is inactive, on an element
    // that mounts or changes class then, is caught as it starts.
    const pauseLateStarter = () => {
      if (!isPageActive()) pauseEndless();
    };

    if (!isPageActive()) pauseEndless();
    const unsubscribe = subscribeToPageActivity((active) => {
      if (active) resume();
      else pauseEndless();
    });
    document.addEventListener('animationstart', pauseLateStarter);

    return () => {
      unsubscribe();
      document.removeEventListener('animationstart', pauseLateStarter);
      resume();
    };
  }, [enabled]);
}
