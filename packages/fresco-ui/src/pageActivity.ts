'use client';

import { useSyncExternalStore } from 'react';

/**
 * Whether the page is in front of the user: visible and, for a top-level
 * page, focused. Only a top-level page consults focus. A frame's document
 * loses focus whenever the page around it has it (a Storybook canvas while its
 * sidebar is used), and the page around it is the one in front of the user.
 * Without a DOM it answers `true`.
 */
function isPageActive(): boolean {
  if (typeof document === 'undefined') return true;
  if (document.visibilityState === 'hidden') return false;
  return window.top !== window.self || document.hasFocus();
}

function subscribeToPageActivity(onChange: () => void): () => void {
  if (typeof document === 'undefined') return () => undefined;

  let deferred: ReturnType<typeof setTimeout> | undefined;
  // Focus moving into a frame on this page blurs the window although the page
  // as a whole keeps focus; `hasFocus()` has caught up by the next task.
  const changeAfterBlur = () => {
    clearTimeout(deferred);
    deferred = setTimeout(onChange, 0);
  };

  document.addEventListener('visibilitychange', onChange);
  window.addEventListener('focus', onChange);
  window.addEventListener('blur', changeAfterBlur);

  return () => {
    clearTimeout(deferred);
    document.removeEventListener('visibilitychange', onChange);
    window.removeEventListener('focus', onChange);
    window.removeEventListener('blur', changeAfterBlur);
  };
}

const serverSnapshot = () => true;

/**
 * Whether the page is in front of the user: visible and, for a top-level
 * page, focused. Re-renders the component when that changes.
 *
 * A browser stops rendering a page it reports hidden (a minimised window, a
 * background tab, another desktop), but renders a visible one at full frame
 * rate whether or not its window is focused, so an installed app left open
 * beside the one being used keeps animating. An ambient animation that never
 * ends can use this to pause while nobody is looking at it.
 *
 * Motion's `usePageInView` reads visibility alone, so it misses exactly that
 * case: a window on screen that is not focused.
 */
export function usePageActive(): boolean {
  return useSyncExternalStore(
    subscribeToPageActivity,
    isPageActive,
    serverSnapshot,
  );
}
