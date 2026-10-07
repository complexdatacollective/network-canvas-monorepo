import { useEffect, useState } from 'react';

import { reportError } from '~/utils/reportError';

// The whole document goes full screen, not the element that should fill it:
// only the full-screen element's own subtree is drawn, and fresco-ui's menus,
// popovers and dialogs portal outside the page into a layer of their own. The
// page fills the screen by covering the rest of the app instead.
const isFullscreen = () =>
  document.fullscreenElement === document.documentElement;

/**
 * Whether the page fills the screen, and a way to change that. Leaving the
 * page leaves full screen too.
 */
export const useFullscreen = () => {
  const [active, setActive] = useState(isFullscreen);

  useEffect(() => {
    // Full screen also ends without this page asking, as when Escape is
    // pressed.
    const sync = () => setActive(isFullscreen());
    document.addEventListener('fullscreenchange', sync);
    sync();
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      if (isFullscreen()) document.exitFullscreen().catch(reportError);
    };
  }, []);

  const toggle = () => {
    const change = isFullscreen()
      ? document.exitFullscreen()
      : document.documentElement.requestFullscreen();
    change.catch(reportError);
  };

  return {
    supported: document.fullscreenEnabled,
    active,
    toggle,
  };
};
