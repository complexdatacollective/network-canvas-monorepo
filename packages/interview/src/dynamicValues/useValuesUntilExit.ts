import { useCallback, useState } from 'react';

/**
 * Values for text about what a keyed transition shows. When the key changes,
 * the outgoing content stays on screen until its exit animation finishes, so
 * text naming it (a census prompt naming the pair) keeps the outgoing values
 * until then. Pass `onExitComplete` to the transition's `AnimatePresence`.
 */
export function useValuesUntilExit<T>(
  key: string,
  values: T,
): Readonly<{ values: T; onExitComplete: () => void }> {
  const [settled, setSettled] = useState({ key, values });
  const onExitComplete = useCallback(
    () => setSettled({ key, values }),
    [key, values],
  );
  return {
    values: settled.key === key ? values : settled.values,
    onExitComplete,
  };
}
