import { useEffect, useState } from 'react';

const seen = new Set<string>();

/**
 * Returns true on the first call for a given key in this app session, false
 * thereafter. Useful for gating one-shot effects like entrance animations that
 * shouldn't replay when a component remounts (e.g. after navigation).
 *
 * Reset by a hard refresh, or by calling resetRunOnce().
 */
export const useRunOnce = (key: string): boolean => {
  const [isFirst] = useState(() => !seen.has(key));
  useEffect(() => {
    seen.add(key);
  }, [key]);
  return isFirst;
};

export const resetRunOnce = () => {
  seen.clear();
};

// Clear seen keys on HMR so designers iterating on animation values see them
// replay each save, rather than having to do a hard refresh.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    seen.clear();
  });
}
