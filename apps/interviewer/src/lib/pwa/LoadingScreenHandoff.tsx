import { useEffect } from 'react';

import { removeLoadingScreen } from './loadingScreen';

// Hands off from index.html's static loader to React. Rendered beside the app
// at the root, so its effect runs only once the first screen has committed: a
// first render that suspends (the startup catalog still loading) commits
// nothing, and the loader stays up until it does. The two frames let that
// commit paint, so the loader cross-fades into the app rather than a blank root.
export function LoadingScreenHandoff() {
  useEffect(() => {
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(removeLoadingScreen);
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  return null;
}
